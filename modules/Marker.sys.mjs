// DOM-only renderer shared by the content actor and the appearance preview.
// It never rewrites the link, wraps its text, or changes its inline styles.
export const DEFAULT_MARKER = Object.freeze({
  style: "badge", color: "accent", customColor: "#6366f1", size: 14,
  position: "auto", icon: "arrow", emphasis: "normal", thickness: 0,
  offset: 2, opacity: 0, outlineStyle: "solid", accentColor: "#6366f1"
});
let highlightSerial = 0;

export function normalizeMarker(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const choice = (name, values) => values.includes(input[name]) ? input[name] : DEFAULT_MARKER[name];
  const number = (name, min, max) => Number.isFinite(Number(input[name]))
    ? Math.min(max, Math.max(min, Number(input[name]))) : DEFAULT_MARKER[name];
  let customColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.customColor || "") ? input.customColor : DEFAULT_MARKER.customColor;
  if (customColor.length === 4) customColor = "#" + [...customColor.slice(1)].map(char => char + char).join("");
  return {
    style: choice("style", ["badge", "underline", "highlight", "combined", "outline"]),
    color: choice("color", ["accent", "link", "custom"]),
    customColor,
    size: number("size", 10, 22), position: choice("position", ["auto", "before", "after", "corner"]),
    icon: choice("icon", ["arrow", "dot", "split"]),
    emphasis: choice("emphasis", ["subtle", "normal", "strong"]),
    thickness: number("thickness", 0, 5), offset: number("offset", 0, 8),
    opacity: number("opacity", 0, 60), outlineStyle: choice("outlineStyle", ["solid", "dotted", "dashed"]),
    // Browser-owned theme color is passed through a property, never CSS text.
    accentColor: typeof input.accentColor === "string" && input.accentColor.length < 160 ? input.accentColor : DEFAULT_MARKER.accentColor
  };
}

