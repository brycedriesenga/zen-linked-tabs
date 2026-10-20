import test from "node:test";
import assert from "node:assert/strict";
import { LinkMarker, markerTarget } from "../modules/Marker.sys.mjs";
import { markerDOM, rectangle } from "./marker-dom.mjs";
import { Style } from "./harness.mjs";

test("renderer anchors a badge to the heading rather than the larger search-result link", () => {
  const h = markerDOM();
  const marker = new LinkMarker(h.link); marker.render();
  assert.equal(markerTarget(h.link), h.heading);
  const circle = marker.group.querySelector("circle");
  assert.ok(circle); assert.equal(Number(circle.getAttribute("cy")), 131);
  assert.equal(h.link.style.values.size, 0);
  assert.equal(h.heading.style.values.size, 0);
  assert.equal(marker.host.style.getPropertyValue("pointer-events"), "none");
  assert.equal(marker.host.getAttribute("aria-hidden"), "true");
  marker.destroy();
});

test("each text style draws separate shapes for wrapped lines and honors explicit styling", () => {
  const h = markerDOM();
  const marker = new LinkMarker(h.link, { style: "combined", color: "custom", customColor: "#ff8800", thickness: 3, opacity: 30 });
  marker.render();
  assert.equal(marker.group.querySelectorAll("line").length, 2);
  assert.equal(marker.group.querySelectorAll("rect").length, 2);
  assert.equal(marker.group.querySelector("line").getAttribute("stroke-width"), "3");
  assert.equal(marker.group.querySelector("rect").getAttribute("opacity"), "0.3");
  marker.update({ style: "outline", outlineStyle: "dashed" }); marker.render();
  assert.equal(marker.group.querySelectorAll("rect").length, 2);
  assert.equal(marker.group.querySelector("rect").getAttribute("stroke-dasharray"), "4 3");
  marker.destroy();
});

test("an empty full-card link resolves the semantic post title without selecting another link's heading", () => {
  const h = markerDOM();
  const article = new h.Element("article"); h.doc.documentElement.appendChild(article);
  article.appendChild(h.link); h.link.removeChild(h.heading); article.appendChild(h.heading);
  assert.equal(markerTarget(h.link), h.heading);
  const otherLink = new h.Element("a"); otherLink.href = "https://example.org/other";
  article.appendChild(otherLink); otherLink.appendChild(h.heading);
  assert.equal(markerTarget(h.link), h.link);
});

test("the badge clears when its title scrolls out of an ancestor clip", () => {
  const h = markerDOM();
  h.link.computed = { overflowY: "auto" }; h.link.rect = rectangle(80, 100, 550, 90); h.link.clientHeight = 90;
  const marker = new LinkMarker(h.link); marker.render();
  assert.ok(marker.group.querySelector("circle"));
  h.link.children[0].children[0].rects = [rectangle(100, 50, 250, 22), rectangle(100, 76, 160, 22)];
  marker.render();
  assert.equal(marker.group.querySelector("circle"), null);
  marker.destroy();
});

test("badge variants render an arrow, a dot, and split panes with the requested size", () => {
  for (const icon of ["arrow", "dot", "split"]) {
    const h = markerDOM(); const marker = new LinkMarker(h.link, { icon, size: 18 }); marker.render();
    assert.equal(marker.group.querySelector("circle").getAttribute("r"), "9");
    assert.equal(marker.group.querySelectorAll("path").length, icon === "dot" ? 0 : 1);
    marker.destroy();
  }
});

test("renderer cleanup removes overlay, observers, and queued frames on removal or explicit destroy", () => {
  const h = markerDOM(); const marker = new LinkMarker(h.link); marker.render();
  const host = marker.host;
  h.link.isConnected = false; marker.render();
  assert.equal(marker.destroyed, true); assert.equal(host.isConnected, false);
  assert.equal(marker.observer.disconnected, true);
  assert.equal(marker.resizeObserver.disconnected, true);
  assert.equal(h.frames.size, 0);
  marker.destroy();
});

test("native text highlighting paints ranges behind glyphs and preserves other adopted stylesheets", () => {
  const h = markerDOM(); const siteSheet = {};
  h.doc.adoptedStyleSheets = [siteSheet];
  h.win.CSS.highlights = new Map();
  h.win.Highlight = class { constructor(...ranges) { this.ranges = ranges; } };
  h.win.CSSStyleSheet = class { constructor() { this.cssRules = []; } insertRule() { this.cssRules.push({ style: new Style() }); } };
  const marker = new LinkMarker(h.link, { style: "combined" }); marker.render();
  assert.equal(h.win.CSS.highlights.size, 1);
  assert.equal(marker.highlight.ranges.length, 1);
  assert.equal(marker.group.querySelectorAll("rect").length, 0);
  assert.equal(marker.group.querySelectorAll("line").length, 2);
  assert.match(marker.highlightSheet.cssRules[0].style.getPropertyValue("background-color"), /17%/);
  marker.update({ style: "badge" }); marker.render();
  assert.equal(h.win.CSS.highlights.size, 0);
  assert.deepEqual(h.doc.adoptedStyleSheets, [siteSheet]);
  marker.destroy();
});

test("unavailable native highlight registration falls back to line rectangles and cleans its sheet", () => {
  const h = markerDOM(); h.doc.adoptedStyleSheets = [];
  h.win.CSS.highlights = { set() { throw new Error("unavailable"); }, get() {} };
  h.win.Highlight = class {};
  h.win.CSSStyleSheet = class { constructor() { this.cssRules = []; } insertRule() { this.cssRules.push({ style: new Style() }); } };
  const marker = new LinkMarker(h.link, { style: "highlight" }); marker.render();
  assert.equal(marker.group.querySelectorAll("rect").length, 2);
  assert.equal(h.doc.adoptedStyleSheets.length, 0);
  marker.destroy();
});
