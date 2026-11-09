// cos-queue: the CEO's one queue in the Chief of Staff org.
//
// Every item is a decision, review or approval a lead raised through the CoS
// (`cos ask`, stored as ~/.local/state/cos/queue/<id>.json). This panel lists the
// open ones by priority, shows the selected one with its recommendation,
// options and screenshots, and records the answer with `cos answer`, which
// sends it to the CoS only. The CoS passes it on and closes the item once the
// lead reports it addressed.
//
// Two roles (layouts/cos.json):
// - panel (no props): the queue itself, a child of the side panel's stack next to
//   Files and Changes.
// - tabs (props.role "tabs"): Herdr's `tabs` bar, copied from mods/tabs/main.js
//   (mods can't import each other), with a Queue button right of Files and Changes
//   showing the open and answered counts. It is always on screen, so it also raises
//   the toast for new p0/p1 items.
//
// The list fills the panel; Enter or a click opens an item full height, Esc goes back.
//
// Keys (panel focused): j/k or arrows move · Enter open · Esc back · a approve · c request changes ·
// f feedback · x reject · 1-9 pick an option · o open the first attachment ·
// v switch Open/Answered · u reopen (in Answered). In the text box, Enter
// sends and Esc returns to the list.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { exec, home, appHome, theme, nextCommand, watchFolder, notify, props, spaces, panes, run, openOverlay, window, shared, layout, settings, focused } from "herdr";

const STATE = () => `${home()}/.local/state/cos`;
const COS = () => `${home()}/.local/bin/cos`;
const IMG_DIR = "mods/cos-queue/.shots"; // image() reads from the app folder, so screenshots are copied here
const PANEL = "panel", STACK = "panel-body", CHILD = "queue"; // layout node ids
const KIND_LABEL = { decision: "Decision", review: "Review", approval: "Approval", idea: "Idea", fyi: "FYI" };
const VERB = { approve: "Approved", changes: "Changes requested", feedback: "Feedback", choose: "Chose", reject: "Rejected" };

