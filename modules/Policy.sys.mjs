// Pure policy helpers, also exercised by the Node tests.
export const ROUTES_KEY = "zen-linked-tabs/v1/routes";
export const ACTOR_NAME = "ZenLinkedTabsV1";

export function eligibleLink({ trusted, prevented, button, modified, editable,
  download, target, href, documentURL }) {
  if (!trusted || prevented || button !== 0 || modified || editable || download) return false;
  if (target && !["_self", "_blank", "_top", "_parent"].includes(target.toLowerCase())) return false;
  try {
    const link = new URL(href);
    const page = new URL(documentURL);
    if (!["http:", "https:"].includes(link.protocol)) return false;
    // A fragment within the same document belongs in its original pane.
    if (link.href.includes("#")) {
      link.hash = "";
      page.hash = "";
      if (link.href === page.href) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function splitTabsFor(win, tab) {
  const group = tab?.group;
  if (group?.hasAttribute("split-view-group")) return Array.from(group.tabs);
  // Compatibility with Zen builds that predate split tab groups.
  const entry = win.gZenViewSplitter?._data?.find(view => view.tabs?.includes(tab));
  return entry ? Array.from(entry.tabs) : [];
}

export function usablePair(win, source, target) {
  const tabs = Array.from(win.gBrowser.tabs);
  if (!source || !target || source === target ||
      !tabs.includes(source) || !tabs.includes(target) ||
      source.closing || target.closing || !source.isConnected || !target.isConnected) return false;
  const split = splitTabsFor(win, source);
  if (split.length !== 2 || !split.includes(target)) return false;
  if ((source.getAttribute("usercontextid") || "0") !==
      (target.getAttribute("usercontextid") || "0")) return false;
  return source.linkedBrowser.browsingContext?.usePrivateBrowsing ===
    target.linkedBrowser.browsingContext?.usePrivateBrowsing;
}

export function pairIsVisible(win, pair) {
  if (!usablePair(win, pair.source, pair.target)) return false;
  const browsers = win.gZenViewSplitter?.splitViewBrowsers || [];
  return browsers.includes(pair.source.linkedBrowser) && browsers.includes(pair.target.linkedBrowser);
}
