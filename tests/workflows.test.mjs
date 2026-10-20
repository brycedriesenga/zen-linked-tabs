import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { harness, browserWindow, click } from "./harness.mjs";

async function setup(options = {}) {
  const h = await harness(options);
  const { LinkedTabsController } = await h.imports("modules/Controller.sys.mjs");
  const { ZenLinkedTabsV1Child } = await h.imports("actors/LinkedTabsChild.sys.mjs");
  const { ZenLinkedTabsV1Parent } = await h.imports("actors/LinkedTabsParent.sys.mjs");
  Object.assign(h, browserWindow());
  h.child = new ZenLinkedTabsV1Child();
  h.parent = new ZenLinkedTabsV1Parent();
  h.manager = {
    documentPrincipal: { origin: "https://example.com" },
    domProcess: { remoteType: "webIsolated=https://example.com" },
    getActor: () => ({ sendAsyncMessage: (name, data) => h.child.receiveMessage({ name, data }) })
  };
  h.source.linkedBrowser.browsingContext.currentWindowGlobal = h.manager;
  h.target.linkedBrowser.browsingContext.currentWindowGlobal = { ...h.manager, getActor() { throw new Error("No source actor"); } };
  h.child.browsingContext = h.parent.browsingContext = h.source.linkedBrowser.browsingContext;
  h.parent.manager = h.manager;
  h.messages = [];
  h.child.sendQuery = (name, data) => new Promise(resolve => h.messages.push({ name, data, resolve }));
  h.controller = new LinkedTabsController(h.win);
  h.win.ZenLinkedTabs = h.controller;
  h.controller.init();
  h.pref = (name, value) => h.Services.prefs.setBoolPref("zen-linked-tabs." + name, value);
  h.deliver = async index => {
    const message = h.messages[index];
    const result = h.parent.receiveMessage(message);
    message.resolve(result);
    await Promise.resolve();
    return result;
  };
  return h;
}

function showContext(h, tab = h.source, overrides = {}) {
  h.win.gContextMenu = {
    browser: tab.linkedBrowser, onLink: true, linkURL: "https://example.org/result",
    principal: h.manager.documentPrincipal, policyContainer: { csp: "context-policy" },
    remoteType: "webIsolated=https://example.com",
    contentData: { docLocation: "https://example.com/search", linkReferrerInfo: { referrerPolicy: 3, sendReferrer: false } },
    frameBrowsingContext: tab.linkedBrowser.browsingContext,
    ...overrides
  };
  h.win.document.getElementById("contentAreaContextMenu").dispatchEvent(new Event("popupshowing"));
  return h.controller.menuLink;
}

test("one context action creates a two-pane linked split in the source container and private window", async () => {
  const h = await setup();
  delete h.source.group; delete h.target.group;
  h.win.gZenViewSplitter.splitViewBrowsers = [];
  h.source.setAttribute("usercontextid", "7");
  h.source.linkedBrowser.browsingContext.usePrivateBrowsing = true;
  h.controller.refresh();
  h.win.gBrowser.selectedTab = h.target;
  showContext(h);
  assert.equal(h.controller.openLinkedItem.disabled, false);
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(h.win.gBrowser.added.length, 1);
  const created = h.win.gBrowser.added[0];
  assert.equal(created.options.userContextId, 7);
  assert.equal(created.options.triggeringPrincipal, h.manager.documentPrincipal);
  assert.equal(created.options.skipRoute, true);
  assert.equal(created.tab.linkedBrowser.browsingContext.usePrivateBrowsing, true);
  assert.equal(h.controller.pairs[0].source, h.source);
  assert.equal(h.controller.pairs[0].target, created.tab);
  assert.equal(created.tab.linkedBrowser.loads[0].uri.spec, "https://example.org/result");
  assert.equal(created.tab.linkedBrowser.loads[0].options.referrerInfo.sendReferrer, false);
  assert.equal(created.tab.linkedBrowser.loads[0].options.policyContainer.csp, "context-policy");
  assert.equal(h.win.gBrowser.selectedTab, h.source);
  h.controller.destroy();
});

