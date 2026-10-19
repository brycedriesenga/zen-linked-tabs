import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";

export class ZenLinkedTabsV1Parent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name !== "LinkedTabs:Open") return { ok: false, outcome: "unknown-message" };
    const context = this.browsingContext;
    const browser = context.top.embedderElement;
    // ownerGlobal was removed from current Gecko. Use its replacement, with a
    // standard DOM fallback for other supported Zen versions.
    const win = browser?.documentGlobal || browser?.ownerDocument?.defaultView;
    if (!browser || !win?.gBrowser || win.closed) {
      console.error("[Linked Tabs] Could not resolve the browser window");
      return { ok: false, outcome: "browser-window-unavailable" };
    }
    const record = (outcome, error = "") => win.ZenLinkedTabs?.recordNavigation(outcome, error);
    // Never let a delayed click navigate a replacement document or another tab.
    if (context !== context.top || context.currentWindowGlobal !== this.manager) {
      record("stale-document");
      return { ok: true, outcome: "stale-document" };
    }
    const data = message.data;
    if (!data || typeof data.href !== "string" || typeof data.token !== "string") return { ok: false, outcome: "invalid-message" };
    const principal = this.manager.documentPrincipal;
    try {
      const uri = Services.io.newURI(data.href);
      if (!uri.schemeIs("http") && !uri.schemeIs("https")) return { ok: false, outcome: "unsupported-scheme" };
      Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(principal, data.href);
      const target = win.ZenLinkedTabs?.destinationFor(browser, data.token);
      // If unlinked/unsplit/closed between click and IPC, continue in the source.
      const destination = target || browser;
      const options = {
        triggeringPrincipal: principal,
        referrerInfo: E10SUtils.deserializeReferrerInfo(data.referrerInfo),
        triggeringRemoteType: this.manager.domProcess?.remoteType,
        hasValidUserGestureActivation: true,
        textDirectiveUserActivation: true
      };
      if (data.policyContainer) options.policyContainer = E10SUtils.deserializePolicyContainer(data.policyContainer);
      destination.loadURI(uri, options);
      const outcome = target ? "destination-requested" : "source-fallback-requested";
      record(outcome);
      return { ok: true, outcome };
    } catch (error) {
      record("navigation-error", error?.name || "Error");
      console.error("[Linked Tabs] Could not navigate", error);
      return { ok: false, outcome: "navigation-error" };
    }
  }
}
