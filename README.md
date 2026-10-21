# Linked Tabs for Zen — v0.7.1 prototype

Keep a list, search result, or overview open in one split pane. Click its links to load them in the other pane, using Zen’s existing split tabs.

**Status:** 78 passing automated tests against mocked browser APIs. Split integration was checked against Zen **1.23.3b** source and Sine **2.3.3** source. The user confirmed core routing works in v0.3. v0.7 adds a default arrow badge, four alternative marker styles, title targeting, wrapped-line geometry, live appearance settings, and an interactive preview. Marker geometry and generated SVG are tested with explicit DOM/layout fixtures; the tests are **not native-browser visual verification**. Live preview validation was blocked by browser access and URL restrictions in the development environment. v0.7.1 fixes zero-width clipping on inline post-title links and allows badges to use a semantic post’s free gutter, while preserving scrolling and outer post clips. The classic Reddit CSS conditions are reproduced in tests; the updated visuals still need checking in Zen.

## Update an existing Sine installation

1. Open Zen Settings → Sine Mods (`about:preferences#sineMods`).
2. Check for mod updates and update **Linked Tabs** to **0.7.1**. If your Sine version does not fetch it, uninstall just Linked Tabs and install `brycedriesenga/zen-linked-tabs` again.
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

## New workflows and settings

- **Create a linked split:** right-click a normal HTTP/HTTPS link and choose **Open in linked split**. The current page stays as the source; a new destination opens beside it. In an existing two-pane split, the action uses the other pane. If this page is already the source, the menu reads **Open in linked pane** and reuses the destination. Invoking the action from the destination explicitly makes that pane the new source.
- **Know the direction:** hover the chain button to see the other page's title. The source tooltip says where its links open; the destination tooltip says which page sends its links. The button exposes its linked/expanded state to assistive technology and has a 24px minimum hit area with a 12px icon and keyboard focus ring.
- **Choose focus:** by default, opening a source link explicitly keeps focus in the source. Enable **Focus the destination after opening links** to move focus to the result instead. A delayed navigation does not pull focus from an unrelated tab.
- **Keep a result:** right-click the destination's chain button (or its sidebar tab), then choose **Keep this page as a separate tab**. A normal background tab opens the current URL in the same container and private window. The destination remains linked for the next result. This saves the URL, not form state, page history, or scroll position.
- **Open a link in the source once:** hold **Option+Shift on macOS / Alt+Shift on Windows and Linux** while left-clicking an eligible source link. This also overrides `target="_blank"`, opening it in this same source pane. The pair stays linked. Alternatively, right-click the link and choose **Open link in this pane**.
- **Mark the last opened link:** enable the optional marker to show an arrow badge beside the last source link whose destination navigation was accepted. Choose badge, underline, soft highlight, underline + highlight, or outline. Markers target visible titles and follow wrapped text without editing the page’s link styles or layout. The marker moves to the next successfully routed link and clears on unlink, direction changes, leaving the split, page navigation, disabling the setting, or mod unload. It marks the last link opened; it does not track later destination navigation or guarantee the result finished loading.

