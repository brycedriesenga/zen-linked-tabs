import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { harness, browserWindow, click } from "./harness.mjs";

async function setup() {
  const env = await harness();
  const { LinkedTabsController } = await env.imports("modules/Controller.sys.mjs");
  const { ZenLinkedTabsV1Child } = await env.imports("actors/LinkedTabsChild.sys.mjs");
  const { ZenLinkedTabsV1Parent } = await env.imports("actors/LinkedTabsParent.sys.mjs");
  const { win, source, target } = browserWindow();
  const controller = new LinkedTabsController(win);
  win.ZenLinkedTabs = controller;
  controller.init();
  const child = new ZenLinkedTabsV1Child();
  const parent = new ZenLinkedTabsV1Parent();
  const manager = {
    documentPrincipal: { origin: "https://example.com", originAttributes: {} },
    domProcess: { remoteType: "webIsolated=https://example.com" }
  };
  child.browsingContext = parent.browsingContext = source.linkedBrowser.browsingContext;
  parent.manager = manager;
  parent.browsingContext.currentWindowGlobal = manager;
  const messages = [];
  child.sendAsyncMessage = (name, data) => messages.push({ name, data });
  return { ...env, win, source, target, controller, child, parent, messages, manager };
}

test("routes a normal anchor to the existing destination with the source principal, referrer and policy", async () => {
  const h = await setup();
  assert.equal(h.controller.link(h.source), true);
  const event = click({ attrs: { rel: "noreferrer" } });
  h.child.handleEvent(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true); // capture phase preempts a normal SPA click handler
  h.parent.receiveMessage(h.messages[0]);
  assert.equal(h.source.linkedBrowser.loads.length, 0);
  const load = h.target.linkedBrowser.loads[0];
  assert.equal(load.uri.spec, event.href);
  assert.equal(load.options.triggeringPrincipal, h.manager.documentPrincipal);
  assert.equal(load.options.referrerInfo.referrer.rel, "noreferrer");
  assert.equal(load.options.policyContainer.csp, "source-policy");
  assert.equal(h.win.gBrowser.selectedTab, h.source);
  h.controller.destroy();
});

test("preserves modifier clicks, middle click, anchors, downloads, named targets and non-web schemes", async () => {
  const h = await setup();
  h.controller.link(h.source);
  for (const overrides of [
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    { button: 1 }, { button: 2 }, { isTrusted: false }, { defaultPrevented: true },
    { attrs: { download: "" } }, { attrs: { target: "named-frame" } },
    { href: "https://example.com/search#heading" }, { href: "https://example.com/search#" },
    { href: "javascript:alert(1)" }, { href: "mailto:test@example.com" },
    { href: "file:///tmp/x" }, { href: "about:config" },
    { target: { isContentEditable: true } }
  ]) {
    const event = click(overrides);
    h.child.handleEvent(event);
    assert.equal(event.prevented, false, JSON.stringify(overrides));
  }
  assert.equal(h.messages.length, 0);
  h.controller.destroy();
});

test("routes target=_blank links without opening a new tab; destination clicks stay native", async () => {
  const h = await setup();
  h.controller.link(h.source);
  const event = click({ attrs: { target: "_blank" } });
  h.child.handleEvent(event);
  h.parent.receiveMessage(h.messages[0]);
  assert.equal(h.target.linkedBrowser.loads.length, 1);
  h.child.browsingContext = h.target.linkedBrowser.browsingContext;
  const second = click();
  h.child.handleEvent(second);
  assert.equal(second.prevented, false);
  h.controller.destroy();
});

test("unlinks, reverses direction and replaces its token", async () => {
  const h = await setup();
  h.controller.link(h.source);
  const token = h.controller.pairs[0].token;
  h.controller.reverse(h.source);
  assert.equal(h.controller.pairs[0].source, h.target);
  assert.notEqual(h.controller.pairs[0].token, token);
  assert.equal(h.controller.destinationFor(h.source.linkedBrowser, token), null);
  h.controller.unlink(h.target);
  const event = click();
  h.child.handleEvent(event);
  assert.equal(event.prevented, false);
  assert.equal(h.controller.pairs.length, 0);
  h.controller.destroy();
});

