import { splitTabsFor, usablePair, pairIsVisible } from "./Policy.sys.mjs";
import { attach, detach, publish } from "./Runtime.sys.mjs";
import { PREF_BRANCH, readSettings, modifierLabel } from "./Settings.sys.mjs";
import { contextLink, canOpenLinked, openLinked, openInSource, canKeepPage, keepPage, paneTitle, focusAfterNavigation } from "./Actions.sys.mjs";

const LINKED_PATH = "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71";
const UNLINKED_PATH = "m18.84 12.25 1.77-1.77a5 5 0 0 0-7.07-7.07l-1.77 1.77 M5.16 11.75l-1.77 1.77a5 5 0 0 0 7.07 7.07l1.77-1.77 M8 2v3 M2 8h3 M16 19v3 M19 16h3";

export class LinkedTabsController {
  constructor(win) {
    this.win = win;
    this.pairs = [];
    this.nodes = [];
    this.paneControls = new Map();
    this.dividerTabs = new Set();
    this.routingError = null;
    this.settings = readSettings();
    this.sourceBrowsers = new Set();
    this.navigation = { received: 0, destinationRequests: 0, sourceRequests: 0, sourceFallbackRequests: 0, failures: 0, lastOutcome: "none" };
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
    // Remove a leftover control from an earlier mod version; do not add a
    // navigation-toolbar widget. Pane controls and the tab menu are sufficient.
    doc.getElementById("zen-linked-tabs-button")?.remove();

    const tabMenu = doc.getElementById("tabContextMenu");
    if (tabMenu) {
      this.contextItem = make("menuitem", { id: "zen-linked-tabs-context", label: "Send this pane’s links → other pane" });
      tabMenu.appendChild(this.contextItem);
      this.keepContextItem = make("menuitem", { label: "Keep this page as a separate tab", hidden: "true" });
      tabMenu.appendChild(this.keepContextItem);
      on(tabMenu, "popupshowing", event => {
        if (event.target !== tabMenu) return;
        const tab = win.TabContextMenu?.contextTab || win.gBrowser.selectedTab;
        const pair = this.pairFor(tab);
        this.contextItem.setAttribute("label", pair ? "Unlink these tabs" : "Send this pane’s links → other pane");
        this.contextItem.disabled = !pair && !this.canLink(tab);
        this.keepContextItem.hidden = !pair || pair.target !== tab;
        this.keepContextItem.disabled = !canKeepPage(this, tab);
      });
      on(this.contextItem, "command", () => {
        const tab = win.TabContextMenu?.contextTab || win.gBrowser.selectedTab;
        if (this.pairFor(tab)) this.unlink(tab);
        else this.link(tab);
      });
      on(this.keepContextItem, "command", () => this.runAction(() => keepPage(this, win.TabContextMenu?.contextTab || win.gBrowser.selectedTab)));
    }

    this.initLinkContextMenu();
    this.prefObserver = { observe: () => {
      this.settings = readSettings();
      this.refresh();
    } };
    Services.prefs.addObserver(PREF_BRANCH, this.prefObserver);

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

  runAction(action) {
    try {
      delete this.lastActionError;
      const result = action();
      this.refresh();
      return result;
    } catch (error) {
      this.lastActionError = error?.name || "Error";
      console.error("[Linked Tabs] Could not complete the menu action", error);
      this.refresh();
      return false;
    }
  }

  initLinkContextMenu() {
    const menu = this.win.document.getElementById("contentAreaContextMenu");
    if (!menu) return;
    this.openLinkedItem = this.make("menuitem", { id: "zen-linked-tabs-open-linked", label: "Open in linked split", hidden: "true" });
    this.openSourceItem = this.make("menuitem", { id: "zen-linked-tabs-open-source", label: "Open link in this pane", hidden: "true" });
    const anchor = this.win.document.getElementById("context-openlinkintab")?.nextSibling;
    menu.insertBefore(this.openLinkedItem, anchor);
    menu.insertBefore(this.openSourceItem, anchor);
    this.on(menu, "popupshowing", event => {
      if (event.target !== menu) return;
      const link = this.menuLink = contextLink(this, this.win.gContextMenu);
      const pair = link && this.pairFor(link.source);
      this.openLinkedItem.hidden = !link;
      this.openLinkedItem.disabled = !canOpenLinked(this, link);
      this.openLinkedItem.setAttribute("label", pair?.source === link?.source ? "Open in linked pane" : "Open in linked split");
      this.openSourceItem.hidden = !link || !pair || pair.source !== link.source;
      this.openSourceItem.disabled = !pair || !pairIsVisible(this.win, pair);
    });
    // Native menus can hide before dispatching the command. Retain one bounded
    // snapshot until command, next popup, or unload; document identity is checked
    // again before using it. Do not clear it on popuphidden.
    this.on(this.openLinkedItem, "command", () => {
      const link = this.menuLink; this.menuLink = null;
      this.runAction(() => openLinked(this, link));
    });
    this.on(this.openSourceItem, "command", () => {
      const link = this.menuLink; this.menuLink = null;
      this.runAction(() => openInSource(this, link));
    });
  }

  syncPaneControls() {
    const tabs = Array.from(this.win.gBrowser.tabs);
    const headerFor = tab => tab.linkedBrowser?.closest(".browserSidebarContainer")?.querySelector(".zen-view-splitter-header");
    for (const [tab, ui] of this.paneControls) {
      if (!tabs.includes(tab) || splitTabsFor(this.win, tab).length !== 2 ||
          !ui.button.isConnected || ui.button.parentNode !== headerFor(tab)) {
        ui.button.remove();
        this.nodes = this.nodes.filter(node => node !== ui.button);
        this.paneControls.delete(tab);
      }
    }
    for (const tab of tabs) {
      if (this.paneControls.has(tab) || splitTabsFor(this.win, tab).length !== 2) continue;
      const header = headerFor(tab);
      if (!header) continue;
      const button = this.make("toolbarbutton", {
        class: "zen-linked-tabs-pane-button", label: "Linked Tabs",
        "aria-label": "Linked Tabs", "aria-pressed": "false", "aria-haspopup": "menu", "aria-expanded": "false"
      });
      this.addButtonIcon(button, 12);
      // Alongside the native drag handle and unsplit button.
      header.insertBefore(button, header.querySelector(".zen-tab-unsplit-button"));
      const popup = this.make("menupopup", {}, button);
      const status = this.make("menuitem", { disabled: "true", label: "Linked Tabs" }, popup);
      this.make("menuseparator", {}, popup);
      const link = this.make("menuitem", { label: "Open this pane’s links in the other pane" }, popup);
      const reverse = this.make("menuitem", { label: "Reverse link direction" }, popup);
      const unlink = this.make("menuitem", { label: "Unlink tabs" }, popup);
      const keep = this.make("menuitem", { label: "Keep this page as a separate tab", hidden: "true" }, popup);
      this.make("menuseparator", {}, popup);
      const preview = this.make("menuitem", { label: "Preview marker appearance…" }, popup);
      const ui = { button, popup, status, link, reverse, unlink, keep };
      // Bind to this pane, not the selected tab: hovering needn't select a pane.
      this.on(button, "command", event => {
        // Commands from nested menuitems bubble through this button too.
        if (event.target === button) this.toggle(tab);
      });
      const openMenu = event => {
        if (event.target !== button) return;
        event.preventDefault();
        event.stopPropagation();
        this.updatePaneMenu(tab, ui);
        popup.openPopup(button, "after_start", 0, 0, true, false, event);
      };
      this.on(button, "contextmenu", openMenu);
      this.on(button, "keydown", event => {
        if (event.key === "ArrowDown" || event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")) openMenu(event);
      });
      this.on(link, "command", () => this.link(tab));
      this.on(reverse, "command", () => this.reverse(tab));
      this.on(unlink, "command", () => this.unlink(tab));
      this.on(keep, "command", () => this.runAction(() => keepPage(this, tab)));
      this.on(preview, "command", () => this.runAction(() => this.openMarkerPreview()));
      this.on(popup, "popupshowing", event => {
        if (event.target === popup) {
          button.setAttribute("data-menu-open", "true");
          button.setAttribute("aria-expanded", "true");
          this.updatePaneMenu(tab, ui);
        }
      });
      this.on(popup, "popuphidden", event => {
        if (event.target === popup) {
          button.removeAttribute("data-menu-open");
          button.setAttribute("aria-expanded", "false");
        }
      });
      this.paneControls.set(tab, ui);
    }
    for (const [tab, ui] of this.paneControls) this.updatePaneMenu(tab, ui);
  }

  updatePaneMenu(tab, ui) {
    const pair = this.pairFor(tab);
    const role = pair ? (pair.source === tab ? "source" : "destination") : "";
    const status = this.routingError ? "Linked Tabs could not start — see Browser Console" :
      this.lastActionError ? "Could not complete the last action — see Browser Console" :
      role === "source" ? `Source: links open in “${paneTitle(pair.target)}”` :
      role === "destination" ? `Destination: receives links from “${paneTitle(pair.source)}”` :
      this.canLink(tab) ? "Tabs are not linked" : "Requires two tabs in the same container";
    ui.button.setAttribute("zen-linked-tabs-role", role);
    this.updateButtonIcon(ui.button, !!pair);
    const modifier = modifierLabel(this.settings.sourceModifiers, Services.appinfo.OS === "Darwin");
    const tooltip = "Linked Tabs: " + status +
      (pair ? ". Click to unlink; right-click for options." : ". Click to link from this pane; right-click for options.") +
      (role === "source" && modifier ? ` ${modifier}-click a link to open it in this pane.` : "");
    ui.button.setAttribute("tooltiptext", tooltip);
    ui.button.setAttribute("aria-label", tooltip);
    ui.button.setAttribute("aria-pressed", String(!!pair));
    ui.status.setAttribute("label", status);
    ui.link.setAttribute("label", role === "destination" ? "Use this pane as the source" : "Open this pane’s links in the other pane");
    ui.link.disabled = !this.canLink(tab) || role === "source";
    ui.reverse.disabled = !pair || !!this.routingError;
    ui.unlink.disabled = !pair;
    ui.keep.hidden = role !== "destination";
    ui.keep.disabled = !canKeepPage(this, tab);
  }

  addButtonIcon(button, size = 16) {
    // Inline SVG avoids data-URI/context-fill image rendering differences in
    // native XUL headers. Author-provided content also skips anonymous images.
    const svg = this.win.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      class: "zen-linked-tabs-glyph", viewBox: "0 0 24 24", width: size, height: size,
      fill: "none", stroke: "currentColor", "stroke-width": "1.6",
      "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"
    })) svg.setAttribute(key, value);
    const path = this.win.document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", UNLINKED_PATH);
    svg.appendChild(path);
    button.appendChild(svg);
    button.linkedTabsIconPath = path;
  }

  updateButtonIcon(button, linked) {
    button.linkedTabsIconPath.setAttribute("d", linked ? LINKED_PATH : UNLINKED_PATH);
    button.setAttribute("data-link-state", linked ? "linked" : "unlinked");
  }

  recordNavigation(outcome, error = "") {
    this.navigation.received++;
    this.navigation.lastOutcome = outcome;
    if (outcome === "destination-requested") this.navigation.destinationRequests++;
    if (outcome === "source-requested") this.navigation.sourceRequests++;
    if (outcome === "source-fallback-requested") this.navigation.sourceFallbackRequests++;
    if (outcome === "navigation-error") this.navigation.failures++;
    if (error) this.navigation.lastError = error;
    else delete this.navigation.lastError;
    // Counts and outcomes only; diagnostics contain no URLs or page titles.
    if (this.win.ZenLinkedTabsStatus) this.win.ZenLinkedTabsStatus.navigation = { ...this.navigation };
  }

  pairFor(tab) { return this.pairs.find(pair => pair.source === tab || pair.target === tab); }

  toggle(tab) {
    if (this.pairFor(tab)) this.unlink(tab);
    else this.link(tab);
  }

  syncSplitDividers() {
    const next = new Set();
    for (const pair of this.pairs) {
      const tabs = splitTabsFor(this.win, pair.source);
      if (tabs.length !== 2) continue;
      // Mark the first tab to supply direction to the group's centered overlay.
      // Derive direction from sidebar order, not the page split's orientation.
      const first = tabs[0];
      first.setAttribute("zen-linked-tabs-divider", first === pair.source ? "forward" : "reverse");
      next.add(first);
    }
    for (const tab of this.dividerTabs) {
      if (!next.has(tab)) tab.removeAttribute("zen-linked-tabs-divider");
    }
    this.dividerTabs = next;
  }

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
        if (id) routes[id] = { token: pair.token, markLastLink: this.settings.markLastLink, sourceModifiers: this.settings.sourceModifiers, marker: this.markerOptions() };
      }
    }
    return routes;
  }

  markerOptions() {
    let accentColor = "#6366f1";
    try {
      accentColor = this.win.getComputedStyle(this.win.document.documentElement).getPropertyValue("--zen-primary-color").trim() || "AccentColor";
    } catch {}
    return { ...this.settings.marker, accentColor };
  }

  openMarkerPreview() {
    const url = new URL("../marker-preview.html", import.meta.url);
    url.hash = encodeURIComponent(JSON.stringify(this.markerOptions()));
    const tab = this.win.gBrowser.addTrustedTab(url.href, { inBackground: false, skipRoute: true });
    if (tab) this.win.gBrowser.selectedTab = tab;
    return !!tab;
  }

  destinationFor(browser, token) {
    if (this.destroyed || this.routingError) return null;
    const pair = this.pairs.find(item => item.source.linkedBrowser === browser && item.token === token);
    return pair && pairIsVisible(this.win, pair) ? pair.target.linkedBrowser : null;
  }

  focusAfterNavigation(browser, token, inSource = false) {
    focusAfterNavigation(this, browser, token, inSource);
  }

  notifySourceStates() {
    const routes = this.routes();
    const next = new Set(this.pairs.map(pair => pair.source.linkedBrowser));
    for (const browser of new Set([...this.sourceBrowsers, ...next])) {
      try {
        browser.browsingContext.currentWindowGlobal?.getActor("ZenLinkedTabsV1")
          .sendAsyncMessage("LinkedTabs:State", routes[browser.browsingContext.id] || null);
      } catch {} // A closed/non-web document has no actor or marker to clear.
    }
    this.sourceBrowsers = next;
  }

  refresh() {
    if (this.destroyed) return;
    this.pairs = this.pairs.filter(pair => usablePair(this.win, pair.source, pair.target));
    for (const tab of this.win.gBrowser.tabs) tab.removeAttribute("zen-linked-tabs-role");
    for (const pair of this.pairs) {
      pair.source.setAttribute("zen-linked-tabs-role", "source");
      pair.target.setAttribute("zen-linked-tabs-role", "destination");
    }
    this.syncSplitDividers();
    this.syncPaneControls();
    this.win.ZenLinkedTabsStatus = {
      version: "0.7.1", phase: this.routingError ? "error" : "ready",
      paneControls: this.paneControls.size, pairs: this.pairs.length,
      directionDividers: this.dividerTabs.size,
      navigation: { ...this.navigation }, settings: this.settings,
      ...(this.lastActionError ? { lastActionError: this.lastActionError } : {}),
      ...(this.routingError ? { error: this.routingError } : {})
    };
    publish();
    this.notifySourceStates();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.prefObserver) Services.prefs.removeObserver(PREF_BRANCH, this.prefObserver);
    this.abort.abort();
    this.observer?.disconnect();
    for (const tab of this.win.gBrowser.tabs) tab.removeAttribute("zen-linked-tabs-role");
    for (const node of this.nodes) node.remove();
    this.nodes = [];
    this.paneControls.clear();
    for (const tab of this.dividerTabs) tab.removeAttribute("zen-linked-tabs-divider");
    this.dividerTabs.clear();
    this.pairs = [];
    this.notifySourceStates();
    this.menuLink = null;
    detach(this);
    if (this.win.ZenLinkedTabs === this) delete this.win.ZenLinkedTabs;
    this.win.ZenLinkedTabsStatus = { version: "0.7.1", phase: "disabled" };
  }
}
