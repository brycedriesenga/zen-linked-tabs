export const PREF_BRANCH = "zen-linked-tabs.";

// Runtime fallbacks also apply before Sine's settings dialog is first opened.
export const DEFAULTS = {
  "focus-destination": false,
  "mark-last-link": false,
  "source-modifier.alt": true,
  "source-modifier.shift": true,
  "source-modifier.ctrl": false,
  "source-modifier.meta": false
};

export function readSettings() {
  const value = key => Services.prefs.getBoolPref(PREF_BRANCH + key, DEFAULTS[key]);
  return {
    focusDestination: value("focus-destination"),
    markLastLink: value("mark-last-link"),
    sourceModifiers: Object.fromEntries(["alt", "shift", "ctrl", "meta"].map(key => [key, value("source-modifier." + key)]))
  };
}

export function modifierLabel(modifiers, mac = false) {
  return ["ctrl", "alt", "shift", "meta"].filter(key => modifiers[key])
    .map(key => ({ ctrl: "Ctrl", alt: mac ? "Option" : "Alt", shift: "Shift", meta: mac ? "Command" : "Meta/Windows" })[key]).join("+");
}
