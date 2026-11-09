// keys.json binds this (mod.open:toggle-files): show the side panel on "files", or hide it
// if it already shows "files". Opened as an overlay; it toggles and closes itself.
// Same logic as togglePanelChild in mods/brass/main.js.
import { View, div } from "gpui-kit";
import { layout, focused, run, closeOverlay, props } from "herdr";

const CHILD = "files", PANEL = "panel", STACK = "panel-body";

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

export default class TogglePanel extends View {
  init() {
    const pane = focused()?.pane;
    const root = layout(), panel = findNode(root, PANEL), body = findNode(root, STACK);
    if (panel) {
      if (!panel.hidden && body?.active === CHILD) run("layout.hide", { id: PANEL });
      else { run("layout.select", { stack: STACK, child: CHILD }); run("layout.show", { id: PANEL }); }
    }
    const id = props()?.overlay;
    if (id) closeOverlay(id);
    if (pane) run("pane.focus", { pane });
  }
  render() { return div(); }
}
