// Skill picker: every skill in ~/.agents/skills, grouped by the stack it came
// from (mine, pstack, mattpocock, ...), with the whole SKILL.md beside the list.
// Type to filter (name, description, stack), ↑/↓ to move, Tab/Shift-Tab to
// jump between groups, Enter types
// "/<name> " into the terminal you came from, Esc leaves.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, ScrollHandle } from "gpui-base";
import { exec, hc, theme, props, focused, closeOverlay, checking } from "herdr";

// Reads every SKILL.md once and prints JSON. The stack comes from where the
// skill lives: a .plugins link, a skills-lock entry (pstack when it is from
// cursor/plugins' pstack folder, else the repo owner), or "mine".
const INDEX = String.raw`
import json, os, re
home = os.path.expanduser("~/.agents")
try:
    lock = json.load(open(os.path.join(home, ".skill-lock.json"))).get("skills", {})
except Exception:
    lock = {}
out = []
root = os.path.join(home, "skills")
for d in sorted(os.listdir(root)):
    f = os.path.join(root, d, "SKILL.md")
    if not os.path.isfile(f):
        continue
    text = open(f, encoding="utf-8", errors="replace").read()
    meta, body = {}, text
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if m:
        body = m.group(2)
        key = None
        for line in m.group(1).splitlines():
            km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
            if km:
                key = km.group(1)
                v = km.group(2).strip()
                meta[key] = "" if v in (">", "|", ">-", "|-") else v.strip("\"'")
            elif key and line.startswith((" ", "\t")):
                meta[key] = (meta[key] + " " + line.strip()).strip()
    real = os.path.realpath(os.path.join(root, d))
    pm = re.search(r"/\.plugins/([^/]+)/", real)
    entry = lock.get(d)
    if pm:
        stack = pm.group(1)
    elif entry:
        stack = "pstack" if "/pstack/" in entry.get("skillPath", "") else entry.get("source", "?").split("/")[0]
    else:
        stack = "mine"
    out.append({
        "name": meta.get("name") or d,
        "description": meta.get("description", ""),
        "manual": meta.get("disable-model-invocation", "").lower() == "true",
        "stack": stack,
        "body": body.strip(),
    })
print(json.dumps(out))
`;

const ORDER = ["mine", "pstack", "mattpocock"];
const rank = (s) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);

