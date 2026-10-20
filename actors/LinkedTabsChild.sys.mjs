import { BrowserUtils } from "resource://gre/modules/BrowserUtils.sys.mjs";
import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";
import { ROUTES_KEY, eligibleLink, sourceOverrideMatches } from "../modules/Policy.sys.mjs";
import { LinkMarker } from "../modules/Marker.sys.mjs";

export class ZenLinkedTabsV1Child extends JSWindowActorChild {
  route() {
    return Services.cpmm.sharedData.get(ROUTES_KEY)?.[this.browsingContext.top.id];
  }

  clearMarker() {
    if (!this.marker) return;
    this.marker.renderer.destroy();
    this.marker = null;
  }

  mark(node, token) {
    // Direct state messages also gate markers while sharedData propagation is
    // in flight, so a late acknowledgment cannot repaint an unlinked source.
    const route = this.markerState === undefined ? this.route() : this.markerState;
    if (!route?.markLastLink || route.token !== token || !node?.style ||
        this.contentWindow.document !== node.ownerDocument || !node.isConnected) return;
    this.clearMarker();
    this.marker = { node, token, renderer: new LinkMarker(node, route.marker) };
  }

  receiveMessage({ name, data }) {
    if (name === "LinkedTabs:State") {
      this.markerState = data;
      if (!data?.markLastLink || data.token !== this.marker?.token) this.clearMarker();
      else if (this.marker) this.marker.renderer.update(data.marker);
    } else if (name === "LinkedTabs:MarkContextLink") {
      const last = this.contextLink;
      if (last?.href === data.href && last.node.ownerDocument === this.contentWindow.document) {
        this.clickSequence = (this.clickSequence || 0) + 1;
        this.mark(last.node, data.token);
      }
    }
  }

  didDestroy() {
    this.disposed = true;
    this.clearMarker();
    this.contextLink = null;
  }

  handleEvent(event) {
    if (event.type === "pagehide") {
      this.clearMarker();
      this.contextLink = null;
      this.clickSequence = (this.clickSequence || 0) + 1;
      return;
    }
    if (event.type === "contextmenu") {
      const [href, node] = BrowserUtils.hrefAndLinkNodeForClickEvent(event);
      this.contextLink = event.isTrusted && node ? { href, node } : null;
      return;
    }
    const route = this.route();
    if (!route) { this.clearMarker(); return; }
    const inSource = sourceOverrideMatches(event, route.sourceModifiers);
    const [href, node] = BrowserUtils.hrefAndLinkNodeForClickEvent(event);
    if (!href || !node) return;
    const doc = node.ownerDocument;
    const target = node.getAttribute("target") || doc.querySelector("base[target]")?.getAttribute("target") || "";
    const clicked = event.composedTarget || event.target;
    if (!eligibleLink({
      trusted: event.isTrusted, prevented: event.defaultPrevented,
      button: event.button,
      modified: !inSource && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey),
      editable: clicked?.isContentEditable || doc.designMode === "on",
      download: node.hasAttribute("download"), target, href, documentURL: doc.URL
    })) return;

    try {
      Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(doc.nodePrincipal, href);
      const referrer = Cc["@mozilla.org/referrer-info;1"].createInstance(Ci.nsIReferrerInfo);
      referrer.initWithElement(node);
      const data = {
        href, token: route.token, mode: inSource ? "source" : "destination",
        referrerInfo: E10SUtils.serializeReferrerInfo(referrer),
        policyContainer: doc.policyContainer ? E10SUtils.serializePolicyContainer(doc.policyContainer) : null
      };
      // Acknowledge delivery: one-way IPC could consume a link even if the parent
      // failed to load, returned early, or threw during navigation.
      const sequence = this.clickSequence = (this.clickSequence || 0) + 1;
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
        else if (!this.disposed && sequence === this.clickSequence && result.outcome === "destination-requested") {
          try { this.mark(node, route.token); }
          catch (error) { console.error("[Linked Tabs] Could not mark the last link", error); }
        }
      }, fallback);
    } catch (error) {
      console.error("[Linked Tabs] Link was left to the page", error);
    }
  }
}
