// Linked Tabs — Sine browser-window entry point.
(() => {
  const BASE = "chrome://sine/content/zen-linked-tabs/";
  let disposed = false;
  let controller;
  let startupTimer;
  let attempts = 0;
  window.ZenLinkedTabsStatus = { version: "0.2.0", phase: "waiting-for-browser" };
  const dispose = () => {
    disposed = true;
    window.clearTimeout(startupTimer);
    window.removeEventListener("load", start);
    controller?.destroy();
    window.removeEventListener("unload", dispose);
    window.ZenLinkedTabsStatus = { version: "0.2.0", phase: "disabled" };
  };
  window.addEventListener("unload", dispose, { once: true });
  window.addUnloadListener?.(dispose);
  const start = async () => {
    try {
      if (disposed) return;
      // Sine can inject before Zen's APIs exist, or into an already open window.
      // Retry the actual prerequisites instead of silently exiting or waiting for
      // a startup event that may already have fired.
      if (!window.gBrowser?.tabContainer || !window.gBrowser?.tabpanels || !window.gZenViewSplitter) {
        if (++attempts < 200) {
          startupTimer = window.setTimeout(start, 100);
          return;
        }
        throw new Error("Zen's tab/split APIs did not become available within 20 seconds");
      }
      window.ZenLinkedTabs?.destroy();
      const { LinkedTabsController } = ChromeUtils.importESModule(
        BASE + "modules/Controller.sys.mjs"
      );
      controller = new LinkedTabsController(window);
      window.ZenLinkedTabs = controller;
      controller.init();
      console.info("[Linked Tabs] v0.2.0", window.ZenLinkedTabsStatus);
    } catch (error) {
      controller?.destroy();
      window.ZenLinkedTabsStatus = { version: "0.2.0", phase: "error", error: String(error) };
      console.error("[Linked Tabs] Could not initialize", error);
    }
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
