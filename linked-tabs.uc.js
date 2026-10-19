// Linked Tabs — Sine browser-window entry point.
(() => {
  const BASE = "chrome://sine/content/zen-linked-tabs/";
  let disposed = false;
  let controller;
  let startupObserver;
  const dispose = () => {
    disposed = true;
    if (startupObserver) {
      Services.obs.removeObserver(startupObserver, "browser-delayed-startup-finished");
      startupObserver = null;
    }
    controller?.destroy();
    window.removeEventListener("unload", dispose);
  };
  window.addEventListener("unload", dispose, { once: true });
  window.addUnloadListener?.(dispose);
  const start = async () => {
    try {
      if (!window.gBrowserInit?.delayedStartupFinished) {
        await new Promise(resolve => {
          startupObserver = subject => {
            if (subject !== window) return;
            Services.obs.removeObserver(startupObserver, "browser-delayed-startup-finished");
            startupObserver = null;
            resolve();
          };
          Services.obs.addObserver(startupObserver, "browser-delayed-startup-finished");
        });
      }
      if (disposed || !window.gBrowser || !window.gZenViewSplitter) return;
      window.ZenLinkedTabs?.destroy();
      const { LinkedTabsController } = ChromeUtils.importESModule(
        BASE + "modules/Controller.sys.mjs"
      );
      controller = new LinkedTabsController(window);
      window.ZenLinkedTabs = controller;
      controller.init();
    } catch (error) {
      controller?.destroy();
      console.error("[Linked Tabs] Could not initialize", error);
    }
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
