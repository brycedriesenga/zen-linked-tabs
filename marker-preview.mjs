import { LinkMarker, normalizeMarker } from "./modules/Marker.sys.mjs";

let initial = {};
try { initial = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch {}
let options = normalizeMarker(initial);
let marker, selected;
const controls = document.getElementById("controls");
const advanced = document.createElement("details");
const summary = document.createElement("summary"); summary.textContent = "Advanced styling"; advanced.appendChild(summary);
const advancedBody = document.createElement("div"); advanced.appendChild(advancedBody);

function mark(link) {
  marker?.destroy(); selected = link;
  marker = new LinkMarker(link, options);
  document.getElementById("status").textContent = `Preview: ${options.style} · ${link.id.replace("-link", "")}`;
}

function control(key, title, choices, parent = controls) {
  const label = document.createElement("label");
  const caption = document.createElement("span"); caption.textContent = title; label.appendChild(caption);
  const input = document.createElement(choices ? "select" : "input");
  input.id = "marker-" + key;
  if (choices) {
    for (const [value, text] of choices) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; input.appendChild(option);
    }
    if (!choices.some(([value]) => String(value) === String(options[key]))) {
      const current = document.createElement("option"); current.value = options[key]; current.textContent = `${options[key]} (current)`; input.appendChild(current);
    }
  } else input.type = "color";
  input.value = options[key];
  input.addEventListener("input", () => {
    options = normalizeMarker({ ...options, [key]: ["size", "thickness", "offset", "opacity"].includes(key) ? Number(input.value) : input.value });
    if (selected) mark(selected);
  });
  label.appendChild(input); parent.appendChild(label);
}

control("style", "Style", [["badge", "Badge"], ["underline", "Underline"], ["highlight", "Soft highlight"], ["combined", "Underline + highlight"], ["outline", "Outline"]]);
control("color", "Color", [["accent", "Browser accent"], ["link", "Link text color"], ["custom", "Custom color"]]);
control("customColor", "Custom color");
control("emphasis", "Emphasis", [["subtle", "Subtle"], ["normal", "Normal"], ["strong", "Strong"]]);
control("icon", "Badge icon", [["arrow", "Arrow"], ["dot", "Dot"], ["split", "Split panes"]]);
control("size", "Badge size", [[12, "12px"], [14, "14px"], [16, "16px"], [18, "18px"]]);
control("position", "Badge placement", [["auto", "Automatic"], ["before", "Before first line"], ["after", "After first line"], ["corner", "Above leading corner"]]);
control("thickness", "Line thickness", [[0, "Automatic"], [1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"], [5, "5px"]], advancedBody);
control("offset", "Underline offset", [[0, "0px"], [1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"], [6, "6px"], [8, "8px"]], advancedBody);
control("opacity", "Highlight opacity", [[0, "Automatic"], [10, "10%"], [15, "15%"], [20, "20%"], [30, "30%"], [40, "40%"], [60, "60%"]], advancedBody);
control("outlineStyle", "Outline line style", [["solid", "Solid"], ["dotted", "Dotted"], ["dashed", "Dashed"]], advancedBody);
controls.appendChild(advanced);
for (const link of document.querySelectorAll("a[href]")) link.addEventListener("click", event => { event.preventDefault(); mark(link); });
window.addEventListener("pagehide", () => marker?.destroy());
// Expose only read-only state for deterministic fixture checks.
window.markerPreviewState = () => ({ style: options.style, selected: selected?.id, options: { ...options }, active: !!marker && !marker.destroyed });
mark(document.getElementById("search-link"));
