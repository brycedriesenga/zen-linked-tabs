# Linked Tabs for Zen — v0.5.0 prototype

Keep a list, search result, or overview open in one split pane. Click its links to load them in the other pane, using Zen’s existing split tabs.

**Status:** 31 passing automated tests against mocked browser APIs. The split integration was checked against Zen **1.23.3b** source and Sine **2.3.3** source. The user confirmed core routing works in v0.3. v0.5 removes the address-bar widget, replaces the sidebar divider with a link-direction arrow, and limits hover controls to two-pane splits. These latest UI changes have **not been verified in a live Zen session** yet.

## Update an existing Sine installation

1. Open Zen Settings → Sine Mods (`about:preferences#sineMods`).
2. Check for mod updates and update **Linked Tabs** to **0.5.0**. If your Sine version does not fetch it, uninstall just Linked Tabs and install `brycedriesenga/zen-linked-tabs` again.
3. Confirm Sine’s **Enable installing JS from unofficial sources** setting is on and the individual Linked Tabs toggle is enabled.
4. Fully quit and reopen Zen. If the version still appears stale, use `about:support` → **Clear startup cache…**.
5. In an existing two-tab split, hover at the top center of either pane. Look for the **Linked Tabs** icon **between the drag handle and unsplit button**.

## Install through Sine

