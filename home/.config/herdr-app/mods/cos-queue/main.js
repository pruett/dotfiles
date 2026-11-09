// cos-queue: the CEO's one queue in the Chief of Staff org.
//
// Every item is a decision, review or approval a lead raised through the CoS
// (`cos ask`, stored as ~/.local/state/cos/queue/<id>.json). This panel lists the
// open ones by priority, shows the selected one with its recommendation,
// options and screenshots, and records the answer with `cos answer`, which
// sends it to the CoS only. The CoS passes it on and closes the item once the
// lead reports it addressed.
//
// Keys (panel focused): j/k or arrows move · a approve · c request changes ·
// f feedback · x reject · 1-9 pick an option · o open the first attachment ·
// v switch Open/Answered · u reopen (in Answered). In the text box, Enter
// sends and Esc returns to the list.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { exec, home, appHome, theme, nextCommand, watchFolder, notify } from "herdr";
import * as fs from "fs/promises";

const STATE = () => `${home()}/.local/state/cos`;
const COS = () => `${home()}/.local/bin/cos`;
const IMG_DIR = "mods/cos-queue/.shots"; // image() reads from the app folder, so screenshots are copied here
const BEAT = "data/cos-queue/alive"; // `cos up` reads its age to know a panel is showing
const KIND_LABEL = { decision: "Decision", review: "Review", approval: "Approval", idea: "Idea", fyi: "FYI" };
const VERB = { approve: "Approved", changes: "Changes requested", feedback: "Feedback", choose: "Chose", reject: "Rejected" };

function age(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default class Queue extends View {
  init(_props, cx) {
    this.items = [];
    this.view = "open"; // or "answered"
    this.sel = 0;
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

    this.reload(cx);
    // Redraw when the queue folder changes; the timer covers a missed event and keeps ages fresh.
    cx.spawn(async (cx) => {
      for (;;) {
        try { await watchFolder(`${STATE()}/queue`); } catch { return; }
        this.reload(cx);
      }
    });
    cx.timer.every(30000, (cx) => this.reload(cx));
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
      // Heartbeat: `cos up` splits a panel in only when no copy has touched this lately.
      fs.mkdir(`${appHome()}/data/cos-queue`, { recursive: true }).then(() => fs.writeFile(`${appHome()}/${BEAT}`, String(Date.now()))).catch(() => {});
      if (r.code !== 0) { this.error = r.stderr.trim() || "cos queue failed"; cx.notify(); return; }
      try { this.items = JSON.parse(r.stdout); this.error = null; } catch { this.error = "cos queue printed something unexpected"; }
      this.announce();
      await this.copyImages();
      this.clampSel();
      cx.notify();
    });
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
  clampSel() { this.sel = Math.max(0, Math.min(this.sel, this.shown().length - 1)); }

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
    if (k === "v") { this.view = this.view === "open" ? "answered" : "open"; this.sel = 0; return handled(); }
    if (!it) return;
    if (this.view === "answered") { if (k === "u") { this.reopen(cx); return handled(); } return; }
    if (k === "a") { this.answer(cx, "approve"); return handled(); }
    if (k === "x") { this.answer(cx, "reject"); return handled(); }
    if (k === "c" || k === "f") { this.mode = k === "c" ? "changes" : "feedback"; this.input.focus(); return handled(); }
    if (k === "o") { this.openAttachment((it.attachments || [])[0]); return handled(); }
    if (/^[1-9]$/.test(k) && it.options?.[Number(k) - 1]) { this.answer(cx, "choose", { choice: it.options[Number(k) - 1] }); return handled(); }
  }

  render() {
    const t = theme();
    const shown = this.shown();
    const it = this.current();
    const openN = this.items.filter((i) => i.status === "open").length;
    const answeredN = this.items.filter((i) => i.status === "answered").length;
    const prioColor = (p) => (p === "p0" ? t.blocked : p === "p1" ? t.working : t.dim);
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color).text_color(color).text_size(10.5).font_medium().child(text);
    const tab = (id, label, count) => h_flex().id(`tab-${id}`).gap(6).px(10).h(26).items_center().rounded(6).cursor_pointer()
      .bg(this.view === id ? t.selected : t.chrome).text_color(this.view === id ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.view = id; this.sel = 0; this.handle.focus(); cx.notify(); })
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
      .on_click((_e, cx) => { this.sel = idx; this.handle.focus(); cx.notify(); })
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

    const list = v_flex().id("list").flex_none().h(Math.min(240, Math.max(1, shown.length) * 46 + 4)).overflow_y_scrollbar().border_b_1().border_color(t.border)
      .children(shown.length ? shown.map(row) : [empty]);

    return v_flex().id("root").size_full().on_size_change((size, cx) => { this.width = size.width; cx.notify(); }).bg(t.surface).text_color(t.foreground)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(header)
      .when(Boolean(this.error), (el) => el.child(div().px(12).py(6).bg(t.raised).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(list)
      .child(it ? this.detail(it, t, chip, prioColor) : div().flex_1())
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
    return v_flex().border_t_1().border_color(t.border).bg(t.chrome).px(12).py(8).gap(6)
      .when(open, (el) => el
        .when(Boolean(modeLabel), (el) => el.child(div().text_size(11).text_color(t.accent).child(`${modeLabel} Enter sends · Esc cancels`)))
        .child(Input.new(this.input).h(32).px(10).rounded(7).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.5)))
      .child(h_flex().gap(10).flex_wrap()
        .child(key("j/k", "move"))
        .when(open, (el) => el.child(key("a", "approve")).child(key("c", "changes")).child(key("f", "feedback")).child(key("x", "reject"))
          .when((it?.options || []).length > 0, (el) => el.child(key("1-9", "pick")))
          .when((it?.attachments || []).length > 0, (el) => el.child(key("o", "open"))))
        .when(this.view === "answered" && Boolean(it), (el) => el.child(key("u", "reopen")))
        .child(key("v", this.view === "open" ? "answered" : "open")));
  }
}
