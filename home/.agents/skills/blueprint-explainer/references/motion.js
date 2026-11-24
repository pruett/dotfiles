/* blueprint-explainer — GSAP motion helpers. Needs gsap (local) and draw.js.
   Every helper takes the scene's paused root timeline `tl` and an absolute time `at` (seconds),
   adds tweens, and returns the time its motion ends. Nothing here reads the clock or random numbers. */
(function () {
  const BP = (window.BP = window.BP || {});
  const list = (t) =>
    typeof t === "string" ? Array.from(document.querySelectorAll(t))
    : t && typeof t.length === "number" && !(t instanceof Element) ? Array.from(t)
    : [t];

  /* Measured from the reference explode/collapse (evidence/style/frames/ease_fit.txt):
     slow 0.1 s lift-off, fast middle, long settle. Same curve both directions. */
  BP.ease = {
    explode: (t) => Math.pow(1 - Math.pow(1 - t, 3.1), 1.8),
  };

  /* Stroke draw-on: solid strokes trace from their start. Fills (if any) fade in from 55% of the trace. */
  BP.drawOn = function (tl, targets, at, o = {}) {
    const dur = o.dur ?? 0.9, stagger = o.stagger ?? 0.03, ease = o.ease ?? "power2.inOut";
    const els = list(targets);
    els.forEach((el, i) => {
      const len = Math.ceil(el.getTotalLength ? el.getTotalLength() : 1000) + 2;
      const fillOpacity = getComputedStyle(el).fill === "none" ? null : 1;
      gsap.set(el, { attr: { "stroke-dasharray": `${len} ${len}` }, strokeDashoffset: len, ...(fillOpacity ? { fillOpacity: 0 } : {}) });
      tl.to(el, { strokeDashoffset: 0, duration: dur, ease }, at + i * stagger);
      if (fillOpacity) tl.to(el, { fillOpacity: 1, duration: dur * 0.5, ease: "power1.out" }, at + i * stagger + dur * 0.55);
    });
    return at + (els.length - 1) * stagger + dur;
  };

  /* Dashed guide draw-on without the dashes crawling: a solid masked copy traces, the dashes stay put. */
  BP.drawGuide = function (tl, targets, at, o = {}) {
    const dur = o.dur ?? 0.6, stagger = o.stagger ?? 0.05;
    const els = list(targets);
    els.forEach((el, i) => {
      const svg = el.ownerSVGElement;
      let defs = svg.querySelector("defs") || BP.el("defs", {}, null);
      if (!defs.parentNode) svg.insertBefore(defs, svg.firstChild);
      const id = `bpmask-${el.id || "g"}-${i}-${Math.round(at * 1000)}`;
      const mask = BP.el("mask", { id, maskUnits: "userSpaceOnUse", x: -200, y: -200, width: 2320, height: 1480 }, defs);
      const m = BP.el("path", { d: el.getAttribute("d"), stroke: "#fff", "stroke-width": 8, fill: "none" }, mask);
      // The mask path must share the guide's transform context; guides live in the same group as their parts.
      el.setAttribute("mask", `url(#${id})`);
      const len = Math.ceil(el.getTotalLength()) + 2;
      gsap.set(m, { attr: { "stroke-dasharray": `${len} ${len}` }, strokeDashoffset: len });
      tl.to(m, { strokeDashoffset: 0, duration: dur, ease: "power2.out" }, at + i * stagger);
    });
    return at + (els.length - 1) * stagger + dur;
  };

  /* Explode: each layer rises straight up the screen by its own lift (px). Base layer lift = 0.
     layers: [{ el, lift }]. Labels and leaders inside a layer's <g> ride with it. */
  BP.explode = function (tl, layers, at, o = {}) {
    const dur = o.dur ?? 1.6;
    layers.forEach(({ el, lift }) => tl.to(el, { y: -lift, duration: dur, ease: BP.ease.explode }, at));
    return at + dur;
  };
  BP.collapse = function (tl, layers, at, o = {}) {
    const dur = o.dur ?? 1.55;
    layers.forEach(({ el }) => tl.to(el, { y: 0, duration: dur, ease: BP.ease.explode }, at));
    return at + dur;
  };

  /* Callouts in: leader traces from the label toward the part (0.3 s), text fades in (0.2 s), 0.06 s apart. */
  BP.calloutsIn = function (tl, callouts, at, o = {}) {
    const stagger = o.stagger ?? 0.06;
    list(callouts).forEach((g, i) => {
      const t = at + i * stagger;
      const line = g.querySelector(".bp-leader"), arrow = g.querySelector(".bp-arrow"), text = g.querySelector("text");
      const len = Math.ceil(line.getTotalLength()) + 2;
      gsap.set(line, { attr: { "stroke-dasharray": `${len} ${len}` }, strokeDashoffset: len });
      gsap.set([arrow, text], { opacity: 0 });
      tl.to(line, { strokeDashoffset: 0, duration: 0.3, ease: "power2.out" }, t);
      tl.to(arrow, { opacity: 1, duration: 0.08 }, t + 0.24);
      tl.to(text, { opacity: 1, duration: 0.2, ease: "power1.out" }, t + 0.1);
    });
    return at + (list(callouts).length - 1) * stagger + 0.32;
  };
  /* Callouts out: all at once, 0.15 s, as the collapse starts (measured). */
  BP.calloutsOut = function (tl, callouts, at) {
    tl.to(list(callouts), { opacity: 0, duration: 0.15, ease: "power1.in" }, at);
    return at + 0.15;
  };

  /* Counter: integer ticks from → to, text set from tween progress (render-safe at any seek). */
  BP.counter = function (tl, target, from, to, at, o = {}) {
    const el = list(target)[0], dur = o.dur ?? 1.2, pad = o.pad ?? 0, prefix = o.prefix ?? "", suffix = o.suffix ?? "", dec = o.decimals ?? 0;
    const fmt = (v) => prefix + v.toFixed(dec).padStart(pad, "0") + suffix;
    const p = { v: from };
    // Only the earliest counter on an element sets its resting text (add counters in time order).
    if (!el.dataset.bpCounter) { el.textContent = fmt(from); el.dataset.bpCounter = "1"; }
    tl.to(p, { v: to, duration: dur, ease: o.ease ?? "power2.out", onUpdate: () => (el.textContent = fmt(p.v)) }, at);
    return at + dur;
  };

  /* Type-on for mono text: characters appear one by one, `cps` per second. No cursor. */
  BP.typeOn = function (tl, target, at, o = {}) {
    const el = list(target)[0], full = el.textContent, cps = o.cps ?? 40;
    const p = { n: 0 };
    el.textContent = "";
    tl.to(p, { n: full.length, duration: full.length / cps, ease: "none", onUpdate: () => (el.textContent = full.slice(0, Math.round(p.n))) }, at);
    return at + full.length / cps;
  };

  /* Bars grow from their baseline (SVG rects): height and y tween together. */
  BP.barsGrow = function (tl, rects, at, o = {}) {
    const dur = o.dur ?? 0.7, stagger = o.stagger ?? 0.06;
    list(rects).forEach((r, i) => {
      const h = +r.getAttribute("height"), y = +r.getAttribute("y");
      gsap.set(r, { attr: { height: 0, y: y + h } });
      tl.to(r, { attr: { height: h, y }, duration: dur, ease: "expo.out" }, at + i * stagger);
    });
    return at + (list(rects).length - 1) * stagger + dur;
  };

  /* Camera: move a stage wrapper (never the clip). Both-ways ease; use 1.2–2.0 s. */
  BP.camera = function (tl, stage, to, at, o = {}) {
    const dur = o.dur ?? 1.6;
    tl.to(stage, { ...to, duration: dur, ease: o.ease ?? "power2.inOut", transformOrigin: o.origin ?? "50% 50%" }, at);
    return at + dur;
  };
})();
