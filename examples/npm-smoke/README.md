# Published web-marker smoke app

This private throwaway app installs `@notelix/web-marker@latest` from the public npm registry. The resolved version is pinned to **2.0.11** in package.json and package-lock.json. It bundles the installed package with esbuild; no source checkout or local tarball is used.

Requires Node.js 22 or newer (the CDP harness uses Node’s native WebSocket) and a local Chrome or Chromium executable.

## Run

```sh
cd examples/npm-smoke
npm ci
npm start
# Open http://127.0.0.1:4178
```

Drag to select Chinese text, then click Highlight. Save and Restore persist both the main document and iframe highlights in localStorage. Click a highlighted passage to remove it. Use the dropdown to try overlapping highlight policies.

## Repeat the real-browser smoke test

```sh
CHROME_BIN=/path/to/chrome npm test
```

The harness starts its own server on an ephemeral loopback port and headless Chromium with a separate temporary profile. It connects directly to Chrome DevTools Protocol over WebSocket. Text selection uses `Input.dispatchMouseEvent` mouse drags; it does not substitute programmatic DOM selections. Buttons and highlight removal also use CDP mouse events. The server and browser stop when testing finishes.

`registry.json` records the public registry metadata at the time of the 2.0.11 release test; reruns compare against this snapshot. To test a future latest release, run `npm install --save-exact @notelix/web-marker@latest` and refresh it with `npm view @notelix/web-marker dist-tags dist.integrity --json --registry=https://registry.npmjs.org/ > registry.json`.

Results: `artifacts/report.json`. Screenshot after restoring main-document and iframe highlights: `artifacts/chinese-highlights.png`.

All 14 checks passed on Chrome 151.0.7922.34: public package loading; single Han character selection, painting and deserialization; click removal and cache cleanup; selection across inline elements; iframe highlighting; persistence across reload; supplementary Han character and emoji preservation; `__proto__`; all four overlap policies; original text and style cleanup; and no console exceptions, failed requests, or default debug output.

Visual inspection confirmed ordinary Chinese text and highlights render correctly. The container font displays the rare character `𠮷` as a missing-glyph box, although mouse selection, serialization and text preservation for that character passed. This is a desktop Chromium smoke test; touch selection and other browser engines were not tested.
