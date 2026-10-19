import { BrowserUtils } from "resource://gre/modules/BrowserUtils.sys.mjs";
import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";
import { ROUTES_KEY, eligibleLink } from "../modules/Policy.sys.mjs";

export class ZenLinkedTabsV1Child extends JSWindowActorChild {
  handleEvent(event) {
    const route = Services.cpmm.sharedData.get(ROUTES_KEY)?.[this.browsingContext.top.id];
    if (!route) return;
    const [href, node] = BrowserUtils.hrefAndLinkNodeForClickEvent(event);
    if (!href || !node) return;
    const doc = node.ownerDocument;
    const target = node.getAttribute("target") || doc.querySelector("base[target]")?.getAttribute("target") || "";
    const clicked = event.composedTarget || event.target;
    if (!eligibleLink({
      trusted: event.isTrusted, prevented: event.defaultPrevented,
      button: event.button,
      modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
      editable: clicked?.isContentEditable || doc.designMode === "on",
      download: node.hasAttribute("download"), target, href, documentURL: doc.URL
    })) return;

    try {
      Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(doc.nodePrincipal, href);
      const referrer = Cc["@mozilla.org/referrer-info;1"].createInstance(Ci.nsIReferrerInfo);
      referrer.initWithElement(node);
      const data = {
        href, token: route.token,
        referrerInfo: E10SUtils.serializeReferrerInfo(referrer),
        policyContainer: doc.policyContainer ? E10SUtils.serializePolicyContainer(doc.policyContainer) : null
      };
      // Acknowledge delivery: one-way IPC could consume a link even if the parent
      // failed to load, returned early, or threw during navigation.
      const pending = this.sendQuery("LinkedTabs:Open", data);
      event.preventDefault();
      event.stopImmediatePropagation();
      const fallback = reason => {
        console.error("[Linked Tabs] Routing failed; trying the source pane", reason);
        try {
          if (this.contentWindow.document === doc) this.contentWindow.location.assign(href);
        } catch (error) {
          console.error("[Linked Tabs] Source fallback was unavailable", error);
        }
      };
      pending.then(result => {
        if (!result?.ok) fallback(result?.outcome || "parent did not acknowledge navigation");
      }, fallback);
    } catch (error) {
      console.error("[Linked Tabs] Link was left to the page", error);
    }
  }
}
