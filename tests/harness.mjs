import vm from "node:vm";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setMaxListeners } from "node:events";

export async function harness(options = {}) {
  const state = new Map();
  const registered = new Map();
  let serial = 0;
  const Services = {
    uuid: { generateUUID: () => `token-${++serial}` },
    ppmm: { sharedData: { set: (k, v) => state.set(k, v), flush() {} } },
    cpmm: { sharedData: { get: k => state.get(k) } },
    io: { newURI: spec => ({ spec, schemeIs: scheme => new URL(spec).protocol === `${scheme}:` }) },
    scriptSecurityManager: {
      checkLoadURIStrWithPrincipal(principal, href) {
        if (!principal || !/^https?:/.test(href)) throw new Error("Denied");
      }
    }
  };
  const E10SUtils = {
    serializeReferrerInfo: value => value.data,
    deserializeReferrerInfo: value => ({ referrer: value }),
    serializePolicyContainer: value => value,
    deserializePolicyContainer: value => value
  };
  const context = vm.createContext({
    URL, console: { info() {}, error() {} }, Services, JSWindowActorChild: class {}, JSWindowActorParent: class {},
    Cc: { "@mozilla.org/referrer-info;1": { createInstance: () => ({
      initWithElement(node) { this.data = { url: node.ownerDocument.URL, rel: node.getAttribute("rel") }; }
    }) } },
    Ci: { nsIReferrerInfo: {} },
    ChromeUtils: {
      registerWindowActor(name, actorOptions) {
        if (options.actorRegistrationError) throw new Error("Actor registration failed");
        registered.set(name, actorOptions);
      },
      unregisterWindowActor(name) { registered.delete(name); }
    }
  });
  const cache = new Map();
  async function load(url) {
    if (cache.has(url)) return cache.get(url);
    if (url.startsWith("resource:")) {
      const exports = url.includes("BrowserUtils") ? {
        BrowserUtils: { hrefAndLinkNodeForClickEvent: event => [event.href, event.node] }
      } : { E10SUtils };
      const module = new vm.SyntheticModule(Object.keys(exports), function() {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier: url });
      cache.set(url, module);
      return module;
    }
    const code = await fs.readFile(fileURLToPath(url), "utf8");
    const module = new vm.SourceTextModule(code, {
      context, identifier: url, initializeImportMeta: meta => { meta.url = url; }
    });
    cache.set(url, module);
    await module.link((spec, ref) => load(new URL(spec, ref.identifier).href));
    return module;
  }
  async function imports(path) {
    const module = await load(new URL(`../${path}`, import.meta.url).href);
    if (module.status !== "evaluated") await module.evaluate();
    return module.namespace;
  }
  return { imports, state, registered, Services };
}

export class Node extends EventTarget {
  constructor() { super(); this.attrs = new Map(); this.children = []; this.isConnected = true; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? ""; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(node) {
    node.parentNode?.removeChild(node);
    this.children.push(node); node.parentNode = this; node.isConnected = true; return node;
  }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; }
  insertBefore(node, sibling) {
    if (!sibling) return this.appendChild(node);
    const index = this.children.indexOf(sibling);
    if (index < 0) throw new Error("Sibling not found");
    node.parentNode?.removeChild(node);
    this.children.splice(index, 0, node); node.parentNode = this; node.isConnected = true;
    return node;
  }
  querySelector(selector) {
    for (const node of this.children) {
      if (selector.startsWith(".") && node.getAttribute("class").split(" ").includes(selector.slice(1))) return node;
      const nested = node.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  remove() { this.parentNode?.removeChild(this); this.isConnected = false; }
}

export function browserWindow(firstId = 1, options = {}) {
  const win = new EventTarget();
  win.AbortController = class extends AbortController {
    constructor() { super(); setMaxListeners(0, this.signal); }
  };
  win.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; }
    observe(target) { if (!target) throw new Error("Missing observer target"); this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  };
  const elements = new Map();
  for (const id of ["nav-bar-customization-target", "nav-bar", "tabContextMenu"]) elements.set(id, new Node());
  win.document = {
    createXULElement: () => new Node(), createElementNS: () => new Node(), documentElement: new Node(),
    getElementById: id => options.toolbar === false && id.startsWith("nav-bar") ? null : elements.get(id)
  };
  const tabs = [firstId, firstId + 1].map(id => {
    const tab = new Node();
    tab.label = `Tab ${id}`;
    const context = { id, usePrivateBrowsing: false };
    context.top = context;
    tab.linkedBrowser = {
      documentGlobal: win, ownerDocument: { defaultView: win }, browsingContext: context, loads: [],
      closest: () => tab.container,
      loadURI(uri, options) { this.loads.push({ uri, options }); }
    };
    context.embedderElement = tab.linkedBrowser;
    tab.container = new Node();
    return tab;
  });
  const group = new Node();
  group.setAttribute("split-view-group", "true");
  group.tabs = tabs;
  for (const tab of tabs) tab.group = group;
  win.gBrowser = { tabs, selectedTab: tabs[0], tabContainer: new Node(), tabpanels: new Node() };
  for (const tab of tabs) win.gBrowser.tabpanels.appendChild(tab.container);
  win.installHeaders = () => {
    for (const tab of tabs) {
      tab.container.querySelector(".zen-view-splitter-header")?.remove();
      const header = new Node();
      header.setAttribute("class", "zen-view-splitter-header");
      for (const name of ["zen-tab-rearrange-button", "zen-tab-unsplit-button"]) {
        const button = new Node(); button.setAttribute("class", name); header.appendChild(button);
      }
      tab.container.appendChild(header);
    }
  };
  if (options.headers !== false) win.installHeaders();
  win.gZenViewSplitter = { splitViewBrowsers: tabs.map(tab => tab.linkedBrowser) };
  return { win, source: tabs[0], target: tabs[1] };
}

export function click(overrides = {}) {
  const attrs = overrides.attrs || {};
  const doc = {
    URL: "https://example.com/search", nodePrincipal: { origin: "https://example.com" },
    policyContainer: { csp: "source-policy" }, querySelector: () => null
  };
  return {
    isTrusted: true, defaultPrevented: false, button: 0, type: "click",
    href: "https://example.org/article",
    node: {
      ownerDocument: doc, hasAttribute: key => Object.hasOwn(attrs, key),
      getAttribute: key => attrs[key] || ""
    },
    target: {}, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...overrides
  };
}