function age(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

// A side panel's shortcut (keys.json, layout:cos) opens it, or closes it if it's already
// showing; closing hands the keyboard back to the pane.
function togglePanelChild(child) {
  const root = layout(), panel = findNode(root, PANEL), body = findNode(root, STACK);
  if (!panel) return;
  if (!panel.hidden && body?.active === child) {
    const pane = focused()?.pane;
    run("layout.hide", { id: PANEL });
    if (pane) run("pane.focus", { pane });
    return;
  }
  run("layout.select", { stack: STACK, child });
  run("layout.show", { id: PANEL });
}

// Both roles read the queue the same way and redraw when its folder changes; the
// timer covers a missed event and keeps ages fresh.
function watchQueue(cx, load) {
  load(cx);
  cx.spawn(async (cx) => {
    for (;;) {
      try { await watchFolder(`${STATE()}/queue`); } catch { return; }
      load(cx);
    }
  });
  cx.timer.every(30000, (cx) => load(cx));
}

export default class Queue extends View {
  init(_props, cx) {
    if (props()?.role === "tabs") { this.role = "tabs"; this.initTabs(cx); return; }
    this.items = [];
    this.view = "open"; // or "answered"
    this.sel = 0;
    this.opened = false; // showing the selected item's detail instead of the list
    this.mode = null; // "changes" | "feedback" | "reject" while the text box collects a note
    this.error = null;
    this.busy = false;
    this.seen = null; // ids already shown, so only new urgent items raise a toast
    this.images = {}; // attachment path -> app-relative copy
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Add a note (optional), then a key: a approve · c changes · f feedback" });
    this.inputFocused = false;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.submitNote(cx));

    watchQueue(cx, (cx) => this.reload(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      let r;
      try { r = await exec(COS(), ["queue", "--json"]); } catch (e) { this.error = `cos is not installed: ${e}`; cx.notify(); return; }
      if (r.code !== 0) { this.error = r.stderr.trim() || "cos queue failed"; cx.notify(); return; }
      try { this.items = JSON.parse(r.stdout); this.error = null; } catch { this.error = "cos queue printed something unexpected"; }
      await this.copyImages();
      this.clampSel();
      cx.notify();
    });
  }

  // Tab bar (mods/tabs/main.js, plus the Queue button).

  initTabs(cx) {
    this.pressed = null;
    this.items = [];
    this.seen = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    watchQueue(cx, (cx) => cx.spawn(async (cx) => {
      const r = await exec(COS(), ["queue", "--json"]).catch(() => null);
      if (!r || r.code !== 0) return;
      try { this.items = JSON.parse(r.stdout); } catch { return; }
      this.announce();
      cx.notify();
    }));
    const actions = {
      "panel-files": () => togglePanelChild("files"),
      "panel-changes": () => togglePanelChild("changes"),
      "panel-queue": () => togglePanelChild(CHILD),
    };
    cx.spawn(async (cx) => {
      for (;;) { const a = actions[await nextCommand()]; if (a) { a(); cx.notify(); } }
    });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncTabsPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: STACK, child: want }); run("layout.show", { id: PANEL }); }
          else run("layout.hide", { id: PANEL });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  renderTabs(t) {
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = findNode(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = findNode(root, PANEL), body = findNode(root, STACK);
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), CHILD];
    this.syncTabsPanel(space, panel, body, enabled);
    const isOn = (id) => Boolean(panel && !panel.hidden && body?.active === id);
    const panelButton = (id, label, icon, extra) => {
      const on = isOn(id);
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: PANEL });
          else { run("layout.select", { stack: STACK, child: id }); run("layout.show", { id: PANEL }); }
        }).child(svg(icon).size(14)).child(label)
        .when(Boolean(extra), el => el.child(extra));
    };
    // Open count as a pill (red with a p0 waiting, accent otherwise), then the answered count.
    const open = this.items.filter((i) => i.status === "open");
    const answered = this.items.filter((i) => i.status === "answered").length;
    const urgent = open.some((i) => i.priority === "p0");
    const counts = h_flex().gap(4).items_center()
      .child(div().px(5).h(16).flex().items_center().rounded(8).text_size(10.5).font_semibold()
        .bg(open.length ? (urgent ? t.blocked : t.accent) + "33" : t.raised).text_color(open.length ? (urgent ? t.blocked : t.accent) : t.dim)
        .child(String(open.length)))
      .child(div().text_size(10.5).text_color(t.dim).child(`${answered} answered`));
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(panelButton(CHILD, "Queue", "mods/workspace-chrome/circle-check.svg", counts))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }

  // A toast for new p0/p1 items, after the first load.
  announce() {
    const open = this.items.filter((i) => i.status === "open");
    if (this.seen) {
      for (const i of open) {
        if (!this.seen.has(i.id) && (i.priority === "p0" || i.priority === "p1")) {
          notify({ title: `Queue · ${i.project}`, body: i.title, level: i.priority === "p0" ? "warning" : "info", timeout: 8000 });
        }
      }
    }
    this.seen = new Set(this.items.map((i) => i.id));
  }

  // Shrink each screenshot to at most 1400 px with sips (macOS) and keep its size:
  // image() needs explicit dimensions.
  async copyImages() {
    const wanted = this.items.flatMap((i) => (i.attachments || []).filter((a) => a.kind === "image" && !this.images[a.path]).map((a) => [i.id, a.path]));
    if (!wanted.length) return;
    await exec("mkdir", ["-p", `${appHome()}/${IMG_DIR}`]);
    for (const [id, path] of wanted) {
      const rel = `${IMG_DIR}/${id}-${path.split("/").pop().replace(/\.[^.]+$/, "")}.png`;
      const r = await exec("sips", ["-s", "format", "png", "-Z", "1400", path, "--out", `${appHome()}/${rel}`]);
      if (r.code !== 0) continue;
      const m = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", `${appHome()}/${rel}`]);
      const w = Number(/pixelWidth: (\d+)/.exec(m.stdout)?.[1]), h = Number(/pixelHeight: (\d+)/.exec(m.stdout)?.[1]);
      if (w && h) this.images[path] = { rel, ratio: h / w };
    }
  }

  imgW() { return Math.max(120, (this.width ?? 420) - 30); }

  shown() { return this.items.filter((i) => (this.view === "open" ? i.status === "open" : i.status === "answered")); }
  current() { return this.shown()[this.sel] ?? null; }
  clampSel() { this.sel = Math.max(0, Math.min(this.sel, this.shown().length - 1)); if (!this.shown().length) this.opened = false; }

  answer(cx, verdict, extra = {}) {
    const it = this.current();
    if (!it || this.busy) return;
    const text = this.input.value().trim();
    if ((verdict === "changes" || verdict === "feedback") && !text) {
      this.mode = verdict; this.input.focus(); cx.notify(); return;
    }
    const args = ["answer", it.id, "--verdict", verdict];
    if (text) args.push("--text", text);
    if (extra.choice) args.push("--choice", extra.choice);
    this.busy = true;
    cx.spawn(async (cx) => {
      const r = await exec(COS(), args);
      this.busy = false;
      if (r.code !== 0) { this.error = r.stderr.trim() || "cos answer failed"; cx.notify(); return; }
      this.error = r.stderr.trim() || null; // e.g. "CoS is not running; saved"
      this.input.set_value(""); this.mode = null; this.handle.focus();
      this.reload(cx);
    });
  }

  submitNote(cx) {
    if (!this.mode) { if (this.input.value().trim()) this.answer(cx, "feedback"); return; }
    this.answer(cx, this.mode);
  }

  reopen(cx) {
    const it = this.current();
    if (!it) return;
    cx.spawn(async (cx) => {
      const r = await exec(COS(), ["reopen", it.id, "--note", "Reopened by the CEO."]);
      if (r.code !== 0) this.error = r.stderr.trim();
      this.reload(cx);
    });
  }

  openAttachment(a) {
    if (!a) return;
    exec("open", [a.url || a.path]);
  }

  key(e, cx) {
    const k = e.keystroke;
    if (this.inputFocused) {
      if (k === "escape") { this.mode = null; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      return;
    }
    const it = this.current();
    const n = this.shown().length;
    const handled = () => { cx.stop_propagation(); cx.notify(); };
    if (k === "j" || k === "down") { this.sel = Math.min(n - 1, this.sel + 1); return handled(); }
    if (k === "k" || k === "up") { this.sel = Math.max(0, this.sel - 1); return handled(); }
    if (k === "v") { this.view = this.view === "open" ? "answered" : "open"; this.sel = 0; this.opened = false; return handled(); }
    if (!it) return;
    if (k === "enter" || k === "l" || k === "right") { this.opened = true; return handled(); }
    if (this.opened && (k === "escape" || k === "h" || k === "left")) { this.opened = false; return handled(); }
    if (this.view === "answered") { if (k === "u") { this.reopen(cx); return handled(); } return; }
    if (k === "a") { this.answer(cx, "approve"); return handled(); }
    if (k === "x") { this.answer(cx, "reject"); return handled(); }
    if (k === "c" || k === "f") { this.mode = k === "c" ? "changes" : "feedback"; this.input.focus(); return handled(); }
    if (k === "o") { this.openAttachment((it.attachments || [])[0]); return handled(); }
    if (/^[1-9]$/.test(k) && it.options?.[Number(k) - 1]) { this.answer(cx, "choose", { choice: it.options[Number(k) - 1] }); return handled(); }
  }

  render() {
    const t = theme();
    if (this.role === "tabs") return this.renderTabs(t);
    const shown = this.shown();
    const it = this.current();
    const openN = this.items.filter((i) => i.status === "open").length;
    const answeredN = this.items.filter((i) => i.status === "answered").length;
    const prioColor = (p) => (p === "p0" ? t.blocked : p === "p1" ? t.working : t.dim);
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color).text_color(color).text_size(10.5).font_medium().child(text);
    const tab = (id, label, count) => h_flex().id(`tab-${id}`).gap(6).px(10).h(26).items_center().rounded(6).cursor_pointer()
      .bg(this.view === id ? t.selected : t.chrome).text_color(this.view === id ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.view = id; this.sel = 0; this.opened = false; this.handle.focus(); cx.notify(); })
      .child(div().text_size(12).font_medium().child(label))
      .child(div().text_size(11).text_color(t.dim).child(String(count)));

    const header = h_flex().px(12).pt(10).pb(8).gap(6).items_center().border_b_1().border_color(t.border)
      .child(div().text_size(13).font_semibold().pr(6).child("Queue"))
      .child(tab("open", "Open", openN))
      .child(tab("answered", "Answered", answeredN))
      .child(div().flex_1())
      .when(this.busy, (el) => el.child(div().text_size(11).text_color(t.dim).frames(["sending ·", "sending ··", "sending ···"], 300)));

    const row = (i, idx) => h_flex().id(`row-${i.id}`).gap(8).px(12).py(7).items_center().cursor_pointer()
      .bg(idx === this.sel ? t.selected : t.surface).hover((s) => s.bg(idx === this.sel ? t.selected : t.hover))
      .on_click((_e, cx) => { this.sel = idx; this.opened = true; this.handle.focus(); cx.notify(); })
      .child(div().w(22).text_size(11).font_semibold().text_color(prioColor(i.priority)).child(i.priority.toUpperCase()))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(12.5).text_color(t.foreground).truncate().child(i.title))
        .child(div().text_size(11).text_color(t.dim).truncate().child(
          `${KIND_LABEL[i.kind] ?? i.kind} · ${i.project}` + (i.answer ? ` · ${VERB[i.answer.verdict] ?? i.answer.verdict}` : ""))))
      .child(div().text_size(11).text_color(t.dim).child(age(i.created)));

    const empty = v_flex().p(16).gap(4)
      .child(div().text_size(12.5).text_color(t.muted).child(this.view === "open" ? "Nothing needs you." : "No answers waiting on a lead."))
      .child(div().text_size(11.5).text_color(t.dim).child(this.view === "open"
        ? "Leads raise items through the Chief of Staff with `cos ask`. New urgent ones also pop up as a notification."
        : "Answered items stay here until the lead reports them addressed and the CoS closes them."));

    const list = v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar()
      .children(shown.length ? shown.map(row) : [empty]);
    const back = h_flex().id("back").gap(6).px(12).py(6).items_center().cursor_pointer().border_b_1().border_color(t.border)
      .text_size(11.5).text_color(t.muted).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.opened = false; this.handle.focus(); cx.notify(); })
      .child(`← ${this.view === "open" ? "Open" : "Answered"} · ${this.sel + 1} of ${shown.length}`);
    const body = this.opened && it ? v_flex().flex_1().min_h(0).child(back).child(this.detail(it, t, chip, prioColor)) : list;

    return v_flex().id("root").size_full().on_size_change((size, cx) => { this.width = size.width; cx.notify(); }).bg(t.surface).text_color(t.foreground)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(header)
      .when(Boolean(this.error), (el) => el.child(div().px(12).py(6).bg(t.raised).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(body)
      .child(this.footer(it, t));
  }

  detail(it, t, chip, prioColor) {
    const section = (label) => div().pt(12).pb(4).text_size(10.5).font_semibold().text_color(t.dim).child(label.toUpperCase());
    const atts = it.attachments || [];
    const imgs = atts.filter((a) => a.kind === "image" && this.images[a.path]);
    const others = atts.filter((a) => !(a.kind === "image" && this.images[a.path]));
    return v_flex().id(`detail-${it.id}`).flex_1().min_h(0).overflow_y_scrollbar().px(14).py(10)
      .child(h_flex().gap(6).items_center()
        .child(chip(it.priority.toUpperCase(), prioColor(it.priority)))
        .child(chip(KIND_LABEL[it.kind] ?? it.kind, t.muted))
        .child(div().text_size(11).text_color(t.dim).child(`${it.project} · from ${it.from} · ${age(it.created)} ago`)))
      .child(div().pt(8).text_size(15).font_semibold().child(it.title))
      .when(Boolean(it.body), (el) => el.child(div().pt(6).text_size(12.5).child(TextView.markdown(`body-${it.id}`, it.body).selectable(true))))
      .when(Boolean(it.recommendation), (el) => el.child(section("Recommended"))
        .child(div().p(10).rounded(6).bg(t.raised).border_1().border_color(t.border).text_size(12.5).child(it.recommendation)))
      .when((it.options || []).length > 0, (el) => el.child(section("Options"))
        .child(v_flex().gap(4).children(it.options.map((o, n) => h_flex().id(`opt-${n}`).gap(8).px(10).py(6).rounded(6)
          .border_1().border_color(it.answer?.choice === o ? t.accent : t.border).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.answer(cx, "choose", { choice: o }))
          .child(div().w(14).text_size(11).text_color(t.dim).child(String(n + 1)))
          .child(div().flex_1().text_size(12.5).child(o))))))
      .when(imgs.length > 0, (el) => el.child(section("Screenshots"))
        .child(v_flex().gap(8).children(imgs.map((a, n) => div().id(`img-${n}`).rounded(6).border_1().border_color(t.border).overflow_hidden().cursor_pointer()
          .on_click(() => this.openAttachment(a))
          .child(image(this.images[a.path].rel).w(this.imgW()).h(this.imgW() * this.images[a.path].ratio))))))
      .when(others.length > 0, (el) => el.child(section("Attachments"))
        .child(v_flex().gap(2).children(others.map((a, n) => div().id(`att-${n}`).text_size(12).text_color(t.accent).cursor_pointer()
          .hover((s) => s.underline()).on_click(() => this.openAttachment(a))
          .child(`${a.kind === "video" ? "▶ " : ""}${a.url || a.path.split("/").pop()}`)))))
      .when(Boolean(it.answer), (el) => el.child(section("Your answer"))
        .child(div().text_size(12.5).child(`${VERB[it.answer.verdict] ?? it.answer.verdict}${it.answer.choice ? `: ${it.answer.choice}` : ""}${it.answer.text ? ` — ${it.answer.text}` : ""}`))
        .child(div().pt(2).text_size(11).text_color(t.dim).child("Waiting for the lead to report it addressed. u reopens it.")));
  }

  footer(it, t) {
    const key = (k, label) => h_flex().gap(4).items_center()
      .child(div().px(5).rounded(4).bg(t.raised).border_1().border_color(t.border).text_size(10.5).font_medium().child(k))
      .child(div().text_size(11).text_color(t.muted).child(label));
    const modeLabel = { changes: "What should change?", feedback: "Your feedback", reject: "Why not?" }[this.mode];
    const open = this.view === "open" && it;
    const nav = this.opened ? key("esc", "back") : key("enter", "open");
    return v_flex().border_t_1().border_color(t.border).bg(t.chrome).px(12).py(8).gap(6)
      .when(open, (el) => el
        .when(Boolean(modeLabel), (el) => el.child(div().text_size(11).text_color(t.accent).child(`${modeLabel} Enter sends · Esc cancels`)))
        .child(Input.new(this.input).h(32).px(10).rounded(7).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.5)))
      .child(h_flex().gap(10).flex_wrap()
        .child(key("j/k", "move"))
        .when(Boolean(it), (el) => el.child(nav))
        .when(open, (el) => el.child(key("a", "approve")).child(key("c", "changes")).child(key("f", "feedback")).child(key("x", "reject"))
          .when((it?.options || []).length > 0, (el) => el.child(key("1-9", "pick")))
          .when((it?.attachments || []).length > 0, (el) => el.child(key("o", "open"))))
        .when(this.view === "answered" && Boolean(it), (el) => el.child(key("u", "reopen")))
        .child(key("v", this.view === "open" ? "answered" : "open")));
  }
}