test("opening a link reuses the existing destination and retains its pair token", async () => {
  const h = await setup(); h.controller.link(h.source);
  const token = h.controller.pairs[0].token;
  h.win.gBrowser.selectedTab = h.target;
  showContext(h);
  assert.equal(h.controller.openLinkedItem.getAttribute("label"), "Open in linked pane");
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(h.target.linkedBrowser.loads.length, 1);
  assert.equal(h.controller.pairs[0].token, token);
  assert.equal(h.win.gBrowser.added.length, 0);
  assert.equal(h.source.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("an unlinked two-pane split can be linked directly from its content menu", async () => {
  const h = await setup();
  showContext(h, h.target);
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(h.controller.pairs[0].source, h.target);
  assert.equal(h.source.linkedBrowser.loads.length, 1);
  assert.equal(h.win.gBrowser.added.length, 0);
  h.controller.destroy();
});

test("a menu command still uses its snapshot when native popuphidden fires first", async () => {
  const h = await setup();
  showContext(h);
  h.win.document.getElementById("contentAreaContextMenu").dispatchEvent(new Event("popuphidden"));
  h.win.gContextMenu = null;
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(h.target.linkedBrowser.loads.length, 1);
  assert.equal(h.controller.menuLink, null);
  h.controller.destroy();
});

test("context actions reject stale documents and hide iframe, editable, download, and privileged links", async () => {
  const h = await setup(); h.controller.link(h.source);
  for (const overrides of [{ inFrame: true }, { frameBrowsingContext: {} }, { onEditable: true },
    { linkDownload: "file" }, { linkURL: "file:///tmp/x" }, { onLink: false }]) {
    showContext(h, h.source, overrides);
    assert.equal(h.controller.openLinkedItem.hidden, true);
    assert.equal(h.controller.openSourceItem.hidden, true);
  }
  showContext(h);
  h.source.linkedBrowser.browsingContext.currentWindowGlobal = {};
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  h.controller.openSourceItem.dispatchEvent(new Event("command"));
  assert.equal(h.target.linkedBrowser.loads.length + h.source.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("one-action creation refuses incompatible containers, larger splits, and pinned source cloning", async () => {
  const h = await setup();
  h.target.setAttribute("usercontextid", "2"); showContext(h);
  assert.equal(h.controller.openLinkedItem.disabled, true);
  h.target.removeAttribute("usercontextid");
  h.source.group.tabs.push({}); showContext(h);
  assert.equal(h.controller.openLinkedItem.disabled, true);
  delete h.source.group;
  h.source.pinned = true; showContext(h);
  assert.equal(h.controller.openLinkedItem.disabled, true);
  h.controller.destroy();
});

test("failed native split creation removes only the new blank tab and reports the error", async () => {
  const h = await setup(); delete h.source.group;
  h.win.gZenViewSplitter.splitTabs = () => { throw new TypeError("split failed"); };
  showContext(h);
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(h.win.gBrowser.tabs.length, 2);
  assert.equal(h.source.closing, undefined);
  assert.equal(h.win.ZenLinkedTabsStatus.lastActionError, "TypeError");
  h.controller.destroy();
});

test("hover text names the related page, updates on title changes, and exposes toggle and menu state", async () => {
  const h = await setup(); h.controller.link(h.source);
  const sourceUI = h.controller.paneControls.get(h.source);
  const targetUI = h.controller.paneControls.get(h.target);
  assert.match(sourceUI.button.getAttribute("tooltiptext"), /links open in “Tab 2”/);
  assert.match(targetUI.button.getAttribute("aria-label"), /receives links from “Tab 1”/);
  assert.equal(sourceUI.button.getAttribute("aria-pressed"), "true");
  assert.match(sourceUI.button.getAttribute("tooltiptext"), /Option\+Shift-click/);
  h.target.label = "A changed title";
  h.win.gBrowser.tabContainer.dispatchEvent(new Event("TabAttrModified"));
  assert.match(sourceUI.button.getAttribute("tooltiptext"), /A changed title/);
  sourceUI.popup.dispatchEvent(new Event("popupshowing"));
  assert.equal(sourceUI.button.getAttribute("aria-expanded"), "true");
  sourceUI.popup.dispatchEvent(new Event("popuphidden"));
  assert.equal(sourceUI.button.getAttribute("aria-expanded"), "false");
  h.controller.unlink(h.source);
  assert.equal(sourceUI.button.getAttribute("aria-pressed"), "false");
  h.controller.destroy();
});

test("normal clicks explicitly focus the source by default and the destination when configured", async () => {
  const h = await setup(); h.controller.link(h.source);
  h.win.gBrowser.selectedTab = h.target;
  h.child.handleEvent(click()); await h.deliver(0);
  assert.equal(h.win.gBrowser.selectedTab, h.source);
  assert.equal(h.source.linkedBrowser.focused, 1);
  h.pref("focus-destination", true);
  h.child.handleEvent(click()); await h.deliver(1);
  assert.equal(h.win.gBrowser.selectedTab, h.target);
  assert.equal(h.target.linkedBrowser.focused, 1);
  h.controller.destroy();
});

test("delayed routing does not steal focus from an unrelated tab or replay after a focus error", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("focus-destination", true);
  const other = browserWindow(100).source;
  h.win.gBrowser.tabs.push(other);
  h.child.handleEvent(click());
  h.win.gBrowser.selectedTab = other;
  await h.deliver(0);
  assert.equal(h.win.gBrowser.selectedTab, other);
  h.win.gBrowser.selectedTab = h.source;
  h.target.linkedBrowser.focus = () => { throw new Error("not focusable"); };
  h.child.handleEvent(click());
  assert.equal((await h.deliver(1)).ok, true);
  assert.equal(h.target.linkedBrowser.loads.length, 2);
  assert.equal(h.source.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("keep page saves a normal background tab without changing the pair, focus, or container", async () => {
  const h = await setup();
  h.source.setAttribute("usercontextid", "4"); h.target.setAttribute("usercontextid", "4");
  h.controller.link(h.source);
  const token = h.controller.pairs[0].token;
  const sourceUI = h.controller.paneControls.get(h.source);
  const targetUI = h.controller.paneControls.get(h.target);
  assert.equal(sourceUI.keep.hidden, true);
  assert.equal(targetUI.keep.hidden, false);
  targetUI.keep.dispatchEvent(new Event("command"));
  const saved = h.win.gBrowser.added[0];
  assert.equal(saved.url, h.target.linkedBrowser.currentURI.spec);
  assert.equal(saved.options.triggeringPrincipal, h.target.linkedBrowser.contentPrincipal);
  assert.equal(saved.options.inBackground, true);
  assert.equal(saved.options.userContextId, 4);
  assert.equal(saved.options.skipRoute, true);
  assert.equal(saved.tab.group, undefined);
  assert.equal(h.controller.pairs[0].token, token);
  assert.equal(h.win.gBrowser.selectedTab, h.source);
  assert.equal(h.source.group.tabs.length, 2);
  h.controller.destroy();
});

test("the tab context menu also offers keep-page only for a linked destination", async () => {
  const h = await setup(); h.controller.link(h.source);
  h.win.TabContextMenu = { contextTab: h.target };
  const menu = h.win.document.getElementById("tabContextMenu");
  menu.dispatchEvent(new Event("popupshowing"));
  assert.equal(h.controller.keepContextItem.hidden, false);
  h.controller.keepContextItem.dispatchEvent(new Event("command"));
  assert.equal(h.win.gBrowser.added.length, 1);
  const item = h.controller.keepContextItem;
  h.controller.destroy();
  assert.equal(item.isConnected, false);
});

test("the exact default Alt+Shift override opens in the source even for target=_blank and retains the pair", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("focus-destination", true);
  const token = h.controller.pairs[0].token;
  const event = click({ altKey: true, shiftKey: true, attrs: { target: "_blank" } });
  h.child.handleEvent(event);
  assert.equal(event.prevented, true);
  assert.equal(h.messages[0].data.mode, "source");
  assert.equal((await h.deliver(0)).outcome, "source-requested");
  assert.equal(h.source.linkedBrowser.loads.length, 1);
  assert.equal(h.target.linkedBrowser.loads.length, 0);
  assert.equal(h.controller.pairs[0].token, token);
  assert.equal(h.win.gBrowser.selectedTab, h.source);
  assert.equal(h.win.ZenLinkedTabsStatus.navigation.sourceRequests, 1);
  h.child.handleEvent(click()); await h.deliver(1);
  assert.equal(h.target.linkedBrowser.loads.length, 1);
  h.controller.destroy();
});

test("modifier customization is live, exact, disableable, and leaves AltGr and ineligible clicks native", async () => {
  const h = await setup(); h.controller.link(h.source);
  h.pref("source-modifier.alt", false); h.pref("source-modifier.shift", false);
  h.pref("source-modifier.meta", true); h.pref("source-modifier.ctrl", true);
  for (const overrides of [{ altKey: true, shiftKey: true }, { ctrlKey: true },
    { ctrlKey: true, metaKey: true, shiftKey: true },
    { ctrlKey: true, metaKey: true, getModifierState: key => key === "AltGraph" },
    { ctrlKey: true, metaKey: true, attrs: { download: "" } },
    { ctrlKey: true, metaKey: true, href: "https://example.com/search#here" },
    { ctrlKey: true, metaKey: true, button: 1 }]) {
    const event = click(overrides); h.child.handleEvent(event);
    assert.equal(event.prevented, false, JSON.stringify(overrides));
  }
  const event = click({ ctrlKey: true, metaKey: true }); h.child.handleEvent(event);
  assert.equal(event.prevented, true); await h.deliver(0);
  h.pref("source-modifier.meta", false); h.pref("source-modifier.ctrl", false);
  h.child.handleEvent(click()); await h.deliver(1);
  assert.equal(h.messages[1].data.mode, "destination");
  assert.equal(h.target.linkedBrowser.loads.length, 1);
  h.controller.destroy();
  assert.equal(h.prefObservers.size, 0);
});

test("the source link context-menu exception navigates that pane and preserves the pair", async () => {
  const h = await setup(); h.controller.link(h.source);
  h.win.gBrowser.selectedTab = h.target;
  const token = h.controller.pairs[0].token;
  showContext(h);
  assert.equal(h.controller.openSourceItem.hidden, false);
  h.controller.openSourceItem.dispatchEvent(new Event("command"));
  assert.equal(h.source.linkedBrowser.loads.length, 1);
  assert.equal(h.target.linkedBrowser.loads.length, 0);
  assert.equal(h.controller.pairs[0].token, token);
  showContext(h, h.target);
  assert.equal(h.controller.openSourceItem.hidden, true);
  h.controller.destroy();
});

test("optional last-link marker follows successful destination requests and restores existing inline styles", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("mark-last-link", true);
  const first = click();
  first.node.style.setProperty("outline-color", "red", "important");
  first.node.style.setProperty("outline-width", "3px");
  h.child.contentWindow = { document: first.node.ownerDocument };
  h.child.handleEvent(first);
  assert.equal(first.node.style.getPropertyValue("outline-style"), "");
  await h.deliver(0);
  assert.equal(first.node.style.getPropertyValue("outline-style"), "dotted");
  const second = click(); second.node.ownerDocument = first.node.ownerDocument;
  h.child.handleEvent(second); await h.deliver(1);
  assert.equal(first.node.style.getPropertyValue("outline-color"), "red");
  assert.equal(first.node.style.getPropertyPriority("outline-color"), "important");
  assert.equal(first.node.style.getPropertyValue("outline-width"), "3px");
  assert.equal(first.node.style.getPropertyValue("outline-style"), "");
  assert.equal(second.node.style.getPropertyValue("outline-style"), "dotted");
  h.pref("mark-last-link", false);
  assert.equal(second.node.style.getPropertyValue("outline-style"), "");
  h.controller.destroy();
});

test("markers clear on unlink, direction reversal, pagehide, and unload without overwriting site updates", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("mark-last-link", true);
  const event = click(); h.child.contentWindow = { document: event.node.ownerDocument };
  const mark = () => h.child.mark(event.node, h.controller.pairFor(h.source).token);
  mark(); h.controller.unlink(h.source);
  assert.equal(event.node.style.getPropertyValue("outline-style"), "");
  h.controller.link(h.source); mark(); h.controller.reverse(h.source);
  assert.equal(event.node.style.getPropertyValue("outline-style"), "");
  h.controller.link(h.source); mark(); h.child.handleEvent({ type: "pagehide" });
  assert.equal(event.node.style.getPropertyValue("outline-style"), "");
  mark(); event.node.style.setProperty("outline-color", "blue", "important");
  h.controller.destroy();
  assert.equal(event.node.style.getPropertyValue("outline-color"), "blue");
  assert.equal(event.node.style.getPropertyValue("outline-style"), "");
});

test("out-of-order acknowledgments and failed or source navigations do not mark the wrong result", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("mark-last-link", true);
  const first = click(); const second = click(); second.node.ownerDocument = first.node.ownerDocument;
  h.child.contentWindow = { document: first.node.ownerDocument };
  h.child.handleEvent(first); h.child.handleEvent(second);
  await h.deliver(1); await h.deliver(0);
  assert.equal(first.node.style.getPropertyValue("outline-style"), "");
  assert.equal(second.node.style.getPropertyValue("outline-style"), "dotted");
  const third = click({ altKey: true, shiftKey: true }); third.node.ownerDocument = first.node.ownerDocument;
  h.child.handleEvent(third); await h.deliver(2);
  assert.equal(third.node.style.getPropertyValue("outline-style"), "");
  h.child.handleEvent(click());
  h.messages[3].resolve({ ok: false }); await Promise.resolve();
  assert.equal(h.child.marker.node, second.node);
  h.controller.destroy();
});

test("context-menu opening can mark the actual clicked link without modifying page layout", async () => {
  const h = await setup(); h.pref("mark-last-link", true);
  const event = click({ type: "contextmenu" });
  h.child.contentWindow = { document: event.node.ownerDocument };
  h.child.handleEvent(event);
  showContext(h, h.source, { linkURL: event.href });
  h.controller.openLinkedItem.dispatchEvent(new Event("command"));
  assert.equal(event.node.style.getPropertyValue("outline-style"), "dotted");
  assert.equal(event.prevented, false);
  h.controller.destroy();
});

test("an unlink state message blocks a late marker even before sharedData reaches the process", async () => {
  const h = await setup(); h.controller.link(h.source); h.pref("mark-last-link", true);
  const { ROUTES_KEY } = await h.imports("modules/Policy.sys.mjs");
  const oldRoutes = h.state.get(ROUTES_KEY);
  const event = click(); h.child.contentWindow = { document: event.node.ownerDocument };
  h.child.handleEvent(event);
  h.controller.unlink(h.source);
  h.state.set(ROUTES_KEY, oldRoutes);
  h.messages[0].resolve({ ok: true, outcome: "destination-requested" });
  await Promise.resolve();
  assert.equal(event.node.style.getPropertyValue("outline-style"), "");
  h.controller.destroy();
});

test("Sine settings expose every runtime default with the same type and value", async () => {
  const h = await setup();
  const { DEFAULTS, PREF_BRANCH } = await h.imports("modules/Settings.sys.mjs");
  const preferences = JSON.parse(await fs.readFile(new URL("../preferences.json", import.meta.url), "utf8"));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const pref = preferences.find(item => item.property === PREF_BRANCH + key);
    assert.equal(pref.type, "checkbox"); assert.equal(pref.defaultValue, value);
  }
  h.controller.destroy();
});
