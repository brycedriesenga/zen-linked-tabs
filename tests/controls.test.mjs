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