test("a consumed click falls back to the source when unlinked before IPC arrives", async () => {
  const h = await setup();
  h.controller.link(h.source);
  h.child.handleEvent(click());
  h.controller.unlink(h.source);
  h.parent.receiveMessage(h.messages[0]);
  assert.equal(h.source.linkedBrowser.loads.length, 1);
  assert.equal(h.target.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("a stale document cannot navigate either pane", async () => {
  const h = await setup();
  h.controller.link(h.source);
  h.child.handleEvent(click());
  h.parent.browsingContext.currentWindowGlobal = {};
  h.parent.receiveMessage(h.messages[0]);
  assert.equal(h.source.linkedBrowser.loads.length + h.target.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("container, private-state and split-size boundaries are enforced", async () => {
  const h = await setup();
  h.target.setAttribute("usercontextid", "2");
  assert.equal(h.controller.link(h.source), false);
  h.target.removeAttribute("usercontextid");
  h.target.linkedBrowser.browsingContext.usePrivateBrowsing = true;
  assert.equal(h.controller.link(h.source), false);
  h.target.linkedBrowser.browsingContext.usePrivateBrowsing = false;
  h.source.group.tabs.push({});
  assert.equal(h.controller.link(h.source), false);
  h.source.group.tabs.pop();
  assert.equal(h.controller.link(h.source), true);
  h.target.closing = true;
  h.controller.refresh();
  assert.equal(h.controller.pairs.length, 0);
  h.controller.destroy();
});

test("leaving a split pauses interception; unsplitting clears the pair", async () => {
  const h = await setup();
  h.controller.link(h.source);
  h.win.gZenViewSplitter.splitViewBrowsers = [];
  h.controller.refresh();
  const event = click();
  h.child.handleEvent(event);
  assert.equal(event.prevented, false);
  assert.equal(h.controller.pairs.length, 1);
  h.source.group.removeAttribute("split-view-group");
  h.controller.refresh();
  assert.equal(h.controller.pairs.length, 0);
  h.controller.destroy();
});

test("independent windows retain their routes when another window is unloaded", async () => {
  const h = await setup();
  const { LinkedTabsController } = await h.imports("modules/Controller.sys.mjs");
  const second = browserWindow(10);
  const other = new LinkedTabsController(second.win);
  other.init();
  other.link(second.source);
  h.controller.link(h.source);
  assert.equal(h.registered.size, 1);
  h.controller.destroy();
  assert.equal(Object.keys(other.routes()).length, 1);
  assert.equal(h.registered.size, 1);
  other.destroy();
  assert.equal(h.registered.size, 0);
  assert.equal(h.win.ZenLinkedTabs, undefined);
});

test("parent refuses privileged URL IPC even from an enabled source", async () => {
  const h = await setup();
  h.controller.link(h.source);
  h.parent.receiveMessage({ name: "LinkedTabs:Open", data: {
    href: "file:///tmp/secret", token: h.controller.pairs[0].token
  } });
  assert.equal(h.source.linkedBrowser.loads.length + h.target.linkedBrowser.loads.length, 0);
  h.controller.destroy();
});

test("synchronous IPC failure leaves native navigation intact", async () => {
  const h = await setup();
  h.controller.link(h.source);
  h.child.sendAsyncMessage = () => { throw new Error("actor destroyed"); };
  const event = click();
  h.child.handleEvent(event);
  assert.equal(event.prevented, false);
  h.controller.destroy();
});

test("Sine metadata resolves real script and stylesheet entry points", async () => {
  const root = new URL("../", import.meta.url);
  const theme = JSON.parse(await fs.readFile(new URL("theme.json", root), "utf8"));
  assert.equal(theme.id, "zen-linked-tabs");
  for (const path of [...Object.keys(theme.scripts), theme.style.chrome]) {
    assert.ok((await fs.stat(new URL(path, root))).isFile());
  }
});
