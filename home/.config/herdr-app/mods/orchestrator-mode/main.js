// Orchestrator mode: an agent with live sub-agents reporting to it.
// hc send waits for a 3 s typing pause, not an empty input box, so a child's report
// can submit a half-typed message with it (herdrdev/herdr-core#64). A draft box in the
// side panel keeps the orchestrator's own input box empty; Cmd+Enter sends the draft.
//
// Three roles, all placed by layouts/orchestrator-mode.json:
// - panel (props.role "panel"): the "orchestrator" child of the side panel's stack,
//   beside Files and Changes; one draft each.
// - tabs (props.role "tabs"): Herdr's `tabs` bar, copied from mods/tabs/main.js, with an
//   Orchestrator button right of Files and Changes. It opens the panel when the shown
//   tab gains an orchestrator and puts the panel back when it loses one.
// - header (props { pane, terminal } from the layout's pane header): Herdr's `pane`
//   header, plus an "Orchestrating" badge on an orchestrator's pane. Mods can't
//   import each other, so the header part is copied from mods/pane/main.js.
//
// Orchestrator mode can also be turned on by hand, helpers or not: the label
// orchestrator=on on the agent's terminal (the Orchestrator button, cmd-alt-o, or
// `hc label <t> orchestrator=on`).
//
// The draft box has vim keys, on by default (the "vim" chip in its footer turns them
// off). Typing "/" at the start of a word, anywhere in the draft, lists the orchestrator's
// slash commands. Claude Code records the skills it
// loaded as a `skill_listing` line in its transcript; a SessionStart hook in
// ~/.claude*/settings.json labels the terminal with that transcript's path
// (claude.transcript). Sessions started before the hook fall back to the newest
// transcript for the folder.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { agents, spaces, terminals, panes, focused, layout, props, run, hc, exec, theme, home, nextCommand, shared, setShared, openOverlay, window, settings } from "herdr";

const MOD = "orchestrator-mode";
const PANEL = "panel", STACK = "panel-body", CHILD = "orchestrator"; // layout node ids

// Built-in Claude Code commands; skills come from the transcript.
const CLAUDE_BUILTINS = [
  ["clear", "Clear the conversation"],
  ["compact", "Summarize the conversation to free context"],
  ["context", "Show what fills the context window"],
  ["model", "Switch the model"],
  ["config", "Open settings"],
  ["status", "Show version, model and account"],
  ["usage", "Show plan usage"],
  ["cost", "Show token cost of this session"],
  ["resume", "Resume an earlier conversation"],
  ["rewind", "Rewind the conversation or code"],
  ["memory", "Edit memory files"],
  ["agents", "Manage sub-agents"],
  ["mcp", "Manage MCP servers"],
  ["hooks", "Manage hooks"],
  ["permissions", "Manage tool permissions"],
  ["plugin", "Manage plugins"],
  ["add-dir", "Add a working directory"],
  ["export", "Export the conversation"],
  ["help", "Show help"],
].map(([name, about]) => ({ name, about, builtin: true }));

// Live agent terminals started by this address (shells and servers don't count).
const helpersOf = (address, all = terminals()) =>
  all.filter((k) => k.parent === address && k.state === "live" && (k.program?.agent || k.status));

const manual = (address, all = terminals()) => all.find((k) => k.address === address)?.labels?.orchestrator === "on";

// An agent with helpers, or one turned on by hand.
const orchestrating = (address, all = terminals()) => helpersOf(address, all).length > 0 || manual(address, all);

function setManual(address, on) {
  hc(["label", address, on ? "orchestrator=on" : "orchestrator="]).catch(() => {});
}

// The agent the shown tab's button and key act on: the focused pane's, else the first.
function tabAgent() {
  const f = focused();
  const inTab = agents().filter((a) => a.tab === f?.tab);
  return inTab.find((a) => a.address === f?.terminal) ?? inTab[0] ?? null;
}

// The orchestrator in the shown tab, with its helpers, or null.
function shownOrchestrator() {
  const tab = focused()?.tab;
  const all = terminals();
  for (const a of agents()) {
    if (a.tab !== tab) continue;
    if (orchestrating(a.address, all)) return { ...a, helpers: helpersOf(a.address, all) };
  }
  return null;
}

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

function panelState() {
  const root = layout(), panel = findNode(root, PANEL), body = findNode(root, STACK);
  if (!panel || !findNode(body, CHILD)) return null;
  return { panel, body, showing: !panel.hidden && body.active === CHILD };
}