1. If needed, install [Sine using its official guide](https://github.com/sineorg/docs/blob/main/src/installation.md) and restart Zen.
2. Create a **public GitHub repository**, for example `zen-linked-tabs`. Upload the **contents of this folder** to the repository root. `theme.json`, `linked-tabs.uc.js`, `modules/`, and `actors/` must be at the root; do not upload only the ZIP. Keep the `id` in `theme.json` as `zen-linked-tabs` because the entry point uses Sine’s corresponding chrome URL.
3. Open Zen Settings → Sine Mods (`about:preferences#sineMods`). In Sine’s settings, enable **Enable installing JS from unofficial sources**. This is Sine’s global setting for custom JavaScript mods; these run with browser privileges.
4. In Sine’s custom-repository input, enter `YOUR-USERNAME/zen-linked-tabs`, then install the mod and leave it enabled.
5. Fully quit and reopen Zen. In a two-pane split view, a **Linked Tabs** icon appears in each pane’s top-center hover strip, beside Zen’s native controls. There is no address-bar/navigation-toolbar button. If necessary, use `about:support` → **Clear startup cache…** once.

This repository is a Sine JavaScript mod, not an XPI. Source ZIPs cannot be installed by dragging them into Zen.

## Use

1. Open two ordinary tabs and put them into a split view using Zen’s native split-tab controls.
2. Hover at the **top center** of the pane you want to keep in place. This is your **source**. Zen’s small strip with its drag and unsplit buttons appears.
3. **Left-click the Linked Tabs icon** between those buttons to link from that pane. Click it again to unlink. The action belongs to that pane, even if a different pane was selected.
4. Click a regular link in the source. Its URL loads in the existing **destination** tab, while the source stays put. Links with `target="_blank"` also reuse the destination.
5. **Right-click the icon** for the options menu: **Reverse link direction**, **Use this pane as the source** when appropriate, and **Unlink tabs**. For keyboard menu access, focus the button and press Down Arrow, Shift+F10, or the Context Menu key. The source-tab context menu and toggle shortcut remain available as alternatives.

While linked, the thin divider **between the two tabs in Zen’s sidebar** becomes one arrow pointing from source to destination. It reads `→` or `←` in the expanded sidebar, and `↓` or `↑` when Zen stacks the tabs in a collapsed sidebar. The arrow follows the tabs’ sidebar order, stays visible for active splits, and uses inherited text color. Reversing the link reverses the arrow. Unlinking restores Zen’s native divider behavior. No extra markers are inserted beside favicons or audio controls.

The hover-panel icon is 12 px and changes from a **broken chain** when unlinked to a **connected chain** when paired, with no persistent outline or shaded background. Its tooltip explains left-click and right-click actions. The link buttons are **not shown for splits with more than two panes**. Adding a third pane clears any existing pair; returning to two panes restores the buttons so you can link again.

**Toggle shortcut:** Ctrl+Alt+Shift+L on Windows/Linux; Command+Option+Shift+L on macOS. It links the selected pane if unlinked, or unlinks that pair. You can change or remove the `keyset` section in `modules/Controller.sys.mjs` if it conflicts with another shortcut.

Pairs are directional: destination links continue to behave normally. Independent two-tab splits can have independent pairs. Clicking either pane does not reverse the pair automatically. Following a link does not deliberately change the selected tab; Zen’s own focus behavior still applies.

## Behavior and limits

- Works with ordinary HTTP/HTTPS links in the **top-level document**. Capturing the click before page handlers is intended to cover normal anchor links in apps such as GitHub, even when the app uses client-side navigation. That behavior still needs live testing.
- Leaves Ctrl/Command/Shift/Alt-click, middle-click, right-click, download attributes, named-frame targets, editable content, same-document fragment links, and non-web schemes alone.
- Does not redirect form submissions, browser address-bar entries, buttons that navigate entirely through JavaScript, `window.open()`, scripted redirects, or links inside iframes.
- A regular link to the same URL without a fragment still redirects; JavaScript-only toggles should use buttons. Unlink temporarily if a site uses such links as UI controls.
- Only pairs splits containing **exactly two tabs**. Create and resize the split with Zen itself. Essential/pinned-tab peculiarities, old Zen versions, and other mods are unverified.
- Pairs must use the **same Firefox container and private-browsing state**. A pair within one private window is allowed; no pairing state is written to disk.
- Temporarily leaving a split pauses routing. Closing a tab, unsplitting, or adding a third pane clears an invalid pair. Browser restarts reset all pairs.
- A click already sent across processes when a pair is unlinked or closed continues in the source if that source document is still current. A click from a replaced document is discarded. A source pane should therefore be a page you are comfortable navigating if a pair disappears at that exact moment.
- If the parent actor cannot handle an intercepted click, it reports failure to the child, which attempts the original HTTP/HTTPS link in the still-current source document. This keeps an IPC or navigation error from silently swallowing the link. The fallback deliberately navigates the source, even for links that originally had `target="_blank"`.
- Destination navigation uses the source document’s principal, referrer information, and policy container. It does not use a system principal for web navigation.
- No dependencies, telemetry, analytics, server, or external code downloads. The mod itself makes no network requests; followed links navigate normally.

## Browser smoke test

After installing, open a terminal in this project folder and run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tests/fixture
```

Open `http://127.0.0.1:8765/source.html` and `http://127.0.0.1:8765/destination.html` in Zen, split them, and link the source.

Check these before relying on the mod:

- **Normal link** and **new-tab link** update the destination; source URL and position remain unchanged.
- **SPA-style link** loads the destination and its source handler does not run.
- **Jump to section** scrolls the source; modifier-click and middle-click retain normal browser behavior.
- Links clicked in the destination behave normally.
- Reverse, unlink, source reload, destination reload, Back/Forward in each pane, switching splits/workspaces, and closing a pane work as expected.
- A link inside the sample iframe remains native.
- Test an actual GitHub repository, a search-results page, and a second browser window.
- Disable the mod in Sine and confirm the hover controls, divider arrow, and menu items disappear and links behave normally. Restart after updating the mod’s code.

Stop the test server with Ctrl+C.

## Automated tests

Requires Node 20 or later. No `npm install` is needed.

```sh
npm test
```

Tests execute the actual entry point, policy, controller, runtime, and actor modules with mocked Gecko services and DOM. They cover routing, source-principal propagation, ignored clicks, direction reversal, stale-document handling, unlink races, container/private-state boundaries, invalid splits, multiple windows, unload, and Sine entry points. UI regressions cover per-pane actions when another pane is selected, late/recreated headers, no global toolbar, startup retries, unload cancellation, and visible actor-failure diagnostics. v0.3 tests cover current Gecko window properties without `ownerGlobal`, native-window fallback, asynchronous IPC errors, navigation exceptions, stale-document fallback suppression, and both SVG states. Later UI tests cover primary-button toggling, context and keyboard menu access, nested command handling, divider direction and sidebar reordering, no address-bar widget, and hiding/restoring controls when split size changes. These tests do not establish that Gecko loads the actors or renders native menus correctly.

## Troubleshooting / remove

- **No hover-panel button:** make sure the split has exactly two panes, check custom JavaScript is enabled in Sine, confirm the installed mod is version 0.5.0, and fully restart Zen. Open the Browser Console and look for `[Linked Tabs]` messages. Use **Browser Console**, not the website’s developer console. No address-bar button is expected in this version.
- **Button appears but Link is disabled:** create an active split of exactly two tabs in the same container.
- **Button appears but links do nothing:** test the fixture’s normal link first, then check the Browser Console. A JS-only navigation button or iframe link is intentionally outside this version’s scope.
- **After updating:** fully quit and reopen Zen; imported privileged modules can remain cached until restart.
- To remove, disable/uninstall **Linked Tabs** in Sine. The mod registers Sine’s unload callback to remove its UI, event listeners, routes, and actors when the last loaded window is detached. Restart if any state remains.

For a useful bug report, include Zen version, Sine version, OS, site URL, steps, whether the fixture works, and the `[Linked Tabs]` console error.

In the Browser Console, this read-only expression shows the current browser window’s diagnostic status:

```js
Services.wm.getMostRecentWindow("navigator:browser").ZenLinkedTabsStatus
```

- `undefined`: the entry script has not run in that window. Check Sine’s JS permission and the mod toggle.
- `phase: "waiting-for-browser"`: the script loaded and is waiting for Zen’s APIs.
- `phase: "ready", paneControls: 2`: controls have been attached to two native split headers.
- `phase: "ready", paneControls: 0`: the controller loaded, but no native split headers were found yet.
- `directionDividers: 1`: one linked pair has its sidebar divider marked for a direction arrow.
- `phase: "error"`: include the returned `error` string in your bug report.

If links still fail after updating, keep a normal two-tab split linked, open **Browser Console**, filter for `Linked Tabs`, then click one ordinary link in the source. Copy the resulting errors and the status expression above. If the console input is unavailable, the logged errors alone are still useful.

The `navigation` object reports how far routing got. `destinationRequests` counts accepted calls to the destination browser’s `loadURI` method; it does not guarantee the site finished loading. `sourceFallbackRequests` counts parent-requested source navigations. `lastOutcome` and `failures` identify a parent navigation error. A zero `received` count after a click points to the child/parent actor path. These diagnostics do not retain link URLs or page titles; navigation `lastError` stores only an exception name.

The original v0.2 test browser mock exposed the obsolete `ownerGlobal` property, which hid the real-browser compatibility failure. The mock now exposes `documentGlobal` and `ownerDocument.defaultView` instead.

## Architecture / references

- `linked-tabs.uc.js`: Sine startup and teardown.
- `modules/Controller.sys.mjs`: pane controls, divider state, context menu, shortcut and pairing.
- `modules/Runtime.sys.mjs`: process-wide actor registration and active source routes.
- `actors/LinkedTabsChild.sys.mjs`: privileged capture of eligible source link clicks.
- `actors/LinkedTabsParent.sys.mjs`: principal-checked navigation into the paired browser.
- `modules/Policy.sys.mjs`: shared eligibility and split validation.

Source references reviewed on October 19, 2026:

- [Original Zen feature discussion](https://github.com/zen-browser/desktop/discussions/813#discussion-7096243).
- [Zen 1.23.3b split manager](https://github.com/zen-browser/desktop/blob/1.23.3b/src/zen/split-view/ZenViewSplitter.mjs): `split-view-group`, `splitViewBrowsers`, and split activation/removal events.
- [Zen actor registration](https://github.com/zen-browser/desktop/blob/1.23.3b/src/zen/common/sys/ZenActorsManager.sys.mjs).
- [Sine script discovery](https://github.com/CosmoCreeper/Sine/blob/v2.3.3/src/core/utils.sys.mjs) and [manager](https://github.com/CosmoCreeper/Sine/blob/v2.3.3/src/core/manager.sys.mjs).
- [Firefox click actor implementation](https://github.com/mozilla-firefox/firefox/blob/main/browser/actors/ClickHandlerChild.sys.mjs) and [parent](https://github.com/mozilla-firefox/firefox/blob/main/browser/actors/ClickHandlerParent.sys.mjs) informed the handling of principals and referrer information. These are internal APIs and may change.

License: MIT. This is an independent mod, not affiliated with Zen, Sine, or Microsoft.
