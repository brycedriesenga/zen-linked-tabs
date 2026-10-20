import { splitTabsFor, pairIsVisible, usablePair } from "./Policy.sys.mjs";

function webURL(href) {
  try { return ["http:", "https:"].includes(new URL(href).protocol); }
  catch { return false; }
}

export function paneTitle(tab) {
  return (tab?.label || "the other pane").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
}

// Snapshot the real context-menu browser, not the selected tab (hovering or
// opening a menu in a split need not select that pane). No content DOM node is
// retained in chrome; the snapshot is revalidated against its WindowGlobal.
export function contextLink(controller, context) {
  const browser = context?.browser;
  if (!browser) return null;
  const source = controller.win.gBrowser.getTabForBrowser(browser);
  if (!source || !context.onLink || context.inFrame || context.onEditable ||
      context.linkDownload || !webURL(context.linkURL) || !webURL(context.contentData?.docLocation) ||
      !context.principal || !browser.browsingContext?.currentWindowGlobal) return null;
  if (context.frameBrowsingContext && context.frameBrowsingContext !== browser.browsingContext) return null;
  return {
    source, browser, manager: browser.browsingContext.currentWindowGlobal,
    href: context.linkURL,
    options: {
      triggeringPrincipal: context.principal,
      referrerInfo: context.contentData.linkReferrerInfo,
      policyContainer: context.policyContainer,
      triggeringRemoteType: context.remoteType,
      hasValidUserGestureActivation: true,
      textDirectiveUserActivation: true
    }
  };
}

export function contextIsCurrent(controller, link) {
  return !!link && !controller.destroyed && !link.source.closing && link.source.isConnected &&
    Array.from(controller.win.gBrowser.tabs).includes(link.source) &&
    link.source.linkedBrowser === link.browser &&
    link.browser.browsingContext.currentWindowGlobal === link.manager;
}

export function canOpenLinked(controller, link) {
  if (!contextIsCurrent(controller, link) || controller.routingError) return false;
  const split = splitTabsFor(controller.win, link.source);
  if (split.length === 2) return controller.canLink(link.source);
  // Zen duplicates pinned/essential tabs when creating a split. Avoid silently
  // changing which tab is the source; existing compatible pairs still work.
  return !split.length && !link.source.pinned && !link.source.hasAttribute("zen-essential") &&
    !link.source.hasAttribute("zen-live-folder-item-id") && !link.source.hidden &&
    typeof controller.win.gZenViewSplitter.splitTabs === "function";
}

export function focusPane(controller, tab) {
  if (!tab || controller.destroyed || tab.closing || !Array.from(controller.win.gBrowser.tabs).includes(tab)) return;
  try {
    controller.win.gBrowser.selectedTab = tab;
    tab.linkedBrowser.focus();
  } catch (error) { console.error("[Linked Tabs] Could not focus the pane", error); }
}

export function focusAfterNavigation(controller, browser, token, inSource = false) {
  const pair = controller.pairs.find(item => item.source.linkedBrowser === browser && item.token === token);
  if (!pair || !pairIsVisible(controller.win, pair)) return;
  // Never pull the user back from an unrelated tab while an IPC is in flight.
  if (![pair.source, pair.target].includes(controller.win.gBrowser.selectedTab)) return;
  focusPane(controller, !inSource && controller.settings.focusDestination ? pair.target : pair.source);
}

export function openLinked(controller, link) {
  if (!canOpenLinked(controller, link)) return false;
  Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(link.options.triggeringPrincipal, link.href);
  const { win } = controller;
  let target = splitTabsFor(win, link.source).find(tab => tab !== link.source);
  let created;
  try {
    if (!target) {
      created = target = win.gBrowser.addTab("about:blank", {
        triggeringPrincipal: link.options.triggeringPrincipal,
        userContextId: Number(link.source.getAttribute("usercontextid") || 0),
        inBackground: true, skipAnimation: true, skipRoute: true
      });
      win.gZenViewSplitter.splitTabs([link.source, target], undefined, 0);
    }
    if (controller.pairFor(link.source)?.source !== link.source && !controller.link(link.source)) {
      throw new Error("Could not establish a two-pane linked split");
    }
    target.linkedBrowser.loadURI(Services.io.newURI(link.href), link.options);
    controller.recordNavigation("destination-requested");
    focusPane(controller, controller.settings.focusDestination ? target : link.source);
    // Context-menu actions use the existing content actor only for the optional
    // last-link marker. Navigation already succeeded if the actor is unavailable.
    try {
      link.manager.getActor("ZenLinkedTabsV1").sendAsyncMessage("LinkedTabs:MarkContextLink", {
        href: link.href, token: controller.pairFor(link.source).token
      });
    } catch {}
    return true;
  } catch (error) {
    // Only remove a blank tab we created ourselves; never close an existing pane.
    if (created && !created.linkedBrowser.currentURI?.schemeIs("http") &&
        !created.linkedBrowser.currentURI?.schemeIs("https")) win.gBrowser.removeTab(created, { animate: false });
    throw error;
  }
}

export function openInSource(controller, link) {
  if (!contextIsCurrent(controller, link)) return false;
  const pair = controller.pairFor(link.source);
  if (!pair || pair.source !== link.source || !pairIsVisible(controller.win, pair)) return false;
  Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(link.options.triggeringPrincipal, link.href);
  link.browser.loadURI(Services.io.newURI(link.href), link.options);
  controller.recordNavigation("source-requested");
  focusPane(controller, link.source);
  return true;
}

export function canKeepPage(controller, tab) {
  const pair = controller.pairFor(tab);
  return !controller.destroyed && !!pair && pair.target === tab && usablePair(controller.win, pair.source, pair.target) &&
    webURL(tab.linkedBrowser.currentURI?.spec) && !!tab.linkedBrowser.contentPrincipal;
}

export function keepPage(controller, tab) {
  if (!canKeepPage(controller, tab)) return false;
  const browser = tab.linkedBrowser;
  Services.scriptSecurityManager.checkLoadURIStrWithPrincipal(browser.contentPrincipal, browser.currentURI.spec);
  // Open the current URL in a normal background tab, without adding it to the
  // split. This is a saved page, not a clone of forms, history, or scroll state.
  const saved = controller.win.gBrowser.addTab(browser.currentURI.spec, {
    triggeringPrincipal: browser.contentPrincipal,
    policyContainer: browser.policyContainer,
    userContextId: Number(tab.getAttribute("usercontextid") || 0),
    inBackground: true, skipAnimation: true, skipRoute: true,
    relatedToCurrent: false
  });
  if (!saved) throw new Error("Could not open a background tab");
  return true;
}
