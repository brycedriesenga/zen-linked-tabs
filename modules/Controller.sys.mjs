import { splitTabsFor, usablePair, pairIsVisible } from "./Policy.sys.mjs";
import { attach, detach, publish } from "./Runtime.sys.mjs";

const ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="context-fill" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M12 4v5m0 6v5M7 12h10m-3-3 3 3-3 3"/></svg>');

export class LinkedTabsController {
  constructor(win) {
    this.win = win;
    this.pairs = [];
    this.nodes = [];
    this.paneControls = new Map();
    this.routingError = null;
    this.abort = new win.AbortController();
    this.destroyed = false;
  }

  init() {
    const win = this.win;
    const doc = win.document;
    const make = (tag, attrs = {}, parent) => {
      const node = doc.createXULElement(tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (parent) parent.appendChild(node);
      else this.nodes.push(node);
      return node;
    };
    const on = (node, type, fn) => node.addEventListener(type, fn, { signal: this.abort.signal });
    this.make = make;
    this.on = on;
    this.button = make("toolbarbutton", {
      id: "zen-linked-tabs-button", class: "toolbarbutton-1 chromeclass-toolbar-additional",
      label: "Linked Tabs", tooltiptext: "Linked Tabs: create a two-tab split first",
      image: ICON, type: "menu"
    });
    const toolbar = doc.getElementById("nav-bar-customization-target") || doc.getElementById("nav-bar");
    // The per-pane header is the primary UI; the global toolbar is optional.
    toolbar?.appendChild(this.button);
    const popup = make("menupopup", {}, this.button);
    this.linkItem = make("menuitem", { label: "Send this pane’s links → other pane" }, popup);
    this.reverseItem = make("menuitem", { label: "Reverse link direction" }, popup);
    this.unlinkItem = make("menuitem", { label: "Unlink these tabs" }, popup);
    on(this.linkItem, "command", () => this.link(win.gBrowser.selectedTab));
    on(this.reverseItem, "command", () => this.reverse(win.gBrowser.selectedTab));
    on(this.unlinkItem, "command", () => this.unlink(win.gBrowser.selectedTab));
    on(popup, "popupshowing", () => this.refresh());

    const tabMenu = doc.getElementById("tabContextMenu");
    if (tabMenu) {
      this.contextItem = make("menuitem", { id: "zen-linked-tabs-context", label: "Send this pane’s links → other pane" });
      tabMenu.appendChild(this.contextItem);
      on(tabMenu, "popupshowing", event => {
        if (event.target !== tabMenu) return;
        const tab = win.TabContextMenu?.contextTab || win.gBrowser.selectedTab;
        const pair = this.pairFor(tab);
        this.contextItem.setAttribute("label", pair ? "Unlink these tabs" : "Send this pane’s links → other pane");
        this.contextItem.disabled = !pair && !this.canLink(tab);
      });
      on(this.contextItem, "command", () => {
        const tab = win.TabContextMenu?.contextTab || win.gBrowser.selectedTab;
        if (this.pairFor(tab)) this.unlink(tab);
        else this.link(tab);
      });
    }

    const commandset = make("commandset", { id: "zen-linked-tabs-commands" });
    const command = make("command", { id: "zen-linked-tabs-toggle-command" }, commandset);
    on(command, "command", () => {
      const tab = win.gBrowser.selectedTab;
      if (this.pairFor(tab)) this.unlink(tab);
      else this.link(tab);
    });
    doc.documentElement.appendChild(commandset);
    const keyset = make("keyset", { id: "zen-linked-tabs-keys" });
    make("key", { key: "L", modifiers: "accel,alt,shift", command: "zen-linked-tabs-toggle-command" }, keyset);
    doc.documentElement.appendChild(keyset);

    const refresh = () => this.refresh();
    for (const type of ["TabSelect", "TabClose", "TabMove", "TabGrouped", "TabUngrouped", "TabAttrModified", "TabRemotenessChange", "TabBrowserInserted"]) {
      on(win.gBrowser.tabContainer, type, refresh);
    }
    for (const type of ["ZenSplitViewTabsSplit", "ZenTabRemovedFromSplit",
      "ZenViewSplitter:SplitViewActivated", "ZenViewSplitter:SplitViewDeactivated", "ZenWorkspaceChanged"]) on(win, type, refresh);
    this.observer = new win.MutationObserver(refresh);
    this.observer.observe(win.gBrowser.tabContainer, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["split-view", "split-view-group", "usercontextid"]
    });
    // Native split headers are created/replaced in tabpanels, outside tabContainer.
    this.observer.observe(win.gBrowser.tabpanels, { childList: true, subtree: true });
    try {
      attach(this);
    } catch (error) {
      this.routingError = String(error);
      console.error("[Linked Tabs] Routing initialization failed", error);
    }
    this.refresh();
  }