const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function mergeLineRects(rectangles) {
  const lines = [];
  for (const rect of rectangles.filter(r => r.width > 0.5 && r.height > 0.5).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find(r => Math.abs((r.top + r.bottom) / 2 - (rect.top + rect.bottom) / 2) < Math.min(r.height, rect.height) * 0.5 &&
      rect.left <= r.right + Math.max(4, r.height * 0.5) && rect.right >= r.left - Math.max(4, r.height * 0.5));
    if (line) Object.assign(line, box({ left: Math.min(line.left, rect.left), right: Math.max(line.right, rect.right), top: Math.min(line.top, rect.top), bottom: Math.max(line.bottom, rect.bottom) }));
    else lines.push(box(rect));
  }
  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

export function badgePosition(lines, bounds, options = {}, blocked = () => false) {
  if (!lines.length) return null;
  const { size = 14, position = "auto", rtl = false } = options;
  const line = lines[0], gap = 5;
  const before = { left: rtl ? line.right + gap : line.left - size - gap, top: line.top + (line.height - size) / 2 };
  const after = { left: rtl ? line.left - size - gap : line.right + gap, top: before.top };
  const corner = { left: rtl ? line.right - size : line.left, top: line.top - size - gap };
  const candidates = position === "auto" ? [before, after, corner] : [{ before, after, corner }[position]];
  for (const candidate of candidates) {
    const rect = box({ ...candidate, right: candidate.left + size, bottom: candidate.top + size });
    if (rect.left < bounds.left || rect.top < bounds.top || rect.right > bounds.right || rect.bottom > bounds.bottom) continue;
    if (lines.some(text => overlaps(rect, text)) || blocked(rect)) continue;
    return rect;
  }
  return null; // Crowded/clipped titles are never covered by a forced badge.
}

function visible(element, win) {
  const style = win.getComputedStyle(element);
  for (let parent = element; parent; parent = parent.parentElement || parent.getRootNode()?.host) {
    if (Number(win.getComputedStyle(parent).opacity) === 0) return false;
  }
  return style.display !== "none" && style.contentVisibility !== "hidden" && style.visibility !== "hidden" && style.visibility !== "collapse" &&
    !element.closest?.('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0;
}

const TITLE = 'h1,h2,h3,h4,h5,h6,[role="heading"],[slot="title"],[data-testid="post-title"]';
const POST = 'article,[role="article"],shreddit-post,.thing';

export function markerTarget(link) {
  const doc = link.ownerDocument, win = doc.defaultView;
  const heading = Array.from(link.querySelectorAll(TITLE)).find(node => node.textContent.trim() && visible(node, win));
  if (heading) return heading;
  if (link.textContent.trim()) return link;
  // Some community feeds put an empty, full-card link above a separate title.
  // Only search a bounded semantic post card, and reject another link's title.
  const card = link.closest(POST);
  if (card) {
    const title = Array.from(card.querySelectorAll(TITLE)).find(node => {
      const otherLink = node.closest("a[href]");
      return (!otherLink || otherLink.href === link.href) && node.textContent.trim() && visible(node, win);
    });
    if (title) return title;
  }
  return link.querySelector("img,svg") || link;
}

function textGeometry(target) {
  const doc = target.ownerDocument, win = doc.defaultView;
  const walker = doc.createTreeWalker(target, 4); // SHOW_TEXT
  const rects = [], ranges = [];
  let text, examined = 0;
  while ((text = walker.nextNode()) && examined++ < 200) {
    const value = text.textContent;
    if (!value.trim() || text.parentElement.closest("script,style,noscript,svg") || !visible(text.parentElement, win)) continue;
    const range = doc.createRange();
    range.setStart(text, value.search(/\S/));
    range.setEnd(text, value.length - (value.match(/\s*$/)?.[0].length || 0));
    rects.push(...range.getClientRects());
    ranges.push(range);
  }
  return { lines: mergeLineRects(rects), ranges };
}

function clippedBounds(target, badge = false) {
  const doc = target.ownerDocument, win = doc.defaultView;
  const bounds = { left: 0, top: 0, right: doc.documentElement.clientWidth, bottom: win.innerHeight };
  const card = badge ? target.closest(POST) : null;
  let insideCard = !!card && target !== card;
  for (let node = target; node && node !== doc.documentElement; node = node.parentElement || node.getRootNode()?.host) {
    if (node === card) insideCard = false;
    const style = win.getComputedStyle(node), rect = node.getBoundingClientRect();
    // Overflow does not create a clip on non-replaced inline boxes. In
    // particular, a visible inline a.title on classic Reddit has zero client
    // dimensions even though its text Range has valid rectangles.
    if (style.display === "contents" || (style.display === "inline" && !node.matches("img,video,audio,canvas,iframe,embed,object,input,textarea,select"))) continue;
    const left = rect.left + node.clientLeft, top = rect.top + node.clientTop;
    // A badge may use the free gutter inside a semantic post, beyond its
    // title/entry layout clips. Scroll containers and the post's own/outer
    // boundaries still apply. Text styles always keep every real clip.
    const gutter = badge && (insideCard || (node === target && node !== card));
    const clips = value => /^(auto|scroll)$/.test(value) || (!gutter && /^(hidden|clip)$/.test(value));
    if (clips(style.overflowX)) {
      bounds.left = Math.max(bounds.left, left); bounds.right = Math.min(bounds.right, left + node.clientWidth);
    }
    if (clips(style.overflowY)) {
      bounds.top = Math.max(bounds.top, top); bounds.bottom = Math.min(bounds.bottom, top + node.clientHeight);
    }
  }
  return bounds;
}

export class LinkMarker {
  constructor(node, options = {}) {
    this.node = node;
    this.doc = node.ownerDocument;
    this.win = this.doc.defaultView;
    this.options = normalizeMarker(options);
    this.abort = new this.win.AbortController();
    this.schedule = () => {
      if (!this.destroyed && !this.frame) this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.render(); });
    };
    const listen = (target, type, capture = false) => target?.addEventListener(type, this.schedule, { capture, signal: this.abort.signal });
    listen(this.win, "scroll", true); listen(this.win, "resize");
    listen(this.win.visualViewport, "resize"); listen(this.win.visualViewport, "scroll");
    listen(this.doc.fonts, "loadingdone");
    this.observer = new this.win.MutationObserver(records => {
      if (records.some(record => record.target !== this.host)) this.schedule();
    });
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open"] });
    if (this.win.ResizeObserver) {
      this.resizeObserver = new this.win.ResizeObserver(this.schedule);
      this.resizeObserver.observe(node);
      this.resizeObserver.observe(this.doc.documentElement);
    }
    this.schedule();
  }

  update(options) { this.options = normalizeMarker(options); this.schedule(); }

  svgElement(name, attrs = {}, parent = this.group) {
    const element = this.doc.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    parent?.appendChild(element);
    return element;
  }

  createOverlay() {
    this.host = this.doc.createElement("div");
    this.host.setAttribute("data-zen-linked-tabs-marker", "");
    this.host.setAttribute("aria-hidden", "true");
    for (const [key, value] of Object.entries({ all: "initial", position: "fixed", inset: "0", display: "block", width: "100%", height: "100%", margin: "0", padding: "0", border: "0", "pointer-events": "none", "z-index": "2147483646", contain: "strict" })) this.host.style.setProperty(key, value, "important");
    const shadow = this.host.attachShadow({ mode: "closed" });
    this.svg = this.svgElement("svg", { width: "100%", height: "100%", focusable: "false", "aria-hidden": "true", style: "display:block;pointer-events:none;overflow:hidden" }, shadow);
    this.doc.documentElement.appendChild(this.host);
  }

  resolveColor(target) {
    const options = this.options;
    const candidate = options.color === "link" ? this.win.getComputedStyle(target).color : options.color === "custom" ? options.customColor : options.accentColor;
    // Resolve named/system/theme colors using a property in the isolated shadow
    // tree; never concatenate a user value into a stylesheet or SVG markup.
    this.host.style.setProperty("color", this.win.CSS.supports("color", candidate) ? candidate : DEFAULT_MARKER.accentColor, "important");
    return this.win.getComputedStyle(this.host).color;
  }

  blocked(rect) {
    const points = [[rect.left + 1, rect.top + 1], [rect.right - 1, rect.top + 1], [rect.left + 1, rect.bottom - 1], [rect.right - 1, rect.bottom - 1], [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]];
    for (const [x, y] of points) {
      const element = this.doc.elementFromPoint(x, y);
      if (!element || element === this.host) continue;
      const control = element.closest?.('a,button,input,textarea,select,[role="button"],img,svg');
      if (control && control !== this.node && !this.node.contains(control) && !control.contains(this.node)) return true;
      // Detect nearby text as well as controls, without scanning the page DOM.
      const caret = this.doc.caretPositionFromPoint?.(x, y);
      const text = caret?.offsetNode;
      if (text?.nodeType === 3 && text.textContent.length) {
        const range = this.doc.createRange(), offset = Math.min(caret.offset, text.textContent.length - 1);
        range.setStart(text, offset); range.setEnd(text, offset + 1);
        if (Array.from(range.getClientRects()).some(r => overlaps(rect, r))) return true;
      }
    }
    return false;
  }

  drawBadge(rect, color, rtl) {
    const size = rect.width, x = rect.left + size / 2, y = rect.top + size / 2;
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [99, 102, 241];
    const luminance = channels.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    let ink = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.179 ? "#111" : "#fff";
    if (this.inkColor !== color) {
      try {
        // Resolve wide-gamut/theme colors too, instead of assuming rgb() output.
        const canvas = this.doc.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        const linear = rgb.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        ink = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.179 ? "#111" : "#fff";
      } catch {}
      this.inkColor = color; this.ink = ink;
    }
    ink = this.ink;
    this.svgElement("circle", { cx: x, cy: y, r: size / 2, fill: color });
    const g = this.svgElement("g", { transform: `translate(${rect.left} ${rect.top}) scale(${size / 16})`, fill: "none", stroke: ink, "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" });
    if (this.options.icon === "dot") this.svgElement("circle", { cx: 8, cy: 8, r: 2, fill: ink, stroke: "none" }, g);
    else if (this.options.icon === "split") this.svgElement("path", { d: "M3.5 4h9v8h-9z M8 4v8 M5 8h5 M9 6.5 10.5 8 9 9.5" }, g);
    else this.svgElement("path", { d: rtl ? "M11 11 5 5 M5 10V5h5" : "M5 11 11 5 M6 5h5v5" }, g);
  }

  clearHighlight() {
    try {
      if (this.highlightName && this.win.CSS.highlights?.get(this.highlightName) === this.highlight) this.win.CSS.highlights.delete(this.highlightName);
    } catch {} // The old document may already be going away.
    try {
      if (this.highlightSheet) this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter(sheet => sheet !== this.highlightSheet);
    } catch {}
    this.highlight = this.highlightSheet = null;
  }

  paintHighlight(ranges, color, opacity) {
    if (!ranges.length || !this.win.Highlight || !this.win.CSS.highlights || !this.win.CSSStyleSheet || !this.doc.adoptedStyleSheets) return false;
    try {
      if (!this.highlightSheet) {
        this.highlightName = "zen-linked-tabs-last-" + ++highlightSerial;
        this.highlightSheet = new this.win.CSSStyleSheet();
        this.highlightSheet.insertRule(`::highlight(${this.highlightName}) {}`);
        this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, this.highlightSheet];
      }
      // The native text highlight paints behind glyphs and follows wrapping,
      // clipping and page selection without changing the original text color.
      this.highlightSheet.cssRules[0].style.setProperty("background-color", `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`);
      this.highlight = new this.win.Highlight(...ranges);
      this.win.CSS.highlights.set(this.highlightName, this.highlight);
      return true;
    } catch { this.clearHighlight(); return false; }
  }

  render() {
    if (this.destroyed) return;
    if (!this.node.isConnected || this.win.closed) { this.destroy(); return; }
    const target = markerTarget(this.node);
    if (this.resizeObserver && this.target !== target) {
      if (this.target) this.resizeObserver.unobserve(this.target);
      this.resizeObserver.observe(target); this.target = target;
    }
    const { lines, ranges } = textGeometry(target);
    if (!lines.length && visible(target, this.win)) lines.push(box(target.getBoundingClientRect()));
    if (!this.host) this.createOverlay();
    this.svg.replaceChildren();
    this.group = null;
    this.svg.setAttribute("viewBox", `0 0 ${this.doc.documentElement.clientWidth} ${this.win.innerHeight}`);
    const textBounds = clippedBounds(target);
    const isBadge = this.options.style === "badge";
    const bounds = isBadge ? clippedBounds(target, true) : textBounds;
    // Relaxing a title's layout clip for the badge must not mark text that
    // is itself hidden. A badge follows the first line, including on scroll.
    const hasVisibleText = (isBadge ? lines.slice(0, 1) : lines).some(line => overlaps(line, textBounds));
    if (!hasVisibleText || bounds.right <= bounds.left || bounds.bottom <= bounds.top || !visible(target, this.win)) { this.clearHighlight(); return; }
    // A nested SVG viewport clips without fragment URL references, which can
    // resolve differently on pages with a <base> URL or inside a shadow tree.
    this.group = this.svgElement("svg", {
      x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
      viewBox: `${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`,
      style: "overflow:hidden;pointer-events:none", focusable: "false"
    }, this.svg);
    const color = this.resolveColor(target), options = this.options;
    const rtl = this.win.getComputedStyle(target).direction === "rtl";
    const strength = { subtle: [1, 0.1], normal: [2, 0.17], strong: [3, 0.26] }[options.emphasis];
    const thickness = options.thickness || strength[0], opacity = options.opacity ? options.opacity / 100 : strength[1];
    const wantsHighlight = ["highlight", "combined"].includes(options.style);
    if (!wantsHighlight) this.clearHighlight();
    const nativeHighlight = wantsHighlight && this.paintHighlight(ranges, color, opacity);
    if (options.style === "badge") {
      const rect = badgePosition(lines, bounds, { ...options, rtl }, r => this.blocked(r));
      if (rect) this.drawBadge(rect, color, rtl);
      return;
    }
    const fontSize = parseFloat(this.win.getComputedStyle(target).fontSize) || 16;
    for (const rect of lines) {
      if (!overlaps(rect, bounds)) continue;
      if (wantsHighlight && !nativeHighlight) this.svgElement("rect", { x: rect.left, y: rect.top, width: rect.width, height: rect.height, rx: 2, fill: color, opacity });
      if (["underline", "combined"].includes(options.style)) {
        const y = rect.bottom - Math.max(2, fontSize * 0.2) + options.offset;
        this.svgElement("line", { x1: rect.left, x2: rect.right, y1: y, y2: y, stroke: color, "stroke-width": thickness });
      }
      if (options.style === "outline") this.svgElement("rect", { x: rect.left - 2, y: rect.top - 1, width: rect.width + 4, height: rect.height + 2, rx: 2, fill: "none", stroke: color, "stroke-width": thickness, "stroke-dasharray": { dotted: "1 3", dashed: "4 3", solid: "none" }[options.outlineStyle] });
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.clearHighlight();
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.host?.remove();
  }
}
