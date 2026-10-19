import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";

export class ZenLinkedTabsV1Parent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name !== "LinkedTabs:Open") return;
    const context = this.browsingContext;
    // Never let a delayed click navigate a replacement document or another tab.
    if (context !== context.top || context.currentWindowGlobal !== this.manager) return;
    const browser = context.top.embedderElement;
    const win = browser?.ownerGlobal;
    if (!browser || !win?.gBrowser || win.closed) return;
    const data = message.data;
    if (!data || typeof data.href !== "string" || typeof data.token !== "string") return;
    const principal = this.manager.documentPrincipal;
    try {
      const uri = Services.io.newURI(data.href);
      if (!uri.schemeIs("http") && !uri.schemeIs("https")) return;
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
    } catch (error) {
      console.error("[Linked Tabs] Could not navigate", error);
    }
  }
}