function showPanel(child) {
  run("layout.select", { stack: STACK, child });
  run("layout.show", { id: PANEL });
}

// Open the panel once per orchestrator the shown tab gains, and put back what was there
// when it loses it. Run by the tab bar: a panel that never showed has no running copy.
function syncPanel() {
  const s = panelState();
  if (!s) return;
  const o = shownOrchestrator(), opened = shared(`${MOD}.opened`) ?? null;
  if (o && opened !== o.address) {
    setShared(`${MOD}.opened`, o.address);
    if (!s.showing) {
      setShared(`${MOD}.before`, s.panel.hidden ? null : s.body.active);
      showPanel(CHILD);
    }
  } else if (!o && opened) {
    setShared(`${MOD}.opened`, null);
    if (s.showing) {
      const before = shared(`${MOD}.before`);
      if (before) showPanel(before); else run("layout.hide", { id: PANEL });
    }
  }
}

function togglePanel() {
  const s = panelState();
  if (!s) return;
  if (s.showing) run("layout.hide", { id: PANEL }); else showPanel(CHILD);
}

// The Orchestrator button and cmd-shift-o. No orchestrator: turn one on by hand (the
// panel follows). Panel hidden: show it. Panel shown: leave a hand-turned mode, or
// just hide the panel of one that has helpers.
function pressOrchestrator() {
  const o = shownOrchestrator(), s = panelState();
  if (!o) { const a = tabAgent(); if (a) setManual(a.address, true); return; }
  if (!s?.showing) { showPanel(CHILD); return; }
  if (manual(o.address)) setManual(o.address, false); else run("layout.hide", { id: PANEL });
}

// Shortcuts (keys.json, layout:orchestrator-mode). A side panel's key opens it, or
// closes it if it's already showing; closing hands the keyboard back to the pane.
function togglePanelChild(child) {
  const s = panelState();
  if (!s) return;
  if (!s.panel.hidden && s.body.active === child) {
    const pane = focused()?.pane;
    run("layout.hide", { id: PANEL });
    if (pane) run("pane.focus", { pane });
    return;
  }
  showPanel(child);
  // A command would reach the panel before it shows; the panel takes this when it draws.
  if (child === CHILD) setShared(`${MOD}.focus`, Date.now());
}

// Orchestrator mode by hand for the shown tab's agent. An agent with helpers is in it
// regardless.
function toggleMode() {
  const o = shownOrchestrator();
  if (o) { if (manual(o.address)) setManual(o.address, false); return; }
  const a = tabAgent();
  if (a) setManual(a.address, true);
}

const isClaude = (k) => /claude/i.test([k?.agent, k?.program?.name, k?.status?.app].join(" "));

