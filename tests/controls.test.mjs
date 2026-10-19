import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
import { harness, browserWindow } from "./harness.mjs";

test("adds one menu between drag and unsplit controls in each pane without a global toolbar", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source } = browserWindow(1, { toolbar: false });
  const c = new LinkedTabsController(win);
  c.init();
  assert.equal(c.paneControls.size, 2);
  const header = source.container.querySelector(".zen-view-splitter-header");
  assert.deepEqual(header.children.map(node => node.getAttribute("class")), [
    "zen-tab-rearrange-button", "zen-linked-tabs-pane-button", "zen-tab-unsplit-button"
  ]);
  assert.equal(c.observer.targets.includes(win.gBrowser.tabpanels), true);
  c.refresh(); c.refresh();
  assert.equal(header.children.length, 3);
  const buttons = [...c.paneControls.values()].map(ui => ui.button);
  c.destroy();
  assert.equal(buttons.every(button => !button.isConnected), true);
  assert.equal(header.children.length, 2);
  assert.equal(c.observer.disconnected, true);
});

test("a pane menu links the hovered pane even when the other pane is selected", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source, target } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  assert.equal(win.gBrowser.selectedTab, source);
  c.paneControls.get(target).link.dispatchEvent(new Event("command"));
  assert.equal(c.pairs[0].source, target);
  assert.equal(c.pairs[0].target, source);
  assert.equal(c.paneControls.get(target).button.getAttribute("zen-linked-tabs-role"), "source");
  assert.match(c.paneControls.get(source).status.getAttribute("label"), /Destination/);
  c.paneControls.get(source).reverse.dispatchEvent(new Event("command"));
  assert.equal(c.pairs[0].source, source);
  c.paneControls.get(source).unlink.dispatchEvent(new Event("command"));
  assert.equal(c.pairs.length, 0);
  c.destroy();
});

test("creates controls for late/restored headers and replaces removed header controls without duplicates", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source } = browserWindow(1, { headers: false });
  const c = new LinkedTabsController(win);
  c.init();
  assert.equal(c.paneControls.size, 0);
  win.installHeaders(); c.observer.callback([]);
  assert.equal(c.paneControls.size, 2);
  c.link(source);
  const old = c.paneControls.get(source).button;
  win.installHeaders(); c.observer.callback([]);
  assert.equal(old.isConnected, false);
  assert.equal(c.paneControls.size, 2);
  assert.equal(c.paneControls.get(source).button.getAttribute("zen-linked-tabs-role"), "source");
  c.destroy();
});

test("actor startup failures leave visible controls and a diagnostic instead of removing all UI", async () => {
  const env = await harness({ actorRegistrationError: true });
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  assert.equal(c.paneControls.size, 2);
  assert.equal(c.paneControls.get(source).link.disabled, true);
  assert.match(c.paneControls.get(source).status.getAttribute("label"), /could not start/);
  assert.equal(win.ZenLinkedTabsStatus.phase, "error");
  assert.equal(c.link(source), false);
  assert.equal(Object.keys(c.routes()).length, 0);
  c.destroy();
});

async function startup(options = {}) {
  const code = await fs.readFile(new URL("../linked-tabs.uc.js", import.meta.url), "utf8");
  const win = new EventTarget();
  const timers = new Map();
  let serial = 0;
  let started = 0;
  win.setTimeout = fn => { timers.set(++serial, fn); return serial; };
  win.clearTimeout = id => timers.delete(id);
  win.addUnloadListener = fn => { win.disableMod = fn; };
  const makeReady = () => { win.gBrowser = { tabContainer: {}, tabpanels: {} }; win.gZenViewSplitter = {}; };
  if (!options.late) makeReady();
  const document = { readyState: "complete" };
  vm.runInNewContext(code, {
    window: win, document, console: { info() {}, error() {} },
    ChromeUtils: { importESModule() {
      if (options.importError) throw new Error("Module import failed");
      return { LinkedTabsController: class {
        init() { started++; win.ZenLinkedTabsStatus = { phase: "ready" }; }
        destroy() {}
      } };
    } }
  });
  return { win, timers, makeReady, started: () => started };
}

test("startup works in already-open windows without waiting for a past startup event", async () => {
  const h = await startup();
  assert.equal(h.started(), 1);
  assert.equal(h.win.ZenLinkedTabsStatus.phase, "ready");
});

test("startup retries late Zen APIs and cancels retries when disabled", async () => {
  const h = await startup({ late: true });
  assert.equal(h.started(), 0);
  assert.equal(h.timers.size, 1);
  const retry = [...h.timers.values()][0];
  h.timers.clear(); h.makeReady(); retry();
  assert.equal(h.started(), 1);
  const disabled = await startup({ late: true });
  disabled.win.disableMod();
  assert.equal(disabled.timers.size, 0);
  assert.equal(disabled.win.ZenLinkedTabsStatus.phase, "disabled");
});

test("module import failures expose a useful status", async () => {
  const h = await startup({ importError: true });
  assert.equal(h.win.ZenLinkedTabsStatus.phase, "error");
  assert.match(h.win.ZenLinkedTabsStatus.error, /Module import failed/);
});

