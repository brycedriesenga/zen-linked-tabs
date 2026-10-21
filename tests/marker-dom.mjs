// Minimal layout fixture for renderer unit tests. Rectangles are explicit;
// these checks do not claim native-browser font/layout or screenshot coverage.
import { Node, Style } from "./harness.mjs";

export function markerDOM() {
  let nextFrame = 0;
  const frames = new Map();
  const win = new EventTarget();
  win.innerHeight = 700; win.AbortController = AbortController;
  win.CSS = { supports: (_, value) => !value.includes(";") };
  win.requestAnimationFrame = fn => { frames.set(++nextFrame, fn); return nextFrame; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.MutationObserver = class { observe() {} disconnect() { this.disconnected = true; } };
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() { this.disconnected = true; } };
  win.getComputedStyle = element => ({
    display: "block", visibility: "visible", opacity: "1", fontSize: "20px",
    overflowX: "visible", overflowY: "visible", direction: "ltr",
    color: element.style?.getPropertyValue("color") || "rgb(30, 60, 180)",
    ...element.computed
  });
  class Element extends Node {
    constructor(tagName) {
      super(); this.tagName = tagName; this.nodeType = 1; this.style = new Style();
      this.ownerDocument = doc; this.rect = rectangle(0, 0, 600, 50);
      this.clientWidth = 600; this.clientHeight = 50; this.clientLeft = this.clientTop = 0;
    }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get textContent() { return this.children.map(node => node.textContent).join(""); }
    getClientRects() { return [this.rect]; }
    getBoundingClientRect() { return this.rect; }
    getRootNode() { return doc; }
    contains(node) { return node === this || this.children.some(child => child.nodeType === 1 && child.contains(node) || child === node); }
    matches(selector) {
      return selector.split(",").some(part => {
        if (part.trim() === this.tagName) return true;
        if (part.trim().startsWith(".")) return (this.getAttribute("class") || "").split(/\s+/).includes(part.trim().slice(1));
        const attr = part.trim().match(/^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
        const has = attr && (attr[2] === "href" ? !!this.href : this.hasAttribute(attr[2]));
        return attr && (!attr[1] || attr[1] === this.tagName) && has && (attr[3] === undefined || this.getAttribute(attr[2]) === attr[3]);
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(node => node.nodeType === 1 ? [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)] : []); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    attachShadow() { return this.shadow = new Element("shadow"); }
    replaceChildren(...nodes) { this.children = []; for (const node of nodes) this.appendChild(node); }
  }
  const doc = {
    defaultView: win,
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTreeWalker(target) {
      const all = [];
      const visit = node => { for (const child of node.children) if (child.nodeType === 3) all.push(child); else visit(child); };
      visit(target); let index = 0; return { nextNode: () => all[index++] };
    },
    createRange() { return { setStart(node) { this.node = node; }, setEnd() {}, getClientRects() { return this.node.rects; } }; },
    elementFromPoint() { return doc.documentElement; }
  };
  doc.documentElement = new Element("html"); doc.documentElement.clientWidth = 900;
  const link = new Element("a"); link.href = "https://example.org/result";
  link.rect = rectangle(100, 80, 500, 150); doc.documentElement.appendChild(link);
  const heading = new Element("h3"); heading.rect = rectangle(100, 120, 450, 50); link.appendChild(heading);
  const addText = (parent, value, rects) => {
    const text = { nodeType: 3, textContent: value, parentElement: parent, rects };
    parent.children.push(text); return text;
  };
  addText(heading, "A title that wraps", [rectangle(100, 120, 250, 22), rectangle(100, 146, 160, 22)]);
  return { doc, win, link, heading, Element, addText, frames };
}

// Classic Reddit applies overflow:hidden to both p.title and the inline
// a.title. Inline text has Range rects even though its client dimensions are 0.
export function classicPostDOM() {
  const h = markerDOM();
  const card = new h.Element("div"); card.setAttribute("class", "thing");
  card.rect = rectangle(50, 90, 700, 140); card.clientWidth = 700; card.clientHeight = 140;
  h.doc.documentElement.appendChild(card);
  const entry = new h.Element("div"); entry.computed = { overflowX: "hidden", overflowY: "hidden" };
  entry.rect = rectangle(100, 110, 600, 100); entry.clientWidth = 600; entry.clientHeight = 100; card.appendChild(entry);
  const title = new h.Element("p"); title.setAttribute("class", "title"); title.computed = { ...entry.computed };
  title.rect = rectangle(100, 120, 500, 50); title.clientWidth = 500; title.clientHeight = 50; entry.appendChild(title);
  title.appendChild(h.link); h.link.removeChild(h.heading);
  h.link.setAttribute("class", "title"); h.link.computed = { display: "inline", ...entry.computed };
  h.link.rect = rectangle(100, 120, 250, 48); h.link.clientWidth = h.link.clientHeight = 0;
  h.addText(h.link, "A classic community post title that wraps", [rectangle(100, 120, 250, 22), rectangle(100, 146, 160, 22)]);
  return { ...h, card, entry, title };
}

export function rectangle(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}