  syncPaneControls() {
    const tabs = Array.from(this.win.gBrowser.tabs);
    const headerFor = tab => tab.linkedBrowser?.closest(".browserSidebarContainer")?.querySelector(".zen-view-splitter-header");
    for (const [tab, ui] of this.paneControls) {
      if (!tabs.includes(tab) || !ui.button.isConnected || ui.button.parentNode !== headerFor(tab)) {
        ui.button.remove();
        this.nodes = this.nodes.filter(node => node !== ui.button);
        this.paneControls.delete(tab);
      }
    }
    for (const tab of tabs) {
      if (this.paneControls.has(tab)) continue;
      const header = headerFor(tab);
      if (!header) continue;
      const button = this.make("toolbarbutton", {
        class: "zen-linked-tabs-pane-button", label: "Linked Tabs",
        "aria-label": "Linked Tabs", image: ICON, type: "menu"
      });
      // Alongside the native drag handle and unsplit button.
      header.insertBefore(button, header.querySelector(".zen-tab-unsplit-button"));
      const popup = this.make("menupopup", {}, button);
      const status = this.make("menuitem", { disabled: "true", label: "Linked Tabs" }, popup);
      this.make("menuseparator", {}, popup);
      const link = this.make("menuitem", { label: "Open this pane’s links in the other pane" }, popup);
      const reverse = this.make("menuitem", { label: "Reverse link direction" }, popup);
      const unlink = this.make("menuitem", { label: "Unlink tabs" }, popup);
      const ui = { button, popup, status, link, reverse, unlink };
      // Bind to this pane, not the selected tab: hovering needn't select a pane.
      this.on(link, "command", () => this.link(tab));
      this.on(reverse, "command", () => this.reverse(tab));
      this.on(unlink, "command", () => this.unlink(tab));
      this.on(popup, "popupshowing", event => {
        if (event.target === popup) this.updatePaneMenu(tab, ui);
      });
      this.paneControls.set(tab, ui);
    }
    for (const [tab, ui] of this.paneControls) this.updatePaneMenu(tab, ui);
  }

  updatePaneMenu(tab, ui) {
    const pair = this.pairFor(tab);
    const role = pair ? (pair.source === tab ? "source" : "destination") : "";
    const status = this.routingError ? "Linked Tabs could not start — see Browser Console" :
      role === "source" ? "Source pane → links open in the other pane" :
      role === "destination" ? "Destination pane ← receives links from the other pane" :
      this.canLink(tab) ? "Tabs are not linked" : "Requires two tabs in the same container";
    ui.button.setAttribute("zen-linked-tabs-role", role);
    ui.button.setAttribute("tooltiptext", "Linked Tabs: " + status);
    ui.status.setAttribute("label", status);
    ui.link.setAttribute("label", role === "destination" ? "Use this pane as the source" : "Open this pane’s links in the other pane");
    ui.link.disabled = !this.canLink(tab) || role === "source";
    ui.reverse.disabled = !pair || !!this.routingError;
    ui.unlink.disabled = !pair;
  }

  pairFor(tab) { return this.pairs.find(pair => pair.source === tab || pair.target === tab); }

  canLink(tab) {
    if (this.routingError) return false;
    const tabs = splitTabsFor(this.win, tab);
    return tabs.length === 2 && usablePair(this.win, tab, tabs.find(other => other !== tab));
  }

  link(source) {
    if (!this.canLink(source)) return false;
    const target = splitTabsFor(this.win, source).find(tab => tab !== source);
    this.pairs = this.pairs.filter(pair => ![source, target].includes(pair.source) && ![source, target].includes(pair.target));
    this.pairs.push({ source, target, token: Services.uuid.generateUUID().toString() });
    this.refresh();
    return true;
  }

  reverse(tab) {
    const pair = this.pairFor(tab);
    if (pair) this.link(pair.target);
  }

  unlink(tab) {
    const pair = this.pairFor(tab);
    this.pairs = this.pairs.filter(candidate => candidate !== pair);
    this.refresh();
  }

  routes() {
    const routes = {};
    if (this.destroyed || this.routingError) return routes;
    for (const pair of this.pairs) {
      if (pairIsVisible(this.win, pair)) {
        const id = pair.source.linkedBrowser.browsingContext?.id;
        if (id) routes[id] = { token: pair.token };
      }
    }
    return routes;
  }

  destinationFor(browser, token) {
    if (this.destroyed || this.routingError) return null;
    const pair = this.pairs.find(item => item.source.linkedBrowser === browser && item.token === token);
    return pair && pairIsVisible(this.win, pair) ? pair.target.linkedBrowser : null;
  }

  refresh() {
    if (this.destroyed) return;
    this.pairs = this.pairs.filter(pair => usablePair(this.win, pair.source, pair.target));
    for (const tab of this.win.gBrowser.tabs) tab.removeAttribute("zen-linked-tabs-role");
    for (const pair of this.pairs) {
      pair.source.setAttribute("zen-linked-tabs-role", "source");
      pair.target.setAttribute("zen-linked-tabs-role", "destination");
    }
    const tab = this.win.gBrowser.selectedTab;
    const pair = this.pairFor(tab);
    const role = pair ? (pair.source === tab ? "source" : "destination") : "";
    this.button.setAttribute("zen-linked-tabs-role", role);
    this.button.setAttribute("tooltiptext", role ?
      `Linked Tabs: ${role} pane. ${pair.source.label} → ${pair.target.label}` :
      (this.canLink(tab) ? "Linked Tabs: choose the source pane, then link it" : "Linked Tabs: create a two-tab split first"));
    this.linkItem.disabled = !this.canLink(tab) || role === "source";
    this.reverseItem.disabled = !pair;
    this.unlinkItem.disabled = !pair;
    if (this.routingError) this.button.setAttribute("tooltiptext", "Linked Tabs could not start — see Browser Console");
    this.syncPaneControls();
    this.win.ZenLinkedTabsStatus = {
      version: "0.2.0", phase: this.routingError ? "error" : "ready",
      paneControls: this.paneControls.size, pairs: this.pairs.length,
      ...(this.routingError ? { error: this.routingError } : {})
    };
    publish();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.observer?.disconnect();
    for (const tab of this.win.gBrowser.tabs) tab.removeAttribute("zen-linked-tabs-role");
    for (const node of this.nodes) node.remove();
    this.nodes = [];
    this.paneControls.clear();
    this.pairs = [];
    detach(this);
    if (this.win.ZenLinkedTabs === this) delete this.win.ZenLinkedTabs;
    this.win.ZenLinkedTabsStatus = { version: "0.2.0", phase: "disabled" };
  }
}