export default class Skills extends View {
  init(_props, cx) {
    this.skills = [];
    this.error = null;
    this.filter = "";
    this.at = 0;
    this.target = focused()?.terminal ?? null;
    this.handle = cx.focus_handle();
    this.list = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Find a skill…  (try: pstack, review, design)" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.pick(this.rows().items[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    if (checking()) return;
    cx.spawn(async (cx) => {
      const r = await exec("python3", ["-c", INDEX]);
      if (r.code === 0) this.skills = JSON.parse(r.stdout);
      else this.error = r.stderr || "could not read skills";
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Groups in stack order; with a filter, best name matches first inside each.
  rows() {
    const terms = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (s) => {
      const hay = `${s.stack} ${s.name} ${s.description}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return -1;
      return terms.reduce((n, t) => n + (s.name.startsWith(t) ? 3 : s.name.includes(t) ? 2 : 0), 0);
    };
    const hits = this.skills.map((s) => ({ s, n: score(s) })).filter((x) => x.n >= 0);
    hits.sort((a, b) => rank(a.s.stack) - rank(b.s.stack) || a.s.stack.localeCompare(b.s.stack) || b.n - a.n || a.s.name.localeCompare(b.s.name));
    const rows = [];
    const items = [];
    let stack = null;
    for (const { s } of hits) {
      if (s.stack !== stack) {
        stack = s.stack;
        rows.push({ head: stack, count: hits.filter((x) => x.s.stack === stack).length });
      }
      rows.push({ skill: s, index: items.length });
      items.push(s);
    }
    return { rows, items };
  }

  // Types "/name " into the terminal that had focus; Enter stays with you so
  // you can add arguments. Without a terminal, copies it instead.
  pick(s, cx) {
    if (!s) return;
    const text = `/${s.name} `;
    const target = this.target;
    this.close();
    cx.spawn(async () => {
      if (target) {
        const keys = [...text].map((c) => (c === " " ? "space" : c));
        const r = await hc(["keys", target, ...keys]);
        if (r.code === 0) return;
      }
      await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "_", text]);
    });
  }

  render() {
    const t = theme();
    const { rows, items } = this.rows();
    this.at = Math.max(0, Math.min(this.at, items.length - 1));
    const sel = items[this.at];
    const selRow = rows.findIndex((r) => r.skill === sel);
    // Index in items of each group's first skill.
    const starts = rows.flatMap((r, i) => (r.head ? [rows[i + 1].index] : []));

    const badge = (label, color) =>
      div().px(6).py(1).rounded(4).border_1().border_color(color).text_size(10.5).text_color(color).child(label);

    const row = (r) => {
      if (r.head) {
        return h_flex().px(10).pt(10).pb(3).gap(6).text_size(11).font_semibold().text_color(t.dim)
          .child(r.head.toUpperCase()).child(div().text_color(t.dim).child(`${r.count}`));
      }
      const s = r.skill;
      const on = s === sel;
      return v_flex()
        .id(`sk-${s.stack}-${s.name}`)
        .mx(4).px(10).py(5).rounded(7).gap(1).cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => { this.at = r.index; cx.notify(); })
        .on_mouse_down("left", (e, cx) => { if (e.click_count === 2) this.pick(s, cx); })
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().truncate().text_color(t.foreground).when(on, (d) => d.font_semibold()).child(s.name))
          .when(s.manual, (el) => el.child(div().text_size(10.5).text_color(t.dim).child("/ only"))))
        .child(div().truncate().text_size(11.5).text_color(t.muted).child(s.description || "(no description)"));
    };

    const detail = sel
      ? v_flex().flex_1().h_full().min_w(0).min_h(0).gap(10)
          .child(h_flex().gap(8).items_center()
            .child(div().text_size(17).font_semibold().text_color(t.foreground).child(`/${sel.name}`))
            .child(badge(sel.stack, t.accent))
            .child(badge(sel.manual ? "you invoke it" : "agent may invoke", t.dim)))
          .child(div().text_size(13).text_color(t.foreground).whitespace_normal().child(sel.description))
          .child(div().h(1).bg(t.border))
          .child(v_flex().id("sk-body").flex_1().min_h(0).overflow_y_scrollbar().text_size(12.5).text_color(t.muted)
            .child(TextView.markdown(`sk-md-${sel.stack}-${sel.name}`, sel.body).raw_html(false)))
      : v_flex().flex_1().items_center().justify_center().text_color(t.dim)
          .child(this.error ?? (this.skills.length ? "No skill matches." : "Reading skills…"));

    if (selRow >= 0) this.list.scroll_to_item(selRow);

    return v_flex()
      .id("skills")
      .track_focus(this.handle)
      .size_full().min_h(0).p(18).gap(12).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        const ctrl = e.modifiers.control;
        if (k === "escape") return this.close();
        if (k === "down" || (k === "n" && ctrl)) this.at = Math.min(items.length - 1, this.at + 1);
        else if (k === "up" || (k === "p" && ctrl)) this.at = Math.max(0, this.at - 1);
        else if (k === "tab" && starts.length) {
          // Tab: first skill of the next group. Shift-Tab: start of this group,
          // or of the one before when already there. Both wrap.
          const cur = starts.filter((s) => s <= this.at).length - 1;
          if (!e.modifiers.shift) this.at = starts[(cur + 1) % starts.length];
          else this.at = this.at > starts[cur] ? starts[cur] : starts[(cur - 1 + starts.length) % starts.length];
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Skills"))
        .child(div().text_size(11).text_color(t.dim).child(
          this.target ? `Enter types /name into ${this.target} · Esc` : "Enter copies /name · Esc")))
      .child(h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
        .child(div().text_size(11).text_color(t.dim).child(`${items.length}/${this.skills.length}`)))
      .child(h_flex().flex_1().min_h(0).gap(16).items_start()
        .child(v_flex().id("sk-list").w(340).flex_none().h_full().overflow_y_scrollbar().track_scroll(this.list)
          .children(rows.map(row)))
        .child(div().w(1).h_full().bg(t.border))
        .child(detail));
  }
}
