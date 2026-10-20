import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMarker, badgePosition, mergeLineRects } from "../modules/Marker.sys.mjs";

const rect = (left, top, width, height = 20) => ({ left, top, right: left + width, bottom: top + height, width, height });
const bounds = { left: 0, top: 0, right: 500, bottom: 500 };

test("marker options validate unknown values, clamp sizes, and reject CSS injection in custom colors", () => {
  const value = normalizeMarker({ style: "unknown", size: 500, opacity: -2, customColor: "red;position:fixed", offset: "3", thickness: "bad" });
  assert.equal(value.style, "badge"); assert.equal(value.size, 22);
  assert.equal(value.opacity, 0); assert.equal(value.customColor, "#6366f1");
  assert.equal(value.offset, 3); assert.equal(value.thickness, 0);
  assert.equal(normalizeMarker(null).style, "badge");
  assert.equal(normalizeMarker({ customColor: "#aBc" }).customColor, "#aaBBcc");
});

test("text fragments on the same line merge without enclosing separate wrapped lines", () => {
  const lines = mergeLineRects([rect(10, 20, 70), rect(82, 20, 30), rect(10, 44, 90), rect(0, 0, 0)]);
  assert.equal(lines.length, 2); assert.equal(lines[0].left, 10);
  assert.equal(lines[0].right, 112); assert.equal(lines[1].top, 44);
});

test("a badge follows the first line rather than the center of a multi-line link", () => {
  const value = badgePosition([rect(50, 30, 200), rect(50, 60, 140)], bounds);
  assert.equal(value.left, 31); assert.equal(value.top, 33);
});

test("automatic placement falls back after the title when its leading edge is clipped", () => {
  const value = badgePosition([rect(2, 30, 200)], bounds);
  assert.equal(value.left, 207);
});

test("automatic placement avoids neighboring controls and falls back above the title", () => {
  const value = badgePosition([rect(50, 50, 200)], bounds, {}, r => r.top > 40);
  assert.equal(value.top, 31); assert.equal(value.left, 50);
});

test("crowded or clipped links do not get a badge covering their text", () => {
  assert.equal(badgePosition([rect(0, 0, 495)], bounds), null);
  assert.equal(badgePosition([rect(50, 30, 200)], bounds, {}, () => true), null);
});

test("explicit positions remain explicit and do not silently cover a neighboring line", () => {
  assert.equal(badgePosition([rect(2, 30, 200)], bounds, { position: "before" }), null);
  const value = badgePosition([rect(50, 30, 200)], bounds, { position: "after", size: 18 });
  assert.equal(value.left, 255); assert.equal(value.width, 18);
});

test("leading and trailing badge placement follow RTL text direction", () => {
  const value = badgePosition([rect(50, 30, 200)], bounds, { rtl: true });
  assert.equal(value.left, 255);
  assert.equal(badgePosition([rect(50, 30, 200)], bounds, { rtl: true, position: "after" }).left, 31);
});

test("badges respect scrolling clips and disappear when their first line leaves the clip", () => {
  const clip = { left: 20, top: 50, right: 300, bottom: 100 };
  assert.equal(badgePosition([rect(50, 20, 200), rect(50, 50, 150)], clip), null);
  assert.equal(badgePosition([rect(50, 60, 200)], clip).top, 63);
});
