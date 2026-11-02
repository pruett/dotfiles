// Orchestrator mode: an agent with live sub-agents reporting to it.
// hc send waits for a 3 s typing pause, not an empty input box, so a child's report
// can submit a half-typed message with it (herdrdev/herdr-core#64). A draft box below
// the tab keeps the orchestrator's own input box empty; Cmd+Enter sends the draft.
//
// Two roles, both placed by layouts/orchestrator-mode.json:
// - draft (props.role "draft"): the block below the tab. It shows itself while the
//   shown tab holds an orchestrator (the headers show and hide it); one draft each.
// - header (props { pane, terminal } from the layout's pane header): Herdr's `pane`
//   header, plus an "Orchestrating" badge on an orchestrator's pane. Mods can't
//   import each other, so the header part is copied from mods/pane/main.js.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { agents, terminals, panes, focused, layout, props, run, hc, theme, home, nextCommand } from "herdr";

const MOD = "orchestrator-mode";
const BLOCK = "orchestrator-draft"; // the layout node the draft lives in

// Live agent terminals started by this address (shells and servers don't count).
const helpersOf = (address, all = terminals()) =>
  all.filter((k) => k.parent === address && k.state === "live" && (k.program?.agent || k.status));

// The orchestrator in the shown tab, with its helpers, or null.
function shownOrchestrator() {
  const tab = focused()?.tab;
  const all = terminals();
  for (const a of agents()) {
    if (a.tab !== tab) continue;
    const helpers = helpersOf(a.address, all);
    if (helpers.length) return { ...a, helpers };
  }
  return null;
}

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

// Show the draft block while the shown tab holds an orchestrator. Run by every pane
// header: a hidden block's own mod never starts, so it can't show itself.
function syncBlock() {
  const node = findNode(layout(), BLOCK);
  if (!node) return;
  const want = Boolean(shownOrchestrator());
  if (Boolean(node.hidden) === want) run(want ? "layout.show" : "layout.hide", { id: BLOCK });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// From mods/pane/main.js.
function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class OrchestratorMode extends View {
  init(_props, cx) {
    this.role = props()?.role === "draft" ? "draft" : "header";
    if (this.role === "draft") this.initDraft(cx);
    else {
      this.hovered = false;
      cx.timer.every(1500, () => syncBlock());
    }
  }

  // Draft block.

  initDraft(cx) {
    this.address = null; // the orchestrator the box is drafting to
    this.status = null;
    this.sending = false;
    this.input = TextareaState.new({ placeholder: "Message the orchestrator here. Reports from its helpers can't mix into this." });
    this.input.set_soft_wrap(true);
    this.input.on("change", () => this.save());
    this.input.on("submit", (e, cx) => { if (e.secondary) this.send(cx); });
    cx.spawn(async () => {
      for (;;) if ((await nextCommand()) === "focus") this.input.focus();
    });
    cx.timer.every(1500, (cx) => this.sync(cx));
    this.sync(cx);
  }

  drafts() {
    try { return JSON.parse(localStorage.getItem("drafts")) ?? {}; } catch { return {}; }
  }

  save() {
    if (!this.address) return;
    const drafts = this.drafts();
    const text = this.input.value();
    if (text) drafts[this.address] = text; else delete drafts[this.address];
    localStorage.setItem("drafts", JSON.stringify(drafts));
  }

  // Follow the shown tab's orchestrator: swap in its draft.
  sync(cx) {
    const o = shownOrchestrator();
    const address = o?.address ?? null;
    if (address !== this.address) {
      this.save();
      this.address = address;
      this.status = null;
      if (address) this.input.set_value(this.drafts()[address] ?? "");
      if (address) this.input.focus();
      cx.notify();
    }
  }

  send(cx) {
    const text = this.input.value().trim();
    const address = this.address;
    if (!text || !address || this.sending) return;
    this.sending = true;
    this.status = { level: "info", text: "Sending…" };
    cx.notify();
    cx.spawn(async (cx) => {
      // hc send pastes and presses Enter; it refuses an agent waiting at a dialog.
      const r = await hc(["send", address, text, "--json"]).catch((e) => ({ code: 1, stderr: String(e) }));
      this.sending = false;
      if (r.code === 0) {
        if (this.address === address) this.input.set_value("");
        const drafts = this.drafts();
        delete drafts[address];
        localStorage.setItem("drafts", JSON.stringify(drafts));
        this.status = { level: "ok", text: `Sent ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` };
      } else {
        this.status = { level: "error", text: (r.stderr || r.stdout || "hc send failed").trim().split("\n")[0] };
      }
      this.input.focus();
      cx.notify();
    });
  }

  renderDraft(t) {
    const o = this.address ? agents().find((a) => a.address === this.address) : null;
    if (!o) return div().size_full();
    const helpers = helpersOf(o.address);
    const working = helpers.filter((k) => k.status === "working").length;
    const empty = !this.input.value().trim();
    const statusColor = { ok: t.done, error: t.blocked, info: t.dim }[this.status?.level] ?? t.dim;
    return div().size_full().pt(2).px(8).pb(8).bg(t.canvas).child(
      v_flex().size_full().p(10).gap(8).rounded(10).border_1().border_color(t.accent)
        .bg(t.accent + "0d").text_color(t.foreground).text_size(12.5)
        .child(h_flex().gap(8).items_center()
          .child(svg("mods/workspace-chrome/layers.svg").size(13).flex_none().text_color(t.accent))
          .child(div().flex_none().font_semibold().text_color(t.accent).child("Orchestrator"))
          .child(div().flex_1().truncate().text_color(t.muted).child(o.title || o.address))
          .child(div().flex_none().text_size(11.5).text_color(working ? t.working : t.dim)
            .child(`${plural(helpers.length, "helper")}${working ? `, ${working} working` : ""}`)))
        .child(h_flex().flex_1().min_h(0).gap(8).items_end()
          .child(Textarea.new(this.input).flex_1().h_full().p(8).rounded(7).border_1().border_color(t.input)
            .bg(t.background).text_color(t.foreground).text_size(13))
          .child(v_flex().flex_none().gap(6).items_end()
            .child(div().text_size(11).text_color(statusColor).child(this.status?.text ?? "⌘↵ send"))
            .child(h_flex().id("om-send").h(30).px(14).items_center().rounded(7).text_size(12).font_medium()
              .bg(empty ? t.raised : t.accent).text_color(empty ? t.dim : t.accent_foreground)
              .when(!empty, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
              .on_click((_e, cx) => this.send(cx))
              .child(this.sending ? "Sending…" : "Send")))));
  }

  // Pane header (mods/pane/main.js, plus the badge).

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  badge(t, helpers) {
    const working = helpers.filter((k) => k.status === "working").length;
    return h_flex().id("om-badge").flex_none().h(20).px(7).gap(5).items_center().rounded(6)
      .bg(t.accent + "1f").border_1().border_color(t.accent + "40").text_color(t.accent)
      .text_size(10.5).font_semibold()
      .child(svg("mods/workspace-chrome/layers.svg").size(11).flex_none())
      .child("Orchestrating")
      .child(div().font_normal().opacity(0.8).child(working ? `${working}/${helpers.length}` : `${helpers.length}`));
  }

  renderHeader(t) {
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = programIcon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const helpers = p.terminal ? helpersOf(p.terminal) : [];
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .when(helpers.length > 0, (el) => el.child(this.badge(t, helpers)))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }

  render() {
    const t = theme();
    return this.role === "draft" ? this.renderDraft(t) : this.renderHeader(t);
  }
}