// Slash commands an orchestrator's session offers: Claude Code's built-ins and the
// skills its transcript lists. Other agents get none yet.
async function loadCommands(address) {
  const k = terminals().find((x) => x.address === address);
  if (!isClaude(k)) return { commands: [], note: "Slash commands are listed for Claude Code only" };
  const on = address.includes("/") ? address.split("/")[0] : null;
  const slug = (k.cwd ?? "").replace(/[^a-zA-Z0-9]/g, "-");
  const script = 'f="$2"; [ -n "$f" ] || f=$(ls -t "$HOME"/.claude*/projects/"$1"/*.jsonl 2>/dev/null | head -1); '
    + '[ -n "$f" ] || exit 3; grep -F \'"attachment":{"type":"skill_listing"\' "$f"';
  const r = await exec("sh", ["-c", script, "sh", slug, k.labels?.["claude.transcript"] ?? ""], { on }).catch(() => null);
  const about = new Map(), names = [];
  for (const line of (r?.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let a;
    try { a = JSON.parse(line).attachment; } catch { continue; }
    for (const l of (a.content ?? "").split("\n")) {
      const m = /^- ([^:\s]+(?::[^:\s]+)?): (.*)$/.exec(l);
      if (m) about.set(m[1], m[2]);
    }
    for (const n of a.names ?? []) if (!names.includes(n)) names.push(n);
  }
  const skills = names.map((name) => ({ name, about: about.get(name) ?? "" }));
  const taken = new Set(names);
  return {
    commands: [...skills, ...CLAUDE_BUILTINS.filter((c) => !taken.has(c.name))],
    note: names.length ? null : "This session's skills weren't found; restart it to record them",
  };
}

// The commands matching what follows "/", best first.
function matches(commands, query) {
  const q = query.toLowerCase();
  const score = (c) => {
    const n = c.name.toLowerCase(), short = n.split(":").pop();
    if (!q) return 1;
    if (n.startsWith(q) || short.startsWith(q)) return 3;
    if (n.includes(q)) return 2;
    return 0;
  };
  return commands.map((c) => [score(c), c]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || Number(Boolean(a[1].builtin)) - Number(Boolean(b[1].builtin)))
    .map(([, c]) => c);
}

// Vim keys for the draft box. TextareaState can't report its caret, so the panel keeps
// its own: an edit moves it by comparing the text before and after, and a click finds it
// by typing MARK and looking for it. Ranges handed to the state count UTF-8 bytes.
const MARK = "\u2063";
const utf8 = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const span = (s, start, end = start) => ({ start: utf8(s.slice(0, start)), end: utf8(s.slice(0, end)) });
const lineStart = (s, i) => (i <= 0 ? 0 : s.lastIndexOf("\n", i - 1) + 1);
const lineEnd = (s, i) => { const j = s.indexOf("\n", i); return j < 0 ? s.length : j; };
const firstChar = (s, i) => { let j = lineStart(s, i); while (j < lineEnd(s, i) && /[ \t]/.test(s[j])) j++; return j; };
// Normal mode's caret sits on a character, never past a line's last one.
const onChar = (s, i) => { const ls = lineStart(s, i), le = lineEnd(s, i); return le > ls ? Math.max(ls, Math.min(i, le - 1)) : ls; };
const kind = (ch) => (!ch || /\s/.test(ch) ? 0 : /\w/.test(ch) ? 1 : 2);
function wordNext(s, i) {
  const k = kind(s[i]);
  if (k) while (i < s.length && kind(s[i]) === k) i++;
  while (i < s.length && !kind(s[i])) i++;
  return i;
}
function wordPrev(s, i) {
  i--;
  while (i > 0 && !kind(s[i])) i--;
  const k = kind(s[i]);
  while (i > 0 && kind(s[i - 1]) === k) i--;
  return Math.max(i, 0);
}
function wordEnd(s, i) {
  i++;
  while (i < s.length && !kind(s[i])) i++;
  const k = kind(s[i]);
  while (i + 1 < s.length && kind(s[i + 1]) === k) i++;
  return Math.min(i, s.length);
}
// The line n lines below (or above, n < 0) i's, keeping the column.
function lineMove(s, i, n) {
  let ls = lineStart(s, i);
  const col = i - ls;
  for (; n > 0; n--) { const le = lineEnd(s, ls); if (le >= s.length) break; ls = le + 1; }
  for (; n < 0; n++) { if (ls === 0) break; ls = lineStart(s, ls - 1); }
  return Math.min(ls + col, lineEnd(s, ls));
}
// Where the caret went when a went to b, preferring an edit at the caret it had.
function caretAfter(a, b, at) {
  const d = b.length - a.length;
  if (at != null && at <= a.length) {
    if (d >= 0 && a.slice(0, at) === b.slice(0, at) && a.slice(at) === b.slice(at + d)) return at + d;
    if (d < 0 && at + d >= 0 && b === a.slice(0, at + d) + a.slice(at)) return at + d;
    if (d < 0 && b === a.slice(0, at) + a.slice(at - d)) return at;
  }
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return b.length - q;
}
const VIM_ALIASES = { x: "dl", X: "dh", D: "d$", C: "c$", s: "cl", S: "cc", Y: "yy" };

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
    this.role = ["panel", "tabs"].includes(props()?.role) ? props().role : "header";
    if (this.role === "panel") this.initPanel(cx);
    else if (this.role === "tabs") this.initTabs(cx);
    else this.hovered = false;
  }

  // Tab bar (mods/tabs/main.js, plus the Orchestrator button).

  initTabs(cx) {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    cx.timer.every(700, (cx) => { syncPanel(); cx.notify(); });
    const actions = {
      "panel-files": () => togglePanelChild("files"),
      "panel-changes": () => togglePanelChild("changes"),
      "panel-orchestrator": () => togglePanelChild(CHILD),
      "toggle-mode": toggleMode,
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
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
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
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    // Muted unless the shown tab's orchestrator has live helpers; then it glows: an
    // accent frame over a pulsing accent wash, and a pulsing dot.
    const o = shownOrchestrator(), live = Boolean(o?.helpers.length);
    const showing = panel && !panel.hidden && body?.active === CHILD;
    const orchestratorButton = h_flex().id(`panel-${CHILD}`).relative().h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).on_mouse_down("left", stop)
      .on_click((_e, cx) => { pressOrchestrator(); cx.notify(); })
      .when(!live, el => el.bg(showing ? t.selected : t.chrome).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.muted)))
      .when(live, el => el.bg(t.accent + (showing ? "38" : "26")).border_1().border_color(t.accent).text_color(t.accent)
        .font_semibold().shadow_md().hover(s => s.bg(t.accent + "4d"))
        .child(div().absolute().top(-4).left(-4).right(-4).bottom(-4).rounded(10).bg(t.accent).loop("opacity", { from: 0, to: 0.22, period: 1800 }))
        .child(div().absolute().inset_0().rounded(6).bg(t.accent).loop("opacity", { from: 0.06, to: 0.4, period: 1800 })))
      .child(svg("mods/workspace-chrome/layers.svg").size(14))
      .child("Orchestrator")
      .when(live, el => el.child(div().size(6).rounded(3).bg(t.accent).loop("opacity", { from: 0.35, to: 1, period: 1800 })));
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(orchestratorButton)
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }

  // Panel.

  initPanel(cx) {
    this.address = null; // the orchestrator the box is drafting to
    this.status = null;
    this.sending = false;
    this.commands = [];
    this.commandsNote = null;
    this.loadedAt = 0;
    this.pick = 0; // highlighted row of the slash menu
    this.menuScroll = VirtualListScrollHandle.new();
    // The Orchestrator panel's key asks for the box once the panel shows.
    cx.timer.every(150, () => {
      const ask = shared(`${MOD}.focus`);
      if (!ask || ask === this.focusAsk || !panelState()?.showing) return;
      this.focusAsk = ask;
      this.input.focus();
    });
    this.dismissed = null; // the draft and slash position the menu was closed on with Escape
    this.typing = false;
    this.vim = localStorage.getItem("vim") !== "off";
    this.mode = "insert";
    this.caret = 0; // where typing goes, as a string index; null when unknown
    this.last = ""; // the text the caret was last worked out against
    this.expected = null; // { text, caret } after an edit the panel made itself
    this.pending = ""; // a half-typed normal-mode command, like "d" or "g"
    this.count = "";
    this.register = { text: "", lines: false };
    this.undos = [];
    this.redos = [];
    this.unit = false; // whether this insert-mode stretch has its undo step
    this.input = TextareaState.new({ placeholder: "Message the orchestrator. Type / for commands and skills." });
    this.input.set_soft_wrap(true);
    this.input.on("change", (_e, cx) => {
      const text = this.input.value();
      if (text.includes(MARK)) return; // halfway through a probe
      // The textarea handles Enter and Tab before the panel's keys see them. With the
      // menu open, take the newline or tab back out and complete the pick instead.
      const c = this.caret, rows = this.expected ? null : this.menu(this.last, c);
      if (rows?.length && [`\n`, `\t`].some((k) => text === this.last.slice(0, c) + k + this.last.slice(c))) {
        this.expected = { text: this.last, caret: c };
        this.input.set_selected_range(span(text, c, c + 1));
        this.input.replace("");
        this.caret = c;
        this.choose(rows[Math.min(this.pick, rows.length - 1)], cx);
        return;
      }
      if (this.vim && this.mode === "insert" && !this.unit && this.expected?.text !== text) {
        // Typing in insert mode undoes as one step, back to where it began.
        this.undos.push({ text: this.last, caret: this.caret });
        this.redos = [];
        this.unit = true;
      }
      if (this.expected?.text === text) this.caret = this.expected.caret;
      else if (text !== this.last) this.caret = caretAfter(this.last, text, this.caret);
      this.expected = null;
      this.last = text;
      if (this.vim && this.mode === "normal") this.show();
      this.pick = 0; this.menuScroll.scroll_to_item(0); this.save(); cx.notify();
    });
    this.input.on("submit", (e, cx) => { if (e.secondary) this.send(cx); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
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

  // Follow the shown tab's orchestrator: swap in its draft and its commands.
  sync(cx) {
    const o = shownOrchestrator();
    const address = o?.address ?? null;
    if (address !== this.address) {
      this.save();
      this.address = address;
      this.status = null;
      this.commands = [];
      this.commandsNote = null;
      this.loadedAt = 0;
      this.undos = [];
      this.redos = [];
      const draft = this.drafts()[address] ?? "";
      if (address) { this.setText(draft, draft.length); this.moveTo(draft.length); }
      if (address && this.vim && this.mode === "normal") this.show();
      if (address) this.input.focus();
      cx.notify();
    }
    if (address && Date.now() - this.loadedAt > 60000) this.refreshCommands(cx);
  }

  refreshCommands(cx) {
    const address = this.address;
    this.loadedAt = Date.now();
    cx.spawn(async (cx) => {
      const r = await loadCommands(address);
      if (this.address !== address) return;
      this.commands = r.commands;
      this.commandsNote = r.note;
      cx.notify();
    });
  }

  // The "/" word the caret ends, wherever it is in the draft: { start, query }, else null.
  slash(text = this.input.value(), c = this.caret) {
    if (c == null || (this.vim && this.mode === "normal")) return null;
    const m = /(?:^|\s)\/([\w:.-]*)$/.exec(text.slice(0, c));
    if (!m || (text[c] ?? " ").trim()) return null;
    return { start: c - m[1].length - 1, query: m[1] };
  }

  // The slash menu's rows while the caret ends a "/" word, else null.
  menu(text = this.input.value(), c = this.caret) {
    const s = this.slash(text, c);
    if (!s || this.dismissed === `${s.start}:${text}`) return null;
    return matches(this.commands, s.query);
  }

  choose(c, cx) {
    const s = this.slash();
    if (!s) return;
    // Mid-text, the space already after the caret is the one after the name.
    const spaced = this.input.value()[this.caret] === " ";
    this.edit(s.start, this.caret, `/${c.name}${spaced ? "" : " "}`);
    if (spaced) this.moveTo(this.caret + 1);
    this.input.focus();
    this.save();
    cx.notify();
  }

  // Text editing the panel does itself, keeping its caret.

  setText(text, caret) {
    this.expected = { text, caret };
    this.last = text;
    this.caret = caret;
    this.input.set_value(text);
  }

  // Replaces [start, end) with str and leaves the caret at caret.
  edit(start, end, str, caret = start + str.length) {
    const text = this.input.value();
    this.expected = { text: text.slice(0, start) + str + text.slice(end), caret };
    this.input.set_selected_range(span(text, start, end));
    this.input.replace(str);
    this.caret = caret;
  }

  moveTo(c) {
    this.caret = c;
    this.input.set_selected_range(span(this.input.value(), c));
  }

  // Finds the caret by typing MARK over the selection, then puts the text back.
  probe() {
    const before = this.input.value();
    this.input.replace(MARK);
    const after = this.input.value();
    const i = after.indexOf(MARK);
    if (i < 0) return null;
    const picked = before.slice(i, i + before.length - after.length + 1);
    this.expected = { text: before, caret: picked ? null : i };
    this.input.set_selected_range(span(after, i, i + 1));
    this.input.replace(picked);
    if (picked) this.input.set_selected_range(span(before, i, i + picked.length));
    this.caret = picked ? null : i;
    return i;
  }

  // Normal mode shows its caret as the character under it, selected.
  show() {
    const s = this.input.value();
    const c = (this.caret = onChar(s, this.caret ?? s.length));
    this.input.set_selected_range(span(s, c, Math.min(c + 1, lineEnd(s, c))));
  }

  clicked(cx) {
    if (!this.vim) { this.caret = null; return; }
    const c = this.probe();
    if (this.mode === "normal") { this.caret = c; this.show(); }
    cx.notify();
  }

  toggleVim(cx) {
    this.vim = !this.vim;
    localStorage.setItem("vim", this.vim ? "on" : "off");
    if (!this.vim && this.mode === "normal") this.insert(this.caret, true);
    this.mode = "insert";
    this.input.focus();
    cx.notify();
  }

  snap() {
    const text = this.input.value();
    if (this.undos.at(-1)?.text !== text) this.undos.push({ text, caret: this.caret });
    if (this.undos.length > 200) this.undos.shift();
    this.redos = [];
  }

  undo(from, to) {
    const s = from.pop();
    if (!s) return;
    to.push({ text: this.input.value(), caret: this.caret });
    this.setText(s.text, s.caret);
    this.unit = false;
    if (this.mode === "normal") this.show(); else this.moveTo(s.caret ?? s.text.length);
  }

  insert(c, snapped) {
    if (!snapped) this.snap();
    this.mode = "insert";
    this.unit = true;
    this.moveTo(c);
  }

  normal() {
    if (this.caret == null) this.caret = this.probe();
    const s = this.input.value();
    let c = this.caret ?? s.length;
    if (c > lineStart(s, c)) c--;
    this.mode = "normal";
    this.unit = false;
    this.caret = c;
    this.show();
  }

  // Where a motion key takes the caret from c: { to, lines, inclusive }, else null.
  motion(s, c, key, n, op) {
    const ls = lineStart(s, c), le = lineEnd(s, c);
    const times = (f) => { let i = c; for (let k = 0; k < n; k++) i = f(s, i); return i; };
    switch (key) {
      case "h": return { to: Math.max(ls, c - n) };
      case "l": return { to: Math.min(c + n, le) };
      case "j": return { to: lineMove(s, c, n), lines: true };
      case "k": return { to: lineMove(s, c, -n), lines: true };
      case "w": return op === "c" ? { to: times(wordEnd), inclusive: true } : { to: op ? Math.min(times(wordNext), le) : times(wordNext) };
      case "b": return { to: times(wordPrev) };
      case "e": return { to: times(wordEnd), inclusive: true };
      case "0": return { to: ls };
      case "^": return { to: firstChar(s, c) };
      case "$": return { to: le };
      case "G": return { to: this.count ? lineMove(s, 0, n - 1) : lineStart(s, s.length), lines: true };
      case "gg": return { to: lineMove(s, 0, this.count ? n - 1 : 0), lines: true };
    }
    return null;
  }

  // A normal-mode key. Returns false for one that should reach the textarea.
  normalKey(e, cx) {
    const k = e.keystroke;
    if (k === "escape" || k === "ctrl-[") { this.pending = this.count = ""; return true; }
    if (k === "enter") { this.send(cx); return true; }
    if (k === "ctrl-r") { this.undo(this.redos, this.undos); return true; }
    if (k === "cmd-v") { const s = this.input.value(); this.moveTo(Math.min(this.caret + 1, lineEnd(s, this.caret))); return false; }
    if (/(cmd|alt)-/.test(k)) return false;
    const arrows = { left: "h", right: "l", up: "k", down: "j", backspace: "h", home: "0", end: "$" };
    const ch = arrows[k] ?? (k.startsWith("ctrl-") ? null : e.key_char);
    if (!ch) return true;
    const s = this.input.value(), c = this.caret;
    if (this.pending === "r") {
      this.pending = "";
      if (c < lineEnd(s, c)) { this.snap(); this.edit(c, c + 1, ch, c); }
      this.show();
      return true;
    }
    if (/[1-9]/.test(ch) || (ch === "0" && this.count)) { this.count += ch; return true; }
    const keys = this.pending + (this.pending ? ch : VIM_ALIASES[ch] ?? ch);
    const op = /^[dcy]/.test(keys) ? keys[0] : null;
    const rest = op ? keys.slice(1) : keys;
    if (rest === "g" || (!op && rest === "r") || (op && !rest)) { this.pending = keys; return true; }
    const n = Math.max(1, Number(this.count) || 1);
    const m = this.motion(s, c, rest, n, op);
    this.pending = "";
    this.count = "";
    if (op) {
      let a, b, lines = rest === op || m?.lines;
      if (rest === op) { a = c; b = lineMove(s, c, n - 1); } else if (m) { a = Math.min(c, m.to); b = Math.max(c, m.to) + (m.inclusive ? 1 : 0); } else return true;
      if (lines) {
        a = lineStart(s, Math.min(a, b));
        b = lineEnd(s, Math.max(a, b));
        this.register = { text: s.slice(a, b), lines: true };
        if (op === "c") { this.snap(); this.edit(a, b, ""); this.insert(a, true); return true; }
        if (b < s.length) b++; else if (a > 0) a--;
      } else {
        b = Math.min(b, s.length);
        this.register = { text: s.slice(a, b), lines: false };
      }
      if (op === "y") { this.caret = Math.min(c, m?.to ?? c); this.show(); return true; }
      if (a < b) { this.snap(); this.edit(a, b, ""); }
      const t = this.input.value();
      if (op === "c") this.insert(a, true); else { this.caret = lines ? firstChar(t, Math.min(a, t.length)) : a; this.show(); }
      return true;
    }
    if (m) { this.caret = m.lines && (rest === "G" || rest === "gg") ? firstChar(s, m.to) : m.to; this.show(); return true; }
    const ls = lineStart(s, c), le = lineEnd(s, c), r = this.register;
    switch (rest) {
      case "i": this.insert(c); break;
      case "a": this.insert(Math.min(c + 1, le)); break;
      case "I": this.insert(firstChar(s, c)); break;
      case "A": this.insert(le); break;
      case "o": this.snap(); this.edit(le, le, "\n"); this.insert(le + 1, true); break;
      case "O": this.snap(); this.edit(ls, ls, "\n", ls); this.insert(ls, true); break;
      case "p": case "P":
        if (!r.text) break;
        this.snap();
        if (r.lines && rest === "p") this.edit(le, le, "\n" + r.text, le + 1);
        else if (r.lines) this.edit(ls, ls, r.text + "\n", ls);
        else { const at = rest === "p" ? Math.min(c + 1, le) : c; this.edit(at, at, r.text, at + r.text.length - 1); }
        this.show();
        break;
      case "u": this.undo(this.undos, this.redos); break;
    }
    return true;
  }

  onKey(e, cx) {
    const k = e.keystroke;
    if (this.vim && (k === "cmd-z" || k === "cmd-shift-z")) {
      // Vim keeps its own history; the textarea's has the caret probes in it.
      if (k === "cmd-z") this.undo(this.undos, this.redos); else this.undo(this.redos, this.undos);
      cx.stop_propagation(); cx.notify(); return;
    }
    if (this.vim && this.mode === "normal") {
      if (this.normalKey(e, cx)) cx.stop_propagation();
      cx.notify();
      return;
    }
    const rows = this.menu();
    if (rows && k === "escape") { this.dismissed = `${this.slash().start}:${this.input.value()}`; cx.stop_propagation(); cx.notify(); return; }
    if (this.vim && (k === "escape" || k === "ctrl-[")) { this.normal(); cx.stop_propagation(); cx.notify(); return; }
    if (!rows?.length) {
      // Typing is followed through change events; arrows and the like move the caret unseen.
      if (this.caret != null && k === "left") this.caret = Math.max(0, this.caret - 1);
      else if (this.caret != null && k === "right") this.caret = Math.min(this.input.value().length, this.caret + 1);
      else if (/(^|-)(up|down|left|right|home|end|pageup|pagedown)$/.test(k) || k === "cmd-a") this.caret = null;
      return;
    }
    if (!rows.length) return;
    if (e.keystroke === "down" || e.keystroke === "ctrl-n") this.pick = (this.pick + 1) % rows.length;
    else if (e.keystroke === "up" || e.keystroke === "ctrl-p") this.pick = (this.pick - 1 + rows.length) % rows.length;
    else if (e.keystroke === "pagedown") this.pick = Math.min(this.pick + 8, rows.length - 1);
    else if (e.keystroke === "pageup") this.pick = Math.max(this.pick - 8, 0);
    else if (e.keystroke === "tab" || e.keystroke === "enter") { this.choose(rows[Math.min(this.pick, rows.length - 1)], cx); cx.stop_propagation(); return; }
    else return;
    this.menuScroll.scroll_to_item(this.pick, "center");
    cx.stop_propagation();
    cx.notify();
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
        if (this.address === address) this.setText("", 0);
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

  menuRows(t, rows) {
    const pick = Math.min(this.pick, rows.length - 1);
    // Rows are drawn during layout, where handlers aren't allowed: clicks go through
    // the list's on_item_click. A virtual list takes its width from a row, so rows get
    // the box's measured width.
    const row = (c, i) => h_flex().w(this.menuWidth ?? 300).h(28).flex_none().px(8).gap(8).items_center().rounded(7)
      .cursor_pointer().when(i === pick, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .child(div().flex_none().max_w(170).truncate().font_medium().text_color(t.foreground).child(`/${c.name}`))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(c.about));
    // Every match, in a scrolling list up to ten rows tall.
    return v_flex().id("om-menu").flex_none().p(6).border_t(1).border_color(t.border)
      .when(rows.length > 0, (el) => el.child(div().id("om-menu-box").relative().w_full().h(Math.min(rows.length, 10) * 28)
        .on_size_change((size, cx) => { if (size.width !== this.menuWidth) { this.menuWidth = size.width; cx.notify(); } })
        .child(v_virtual_list("om-menu-list", rows.length, 28, (i) => rows[i].name,
          (range) => rows.slice(range.start, range.end).map((c, j) => row(c, range.start + j)))
          .track_scroll(this.menuScroll).size_full()
          .on_item_click((name, cx) => { const c = rows.find((r) => r.name === name); if (c) this.choose(c, cx); }))
        .child(Scrollbar.vertical("om-menu-list").viewport_from_layout().absolute().inset_0())))
      .when(rows.length > 0, (el) => el.child(div().px(8).pt(4).text_size(11).text_color(t.dim)
        .child(`${rows.length} ${rows.length === 1 ? "command" : "commands"}`)))
      .when(!rows.length, (el) => el.child(div().p(8).text_size(12).text_color(t.dim)
        .child(this.commands.length ? "No matching commands" : this.commandsNote ?? "Loading commands…")))
      .when(rows.length > 0 && Boolean(this.commandsNote), (el) => el.child(div().px(8).pt(4).text_size(11).text_color(t.dim).child(this.commandsNote)));
  }

  renderPanel(t) {
    const o = this.address ? agents().find((a) => a.address === this.address) : null;
    const card = v_flex().id("orchestrator").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13);
    const head = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg("mods/workspace-chrome/layers.svg").size(14).flex_none().text_color(t.accent))
      .child(div().font_semibold().child("Orchestrator"));
    if (!o) return card.child(head).child(div().p(14).text_size(12).text_color(t.dim).child("No orchestrator in this tab. ⌥⌘O turns orchestrator mode on for its agent."));
    const helpers = helpersOf(o.address);
    const working = helpers.filter((k) => k.status === "working").length;
    const empty = !this.input.value().trim();
    const rows = this.menu();
    const normal = this.vim && this.mode === "normal";
    const hint = rows ? "↑↓ pick · ⇥ complete · esc close"
      : normal ? `NORMAL${this.count || this.pending ? ` ${this.count}${this.pending}` : ""} · i insert · ↵ send`
      : this.vim ? "INSERT · esc normal · ⌘↵ send" : "⌘↵ send";
    const statusColor = { ok: t.done, error: t.blocked, info: t.dim }[this.status?.level] ?? t.dim;
    return card
      .on_key_down((e, cx) => this.onKey(e, cx))
      .child(head
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10)
          .text_color(working ? t.working : t.muted).child(working ? `${working}/${helpers.length} working` : plural(helpers.length, "helper")))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(o.title || o.address))
        .when(manual(o.address), (el) => el.child(div().id("om-leave").flex_none().px(6).h(20).flex().items_center().rounded(5)
          .text_size(11).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); setManual(o.address, false); }).child("Leave"))))
      .child(div().id("om-draft").flex_1().min_h(80).p(10).cursor_text()
        .on_mouse_up("left", (_e, cx) => this.clicked(cx))
        .child(Textarea.new(this.input).size_full().p(8).rounded(8).border_1()
          .border_color(!this.typing ? t.border : normal ? t.working : t.accent)
          .bg(t.background).text_color(t.foreground).text_size(13)))
      .when(Boolean(rows), (el) => el.child(this.menuRows(t, rows)))
      .child(h_flex().flex_none().p(10).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(statusColor)
          .child(this.status?.text ?? hint))
        .child(div().id("om-vim").flex_none().px(6).h(20).flex().items_center().rounded(5).border_1().border_color(t.border)
          .text_size(11).text_color(this.vim ? t.foreground : t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggleVim(cx); }).child("vim"))
        .child(div().id("om-send").h(32).px(14).flex().items_center().rounded(8).text_size(12)
          .bg(empty ? t.raised : t.solid).text_color(empty ? t.dim : t.solid_foreground)
          .when(!empty, (el) => el.cursor_pointer())
          .on_click((_e, cx) => this.send(cx))
          .child(this.sending ? "Sending…" : "Send")));
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

  // Clicking it opens or closes the Orchestrator panel.
  badge(t, helpers) {
    const working = helpers.filter((k) => k.status === "working").length;
    return h_flex().id("om-badge").flex_none().h(20).px(7).gap(5).items_center().rounded(6)
      .bg(t.accent + "1f").border_1().border_color(t.accent + "40").text_color(t.accent)
      .text_size(10.5).font_semibold().cursor_pointer()
      .on_click((_e, cx) => { cx.stop_propagation(); togglePanel(); })
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
    const on = Boolean(p.terminal) && (helpers.length > 0 || manual(p.terminal));
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
      .when(on, (el) => el.child(this.badge(t, helpers)))
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
    if (this.role === "tabs") return this.renderTabs(t);
    return this.role === "panel" ? this.renderPanel(t) : this.renderHeader(t);
  }
}