Open **Zen Settings → Sine Mods → Linked Tabs → Settings** (the mod's configure button) to change these options. They apply to existing pairs without restarting Zen. Restart is still necessary after updating the mod's code.

The source-click modifier is configured using four independent checkboxes: **Alt / Option**, **Shift**, **Control**, and **Command / Windows / Meta**. Hold exactly the checked keys; extra modifiers keep their native behavior. Uncheck all four to disable the override. AltGr is left native. The default uses two modifiers to avoid ordinary new-tab/new-window clicks and Zen's single-modifier Glance activation. Custom combinations can overlap browser, website, desktop, input-language, or accessibility shortcuts; those may intercept a click before the mod sees it. No combination is guaranteed free across every OS configuration. The context-menu exception remains available when a desktop shortcut interferes.

Both focus-destination and last-link-marker settings default to **off**. The source-click default is **Alt/Option + Shift** even before opening Sine's settings dialog. Preferences are stored under `zen-linked-tabs.*`; pairing state and page titles/URLs are not saved by the mod.

One-action split creation is disabled for larger splits, incompatible containers, or a pinned/essential/live-folder source that Zen would clone. Existing compatible two-pane pairs retain their normal controls. It leaves Zen's native split-link action available.

## Marker appearance (v0.7)

The marker toggle remains **off by default**. Existing users who enabled it get the new **badge** style after updating. Appearance controls live in **Sine Mods → Linked Tabs → Settings** and update the current marker immediately.

| Setting | Options / behavior |
| --- | --- |
| Style | Badge (default), Underline, Soft highlight, Underline + highlight, Outline |
| Color | Browser accent (default), link text color, or custom `#RGB` / `#RRGGBB` |
| Emphasis | Subtle, Normal, Strong; presets control line thickness and highlight opacity |
| Badge icon | Arrow (default), Dot, Split panes |
| Badge size | 12, 14 (default), 16, 18 CSS pixels |
| Badge placement | Automatic (default), Before first line, After first line, Above leading corner |
| Advanced: thickness | Automatic from emphasis, or 1–5px |
| Advanced: underline offset | 0–8px; increases the distance below the text baseline approximation |
| Advanced: highlight opacity | Automatic from emphasis, or 10–60% |
| Advanced: outline line | Solid (default), dotted, dashed |

Normal emphasis uses a 2px stroke and 17% tint; subtle uses 1px / 10%, strong uses 3px / 26%. Badge backgrounds remain opaque, with automatic light/dark icon contrast. Invalid custom colors fall back to `#6366f1`.

**Preview:** right-click a pane's chain button → **Preview marker appearance…**. This opens an internal preview tab with the current appearance choices and several clickable examples: a search-result heading with metadata, a community-post card, a classic community-feed title and comments link, a wrapped inline link, and a scroll container. Choose a style or click another sample to move the marker. Preview controls do not change saved preferences; apply the choices you like in Sine's settings. No web service or network request is required for the preview.

The preview can also be served locally for development: run `python3 -m http.server 8765 --bind 127.0.0.1` in the repository and open `http://127.0.0.1:8765/marker-preview.html`.

**Placement:** the renderer prefers a visible heading within the clicked link. For empty full-card links, it looks for a title in the enclosing semantic post card and rejects headings belonging to a different URL. Text styles paint each visible line independently. A badge is placed against the **first line**, not the center of the entire link/card. Before/after follow text direction, including RTL. Automatic placement tries before, after, then above the leading corner, avoiding text, nearby controls, the viewport edge, and scroll-container clips. If no candidate fits, it hides the badge instead of covering text; an explicit placement does not silently switch positions.

Inline text is measured using text ranges; an inline link’s zero client dimensions do not create a clipping boundary. Badges may sit in the free gutter of a semantic post card beyond hidden-overflow title/entry wrappers. Scroll containers and outer post clips still apply, and a title hidden by its own layout clip is not marked. Text styles keep the title’s layout clipping.

Soft highlights use the browser’s text-highlight API to paint behind glyphs when available, with a translucent per-line SVG fallback. Native highlights add one named range and one removable stylesheet, preserving existing stylesheets and highlights. The badge, underline, and outline overlay is isolated in a closed shadow tree, is non-interactive and hidden from assistive technology, and does not change fonts, text color, page spacing, inline styles, or keyboard focus. Scrolling, resizing, content changes, and font loading refresh its position. Removing the source link removes its overlay and listeners. CSS animations, transformed root elements, unusual shadow-DOM links, vertical writing, and arbitrary site-specific card layouts still need real-site verification; title detection is a bounded heuristic, not a site integration guarantee.

## Use

1. Open two ordinary tabs and put them into a split view using Zen’s native split-tab controls.
2. Hover at the **top center** of the pane you want to keep in place. This is your **source**. Zen’s small strip with its drag and unsplit buttons appears.
3. **Left-click the Linked Tabs icon** between those buttons to link from that pane. Click it again to unlink. The action belongs to that pane, even if a different pane was selected.
4. Click a regular link in the source. Its URL loads in the existing **destination** tab, while the source stays put. Links with `target="_blank"` also reuse the destination.
5. **Right-click the icon** for the options menu: **Reverse link direction**, **Use this pane as the source** when appropriate, **Unlink tabs**, and **Keep this page as a separate tab** in the destination. For keyboard menu access, focus the button and press Down Arrow, Shift+F10, or the Context Menu key. The source-tab context menu and toggle shortcut remain available as alternatives.

While linked, a direction indicator is centered **between the two tabs in Zen’s sidebar**, pointing from source to destination. Inactive splits replace the thin divider with a narrow `〈` or `〉` shaped chevron, using the original divider’s light/dark color and 1px stroke. Active splits retain their native tab highlights and show a small `→` or `←` arrow alone at the same position, using inherited text color. In a collapsed sidebar, the indicator points down or up between the stacked tabs. Reversing the link reverses the indicator. Unlinking restores Zen’s native divider. No extra markers are inserted beside favicons or audio controls.

The hover-panel icon is 12 px and changes from a **broken chain** when unlinked to a **connected chain** when paired, with no persistent outline or shaded background. Its tooltip explains left-click and right-click actions. The link buttons are **not shown for splits with more than two panes**. Adding a third pane clears any existing pair; returning to two panes restores the buttons so you can link again.

**Toggle shortcut:** Ctrl+Alt+Shift+L on Windows/Linux; Command+Option+Shift+L on macOS. It links the selected pane if unlinked, or unlinks that pair. You can change or remove the `keyset` section in `modules/Controller.sys.mjs` if it conflicts with another shortcut.

Pairs are directional: destination links continue to behave normally. Independent two-tab splits can have independent pairs. Clicking either pane does not reverse the pair automatically. Following a source link explicitly focuses the source by default, or the destination when the corresponding setting is enabled.

## Behavior and limits

- Works with ordinary HTTP/HTTPS links in the **top-level document**. Capturing the click before page handlers is intended to cover normal anchor links in apps such as GitHub, even when the app uses client-side navigation. That behavior still needs live testing.
- Leaves other modifier combinations, middle-click, right-click, download attributes, named-frame targets, editable content, same-document fragment links, and non-web schemes alone. Only the exact configured modifier combination overrides an eligible source click.
- Does not redirect form submissions, browser address-bar entries, buttons that navigate entirely through JavaScript, `window.open()`, scripted redirects, or links inside iframes.
- A regular link to the same URL without a fragment still redirects; JavaScript-only toggles should use buttons. Unlink temporarily if a site uses such links as UI controls.
- Only pairs splits containing **exactly two tabs**. Use the one-action link context menu or create the split with Zen itself; resize it using Zen. Essential/pinned-tab peculiarities, old Zen versions, and other mods are unverified.
- Pairs must use the **same Firefox container and private-browsing state**. A pair within one private window is allowed; no pairing state is written to disk.
- Temporarily leaving a split pauses routing. Closing a tab, unsplitting, or adding a third pane clears an invalid pair. Browser restarts reset all pairs.
- A click already sent across processes when a pair is unlinked or closed continues in the source if that source document is still current. A click from a replaced document is discarded. A source pane should therefore be a page you are comfortable navigating if a pair disappears at that exact moment.
- If the parent actor cannot handle an intercepted click, it reports failure to the child, which attempts the original HTTP/HTTPS link in the still-current source document. This keeps an IPC or navigation error from silently swallowing the link. The fallback deliberately navigates the source, even for links that originally had `target="_blank"`.
- Destination navigation uses the source document’s principal, referrer information, and policy container. It does not use a system principal for web navigation.
- No dependencies, telemetry, analytics, server, or external code downloads. Network requests come from normal page navigation, including explicitly opening a result or keeping it in a new tab.

## Browser smoke test

Test the v0.6 workflows in a normal two-pane split first:

- From an unsplit page, right-click a regular link → **Open in linked split**. Repeat with another link and confirm the destination is reused.
- Repeat from an unselected pane in an existing split; check source/destination tooltip titles, reverse direction, and unlink.
- With focus-destination off, open a link then use Page Down or an arrow key to confirm the source has keyboard focus. Turn the setting on and confirm the result receives focus.
- Use the destination's **Keep this page as a separate tab** action; confirm a background tab opens outside the split and another source click still reuses the original destination.
- Try Option+Shift/Alt+Shift-click on normal and `_blank` source links. Confirm both open in the source once without unlinking. Change the modifier checkboxes, check exact matching, then uncheck all to disable.
- Try **Open link in this pane** from the source link context menu while the other pane is selected.
- Turn the marker on, open two source links, and check that only the latest is marked. Try all five styles, RTL text, light/dark pages, a wrapped title, and a scroll container. Change color, size, position, and emphasis while the marker is visible; it should update immediately. Turn it off, unlink, change direction, and navigate away/back to check cleanup. Existing page styles should remain unchanged.
- On classic Reddit, try both a main post title and its comments link with each marker style. Include a wrapped title, nearby flair/thumbnail, and a scrolled-out post; check that badges avoid neighboring text and controls.
- Open **Preview marker appearance…** and try its controls, all sample links, and its scrolling panel. Confirm preview changes do not modify Sine preferences.
- Check native modifier/Glance behavior outside linked source panes, keyboard menu access and focus ring, normal/private windows, and container identity.

For the deterministic routing fixture, open a terminal in this project folder and run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tests/fixture
```

Open `http://127.0.0.1:8765/source.html` and `http://127.0.0.1:8765/destination.html` in Zen, split them, and link the source.

Check these before relying on the mod:

- **Normal link** and **new-tab link** update the destination; source URL and position remain unchanged.
- **SPA-style link** loads the destination and its source handler does not run.
- **Jump to section** scrolls the source; non-override modifier clicks and middle-click retain normal browser behavior.
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

Tests execute the actual entry point, policy, controller, runtime, and actor modules with mocked Gecko services and DOM. They cover routing, source-principal propagation, ignored clicks, direction reversal, stale-document handling, unlink races, container/private-state boundaries, invalid splits, multiple windows, unload, and Sine entry points. UI regressions cover per-pane actions when another pane is selected, late/recreated headers, no global toolbar, startup retries, unload cancellation, and visible actor-failure diagnostics. v0.3 tests cover current Gecko window properties without `ownerGlobal`, native-window fallback, asynchronous IPC errors, navigation exceptions, stale-document fallback suppression, and both SVG states. Later UI tests cover primary-button toggling, context and keyboard menu access, nested command handling, divider direction and sidebar reordering, no address-bar widget, and hiding/restoring controls when split size changes. v0.6 tests cover new/reused splits, captured context browsers, stale menu rejection, popup-hidden-before-command timing, container/private boundaries, focus choices, background keep-page behavior, modifier customization and disabling, source exceptions, marker acknowledgment order and cleanup, and Sine preference defaults. v0.7 adds option validation, line-fragment merging, first-line/RTL placement, crowded and clipped badge handling, semantic title selection, generated SVG for all styles/icons, live restyling, and overlay/observer cleanup. v0.7.1 adds classic Reddit inline-title regressions for all five styles and native highlights, post-gutter placement, scroll and post clip boundaries, hidden titles, and inline-block versus inline/boxless wrappers. These tests use explicit fixture rectangles, not a browser layout engine, and do not establish native marker appearance or that Gecko loads actors and renders menus correctly.

## Troubleshooting / remove

- **No hover-panel button:** make sure the split has exactly two panes, check custom JavaScript is enabled in Sine, confirm the installed mod is version 0.7.1, and fully restart Zen. Open the Browser Console and look for `[Linked Tabs]` messages. Use **Browser Console**, not the website’s developer console. No address-bar button is expected in this version.
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

The `navigation` object reports how far routing got. `destinationRequests` counts accepted calls to the destination browser’s `loadURI` method; it does not guarantee the site finished loading. `sourceFallbackRequests` counts parent-requested source navigations. `lastOutcome` and `failures` identify a parent navigation error. `sourceRequests` counts explicit source-pane exceptions. A zero `received` count after a click points to the child/parent actor path. These diagnostics do not retain link URLs or page titles; navigation `lastError` stores only an exception name.

The original v0.2 test browser mock exposed the obsolete `ownerGlobal` property, which hid the real-browser compatibility failure. The mock now exposes `documentGlobal` and `ownerDocument.defaultView` instead.

## Architecture / references

- `linked-tabs.uc.js`: Sine startup and teardown.
- `modules/Controller.sys.mjs`: pane controls, divider state, context menus, shortcut, preference observation, pairing, and actor marker cleanup.
- `modules/Actions.sys.mjs`: captured menu context, native split creation/reuse, focus, source exception, and background keep-page actions.
- `modules/Settings.sys.mjs` and `preferences.json`: typed runtime fallbacks and Sine settings.
- `modules/Marker.sys.mjs`: title targeting, text geometry, collision-aware badge placement, isolated SVG rendering and cleanup.
- `marker-preview.html` and `marker-preview.mjs`: local appearance playground using the same renderer as the content actor.
- `modules/Runtime.sys.mjs`: process-wide actor registration and active source routes.
- `actors/LinkedTabsChild.sys.mjs`: privileged capture of eligible source link clicks.
- `actors/LinkedTabsParent.sys.mjs`: principal-checked navigation into the paired browser.
- `modules/Policy.sys.mjs`: shared eligibility and split validation.

Source references reviewed on October 19–20, 2026:

- [Original Zen feature discussion](https://github.com/zen-browser/desktop/discussions/813#discussion-7096243).
- [Zen 1.23.3b split manager](https://github.com/zen-browser/desktop/blob/1.23.3b/src/zen/split-view/ZenViewSplitter.mjs): `split-view-group`, `splitViewBrowsers`, and split activation/removal events.
- [Zen actor registration](https://github.com/zen-browser/desktop/blob/1.23.3b/src/zen/common/sys/ZenActorsManager.sys.mjs).
- [Sine script discovery](https://github.com/CosmoCreeper/Sine/blob/v2.3.3/src/core/utils.sys.mjs) and [manager](https://github.com/CosmoCreeper/Sine/blob/v2.3.3/src/core/manager.sys.mjs).
- [Sine preference controls](https://github.com/CosmoCreeper/Sine/blob/v2.3.3/src/core/preferences.sys.mjs), [Zen's tab creation patches](https://github.com/zen-browser/desktop/blob/1.23.3b/src/browser/components/tabbrowser/Tabbrowser-sys-mjs.patch), and [Firefox context-menu navigation parameters](https://github.com/mozilla-firefox/firefox/blob/main/browser/base/content/nsContextMenu.sys.mjs) informed the v0.6 actions and settings.
- [Firefox click actor implementation](https://github.com/mozilla-firefox/firefox/blob/main/browser/actors/ClickHandlerChild.sys.mjs) and [parent](https://github.com/mozilla-firefox/firefox/blob/main/browser/actors/ClickHandlerParent.sys.mjs) informed the handling of principals and referrer information. These are internal APIs and may change.

License: MIT. This is an independent mod, not affiliated with Zen, Sine, or Microsoft.