test("inline SVG changes between unlinked and linked states and resets after unlink", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source, target } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  const button = c.paneControls.get(source).button;
  const shape = button.linkedTabsIconPath.getAttribute("d");
  assert.equal(button.hasAttribute("image"), false);
  assert.ok(button.querySelector(".zen-linked-tabs-glyph"));
  assert.equal(button.getAttribute("data-link-state"), "unlinked");
  c.link(source);
  assert.notEqual(button.linkedTabsIconPath.getAttribute("d"), shape);
  assert.equal(button.getAttribute("data-link-state"), "linked");
  assert.equal(c.paneControls.get(target).button.getAttribute("data-link-state"), "linked");
  c.unlink(source);
  assert.equal(button.linkedTabsIconPath.getAttribute("d"), shape);
  assert.equal(button.getAttribute("data-link-state"), "unlinked");
  c.destroy();
});

test("primary pane-button activation toggles that pane's pair without opening the menu", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source, target } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  const ui = c.paneControls.get(target);
  assert.equal(ui.button.hasAttribute("type"), false);
  ui.button.dispatchEvent(new Event("command"));
  assert.equal(c.pairs[0].source, target);
  assert.equal(ui.popup.openCount || 0, 0);
  assert.equal(win.gBrowser.selectedTab, source);
  ui.button.dispatchEvent(new Event("command"));
  assert.equal(c.pairs.length, 0);
  c.destroy();
});

test("right-click opens the anchored options menu without changing the link state", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  const ui = c.paneControls.get(source);
  const event = new Event("contextmenu", { cancelable: true });
  ui.button.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.popup.popupAnchor, ui.button);
  assert.equal(c.pairs.length, 0);
  assert.equal(ui.button.getAttribute("data-menu-open"), "true");
  ui.popup.dispatchEvent(new Event("popuphidden"));
  assert.equal(ui.button.hasAttribute("data-menu-open"), false);
  c.link(source);
  ui.button.dispatchEvent(new Event("contextmenu", { cancelable: true }));
  assert.equal(c.pairs.length, 1);
  c.destroy();
});

test("keyboard menu access does not toggle the pair, and nested menu commands do not toggle twice", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  const ui = c.paneControls.get(source);
  const key = new Event("keydown", { cancelable: true });
  Object.defineProperty(key, "key", { value: "ArrowDown" });
  ui.button.dispatchEvent(key);
  assert.equal(ui.popup.openCount, 1);
  assert.equal(c.pairs.length, 0);
  c.link(source);
  const nested = new Event("command");
  Object.defineProperty(nested, "target", { value: ui.reverse });
  ui.button.dispatchEvent(nested);
  assert.equal(c.pairs.length, 1);
  c.destroy();
});

test("one divider arrow follows sidebar tab order and reverses without modifying favicon or audio nodes", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source, target } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  const content = source.querySelector(".tab-content");
  const favicon = source.querySelector(".tab-icon-stack");
  const audio = source.querySelector(".tab-audio-button");
  c.link(source);
  assert.equal(source.getAttribute("zen-linked-tabs-divider"), "forward");
  assert.equal(target.hasAttribute("zen-linked-tabs-divider"), false);
  assert.equal(c.dividerTabs.size, 1);
  assert.equal(favicon.nextSibling, audio);
  assert.equal(source.querySelector(".tab-icon-stack"), favicon);
  c.reverse(source);
  assert.equal(source.getAttribute("zen-linked-tabs-divider"), "reverse");
  // Reorder the sidebar tabs: the first tab owns the native divider.
  source.group.tabs = [target, source];
  c.refresh();
  assert.equal(source.hasAttribute("zen-linked-tabs-divider"), false);
  assert.equal(target.getAttribute("zen-linked-tabs-divider"), "forward");
  assert.equal(content.children.length, 3);
  c.unlink(source);
  assert.equal(c.dividerTabs.size, 0);
  assert.equal(target.hasAttribute("zen-linked-tabs-divider"), false);
  assert.equal(content.children.length, 3);
  assert.equal(favicon.nextSibling, audio);
  c.destroy();
});

test("does not add an address-bar button even when the main toolbar exists", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init();
  assert.equal(win.document.getElementById("nav-bar-customization-target").children.length, 0);
  assert.equal(win.document.getElementById("nav-bar").children.length, 0);
  assert.equal(c.paneControls.size, 2);
  c.destroy();
});

test("adding a third pane removes the link controls and arrow; returning to two restores only the controls", async () => {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { win, source, target } = browserWindow();
  const c = new LinkedTabsController(win);
  c.init(); c.link(source);
  const oldButton = c.paneControls.get(source).button;
  const third = browserWindow(30).source;
  third.group = source.group;
  source.group.tabs = [source, target, third];
  win.gBrowser.tabs.push(third);
  win.gZenViewSplitter.splitViewBrowsers = win.gBrowser.tabs.map(tab => tab.linkedBrowser);
  c.refresh();
  assert.equal(c.paneControls.size, 0);
  assert.equal(oldButton.isConnected, false);
  assert.equal(c.pairs.length, 0);
  assert.equal(c.dividerTabs.size, 0);
  assert.equal(source.hasAttribute("zen-linked-tabs-divider"), false);
  source.group.tabs = [source, target];
  win.gBrowser.tabs = [source, target];
  win.gZenViewSplitter.splitViewBrowsers = win.gBrowser.tabs.map(tab => tab.linkedBrowser);
  c.refresh();
  assert.equal(c.paneControls.size, 2);
  assert.equal(c.pairs.length, 0);
  c.destroy();
});
