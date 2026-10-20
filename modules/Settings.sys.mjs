export const PREF_BRANCH = "zen-linked-tabs.";

// Runtime fallbacks also apply before Sine's settings dialog is first opened.
export const DEFAULTS = {
  "focus-destination": false,
  "mark-last-link": false,
  "source-modifier.alt": true,
  "source-modifier.shift": true,
  "source-modifier.ctrl": false,
  "source-modifier.meta": false,
  "marker.style": "badge", "marker.color": "accent", "marker.custom-color": "#6366f1",
  "marker.size": 14, "marker.position": "auto", "marker.icon": "arrow",
  "marker.emphasis": "normal", "marker.thickness": 0, "marker.offset": 2,
  "marker.opacity": 0, "marker.outline-style": "solid"
};

export function readSettings() {
  const value = key => {
    const method = { boolean: "getBoolPref", number: "getIntPref", string: "getStringPref" }[typeof DEFAULTS[key]];
    try { return Services.prefs[method](PREF_BRANCH + key, DEFAULTS[key]); }
    catch {
      // Sine dropdowns compare string-valued DOM options. Store their numeric
      // choices as strings, accepting either representation at runtime.
      if (typeof DEFAULTS[key] === "number") {
        try { return Number(Services.prefs.getStringPref(PREF_BRANCH + key, String(DEFAULTS[key]))); }
        catch {}
      }
      return DEFAULTS[key];
    }
  };
  return {
    focusDestination: value("focus-destination"),
    markLastLink: value("mark-last-link"),
    sourceModifiers: Object.fromEntries(["alt", "shift", "ctrl", "meta"].map(key => [key, value("source-modifier." + key)])),
    marker: normalizeMarker(Object.fromEntries([
      ["style", "style"], ["color", "color"], ["customColor", "custom-color"], ["size", "size"],
      ["position", "position"], ["icon", "icon"], ["emphasis", "emphasis"], ["thickness", "thickness"],
      ["offset", "offset"], ["opacity", "opacity"], ["outlineStyle", "outline-style"]
    ].map(([name, key]) => [name, value("marker." + key)])))
  };
}

export function modifierLabel(modifiers, mac = false) {
  return ["ctrl", "alt", "shift", "meta"].filter(key => modifiers[key])
    .map(key => ({ ctrl: "Ctrl", alt: mac ? "Option" : "Alt", shift: "Shift", meta: mac ? "Command" : "Meta/Windows" })[key]).join("+");
}
import { normalizeMarker } from "./Marker.sys.mjs";

