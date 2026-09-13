import { Marker } from "@notelix/web-marker";
import pkg from "@notelix/web-marker/package.json";
const root = document.querySelector("#reader");
const frame = document.querySelector("#frame");
const state = { main: new Map(), frame: new Map(), clicks: 0, deletions: 0 };
const markers = {};
const status = (message) =>
  (document.querySelector("#status").textContent = message);
function createMarker(kind, element) {
  return new Marker({
    rootElement: element,
    overlappingHighlight: document.querySelector("#mode").value,
    highlightPainter: {
      paintHighlight(context, element) {
        element.style.backgroundColor = "#ffe082";
        element.style.color = "#172130";
        element.dataset.testHighlight = context.serializedRange.uid;
      },
    },
    eventHandler: {
      onHighlightClick(context) {
        state.clicks++;
        markers[kind].unpaint(context.serializedRange);
        state[kind].delete(context.serializedRange.uid);
        status("Highlight removed");
      },
      onHighlightDeleted(context) {
        state.deletions++;
        state[kind].delete(context.serializedRange.uid);
      },
    },
  });
}
function reset() {
  for (const [kind, marker] of Object.entries(markers)) {
    for (const item of state[kind].values()) marker.unpaint(item);
    state[kind].clear();
    marker.removeEventListeners();
  }
  markers.main = createMarker("main", root);
  markers.frame = createMarker("frame", frame.contentDocument.body);
  Object.values(markers).forEach((marker) => marker.addEventListeners());
  status("Ready");
}
function paintSelection() {
  const kind = frame.contentWindow.getSelection().toString() ? "frame" : "main";
  const selection = markers[kind].window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    status("Select text first");
    return;
  }
  const serialized = markers[kind].serializeRange(selection.getRangeAt(0));
  if (!serialized) {
    status("Overlap rejected");
    return;
  }
  markers[kind].paint(serialized);
  state[kind].set(serialized.uid, serialized);
  document.querySelector("#serialized").textContent = JSON.stringify(
    serialized,
    null,
    2,
  );
  status("Highlighted: " + serialized.text);
  selection.removeAllRanges();
}
function save() {
  localStorage.setItem(
    "web-marker-smoke",
    JSON.stringify(
      Object.fromEntries(
        ["main", "frame"].map((kind) => [kind, [...state[kind].values()]]),
      ),
    ),
  );
  status("Saved");
}
function restore() {
  const data = JSON.parse(localStorage.getItem("web-marker-smoke") || "{}");
  reset();
  for (const kind of ["main", "frame"])
    for (const item of data[kind] || []) {
      markers[kind].paint(item);
      state[kind].set(item.uid, item);
    }
  status("Restored");
}
for (const id of ["paint", "save", "restore", "clear"])
  document
    .querySelector("#" + id)
    .addEventListener("mousedown", (e) => e.preventDefault());
document.querySelector("#paint").onclick = paintSelection;
document.querySelector("#save").onclick = save;
document.querySelector("#restore").onclick = restore;
document.querySelector("#clear").onclick = reset;
document.querySelector("#mode").onchange = reset;
if (!frame.contentDocument?.querySelector("#frameText"))
  await new Promise((resolve) =>
    frame.addEventListener("load", resolve, { once: true }),
  );
reset();
document.querySelector("#version").textContent =
  `Installed from npm: ${pkg.name}@${pkg.version}`;
window.smoke = { state, markers, reset, version: pkg.version };
