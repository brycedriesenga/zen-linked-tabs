import { ACTOR_NAME, ROUTES_KEY } from "./Policy.sys.mjs";

const controllers = new Set();
let registered = false;

export function publish() {
  const routes = {};
  for (const controller of controllers) Object.assign(routes, controller.routes());
  Services.ppmm.sharedData.set(ROUTES_KEY, routes);
  // Make the new state available promptly in existing content processes.
  Services.ppmm.sharedData.flush();
}

export function attach(controller) {
  if (!registered) {
    const base = new URL("../actors/", import.meta.url).href;
    ChromeUtils.registerWindowActor(ACTOR_NAME, {
      parent: { esModuleURI: base + "LinkedTabsParent.sys.mjs" },
      child: {
        esModuleURI: base + "LinkedTabsChild.sys.mjs",
        events: {
          click: { capture: true, wantUntrusted: false },
          contextmenu: { capture: true, wantUntrusted: false },
          pagehide: { capture: true, wantUntrusted: false }
        }
      },
      matches: ["http://*/*", "https://*/*"],
      allFrames: false,
      includeChrome: false,
      remoteTypes: ["web"],
      messageManagerGroups: ["browsers"],
      safeForUntrustedWebProcess: true
    });
    registered = true;
  }
  controllers.add(controller);
  publish();
}

export function detach(controller) {
  controllers.delete(controller);
  publish();
  if (!controllers.size && registered) {
    ChromeUtils.unregisterWindowActor(ACTOR_NAME);
    registered = false;
  }
}
