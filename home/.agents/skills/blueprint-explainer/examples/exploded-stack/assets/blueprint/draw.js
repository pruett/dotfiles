/* blueprint-explainer — SVG builders for isometric parts, leaders, guides, dimensions.
   Plain JS, no dependencies. Load before motion.js. Exposes window.BP.
   All output is deterministic: same inputs → same SVG. Build at load, before the timeline. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const C = Math.cos(Math.PI / 6); // 0.866: isometric x-scale
  const S = 0.5;                   // sin 30°: isometric y-scale

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Isometric projection. World units are px; x runs down-right, y runs down-left, z is up.
     origin = screen point of world (0,0,0). */
  function iso(ox, oy) {
    return (x, y, z) => [ox + (x - y) * C, oy + (x + y) * S - z];
  }
  const pts = (P, list) => list.map(([x, y, z]) => P(x, y, z).map((v) => v.toFixed(1)).join(",")).join(" ");

  /* A box (slab) drawn as its three visible faces: top, front-left (y = d) and front-right (x = w).
     opts: { P, x, y, z, w, d, h, fill: "face"|"tint"|"accent"|"signal", topFill?, id? } */
  function slab(parent, o) {
    const { P, x = 0, y = 0, z = 0, w, d, h } = o;
    const g = el("g", o.id ? { id: o.id } : {}, parent);
    const f = o.fill || "face";
    const X0 = x, X1 = x + w, Y0 = y, Y1 = y + d, Z0 = z, Z1 = z + h;
    if (h > 0) {
      el("polygon", { class: `bp-face side ${f}`, points: pts(P, [[X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1]]) }, g);
      el("polygon", { class: `bp-face side ${f}`, points: pts(P, [[X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X1, Y0, Z1]]) }, g);
    }
    el("polygon", { class: `bp-face ${o.topFill || f}`, points: pts(P, [[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]]) }, g);
    g.topCenter = P(x + w / 2, y + d / 2, z + h);
    g.corners = { back: P(X0, Y0, Z1), right: P(X1, Y0, Z1), front: P(X1, Y1, Z1), left: P(X0, Y1, Z1),
                  backLow: P(X0, Y0, Z0), rightLow: P(X1, Y0, Z0), frontLow: P(X1, Y1, Z0), leftLow: P(X0, Y1, Z0) };
    return g;
  }

  /* A tray: floor slab plus four low walls (an open box). Walls are thin slabs. */
  function tray(parent, o) {
    const { P, x = 0, y = 0, z = 0, w, d, h, t = 10, wall = 26 } = o;
    const g = el("g", o.id ? { id: o.id } : {}, parent);
    slab(g, { P, x, y, z, w, d, h, fill: o.fill });
    slab(g, { P, x, y, z: z + h, w, d: t, h: wall, fill: o.fill });          // back wall
    slab(g, { P, x, y, z: z + h, w: t, d, h: wall, fill: o.fill });          // left wall
    slab(g, { P, x: x + w - t, y, z: z + h, w: t, d, h: wall, fill: o.fill });// right wall
    slab(g, { P, x, y: y + d - t, z: z + h, w, d: t, h: wall, fill: o.fill });// front wall
    g.corners = { back: P(x, y, z + h + wall), right: P(x + w, y, z + h + wall), front: P(x + w, y + d, z + h + wall), left: P(x, y + d, z + h + wall),
                  backLow: P(x, y, z), rightLow: P(x + w, y, z), frontLow: P(x + w, y + d, z), leftLow: P(x, y + d, z) };
    return g;
  }

  /* Callout: horizontal leader from a label to a point on the part, arrowhead on the part.
     opts: { at:[x,y] point on part, labelX: x where the label text sits, text, id? }
     Label left of the part → text right-aligned ending 16px before the line; right of part → mirrored. */
  function leader(parent, o) {
    const [px, py] = o.at;
    const left = o.labelX < px;
    // Callouts ride with their layer, so collapsed layers stack their (hidden) labels: allow that overlap.
    const g = el("g", { class: "bp-callout", "data-layout-allow-overlap": "", ...(o.id ? { id: o.id } : {}) }, parent);
    const lineStart = left ? o.labelX + 16 : o.labelX - 16;
    const tip = left ? px - 2 : px + 2;
    const line = el("path", { class: "bp-leader", d: `M${lineStart},${py} L${tip},${py}` }, g);
    const dir = left ? 1 : -1; // arrow points toward the part
    el("polygon", { class: "bp-arrow", points: `${tip},${py} ${tip - dir * 10},${py - 4} ${tip - dir * 10},${py + 4}` }, g);
    const t = el("text", { class: "bp-label", x: o.labelX, y: py, "text-anchor": left ? "end" : "start", "dominant-baseline": "central" }, g);
    t.textContent = o.text;
    g.line = line; g.text = t;
    return g;
  }

  /* Dashed construction guide between two screen points. */
  function guide(parent, a, b, id) {
    return el("path", { class: "bp-guide", d: `M${a[0]},${a[1]} L${b[0]},${b[1]}`, ...(id ? { id } : {}) }, parent);
  }

  /* Dimension line parallel to segment a→b, pushed out by `offset` px along the normal.
     End ticks are short perpendicular strokes; the value sits centered, rotated with the line. */
  function dimension(parent, o) {
    const [ax, ay] = o.a, [bx, by] = o.b;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const nx = -uy * (o.offset || 40), ny = ux * (o.offset || 40);
    const A = [ax + nx, ay + ny], B = [bx + nx, by + ny];
    const g = el("g", { class: "bp-dimension", ...(o.id ? { id: o.id } : {}) }, parent);
    const ext = 12, tn = [-uy, ux];
    el("path", { class: "bp-guide", d: `M${ax},${ay} L${A[0] + tn[0] * ext},${A[1] + tn[1] * ext} M${bx},${by} L${B[0] + tn[0] * ext},${B[1] + tn[1] * ext}` }, g);
    g.line = el("path", { class: "bp-leader", d: `M${A[0]},${A[1]} L${B[0]},${B[1]}` }, g);
    for (const [px, py] of [A, B]) el("path", { class: "bp-leader", d: `M${px - tn[0] * 9 + ux * 9},${py - tn[1] * 9 + uy * 9} L${px + tn[0] * 9 - ux * 9},${py + tn[1] * 9 - uy * 9}` }, g);
    const mx = (A[0] + B[0]) / 2 + tn[0] * 22, my = (A[1] + B[1]) / 2 + tn[1] * 22;
    const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    const t = el("text", { class: "bp-label", x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "central", transform: `rotate(${ang.toFixed(2)} ${mx.toFixed(1)} ${my.toFixed(1)})` }, g);
    t.textContent = o.text;
    g.text = t;
    return g;
  }

  window.BP = Object.assign(window.BP || {}, { el, iso, slab, tray, leader, guide, dimension });
})();
