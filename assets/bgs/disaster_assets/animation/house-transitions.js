/* house-transitions.js — disaster and repair transitions for the house close-up.
 *
 * Draws onto a 1600x1000 canvas using the same layout as the backgrounds: the house sprite is centred at 94% of
 * the stage height. Plain script, no dependencies: load it with a classic script tag (src="house-transitions.js")
 * and it defines window.HouseTransitions.
 *
 *   const ht = new HouseTransitions(canvas, {
 *     region: "coastal" | "riverside" | "hillysides",
 *     bgNormal, bgPost, fgPost,          // Image objects (fgPost may be null for hillside houses)
 *     sprite, damaged: { 1: img, 2: img }, // clean sprite and the two damage levels
 *     repairIcon,                       // optional Image, bounces over the house while repairing
 *     slipPath                          // landslip only: [[x,y], ...] ground surface the mud follows (stage px)
 *   });
 *   await ht.play("flood",    { from: 0, to: 1 });   // or "landslip"; ends on damage level `to`
 *   await ht.play("repair",   { from: 1 });          // ends on the clean house
 *   ht.drawStatic(level);                             // still frame for level 0, 1 or 2
 *   ht.frame(type, t, from, to);                      // draw one frame, t from 0 to 1 (for testing / recording)
 *
 * Dynamic backgrounds (clouds drifting, cars driving past, a boat on the bay, light rain after a disaster):
 *   new HouseTransitions(canvas, { ...same as above,
 *     bgNormalBase, bgPostBase,          // backgrounds without clouds / cars / rain
 *     layers: { normal: { sky, far, near }, post: { sky, far, near } },   // optional depth layers (null where empty):
 *                                        //   clouds and birds go between sky and far, boats / wave glints / valley cars
 *                                        //   between far and near, so trees and hills correctly hide them
 *     clouds: [img...], stormClouds: [img...], cars: [img...], boat   // pieces from backgrounds/ambient/
 *   }, { ambient: true, seed: 3 });
 *   ht.start();                        // keeps drawing; play() then runs inside the same loop
 *   ht.setLevel(level); ht.stop();
 */
(function (global) {
  "use strict";
  const W = 1600, H = 1000;
  const SH = H * 0.94, SW = SH * 4 / 3;
  const SPR = { x: (W - SW) / 2, y: (H - SH) / 2, w: SW, h: SH };
  const INK = "#4F463D";
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const pulse = (t, at, width) => clamp(1 - Math.abs(t - at) / width);
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

  const DURATION = { flood: 3600, landslip: 3400, repair: 2600 };
  // Every ambient motion repeats exactly every LOOP ms (clouds, cars, boats, birds, waves, rain),
  // so the live scene never jumps and any recording of LOOP ms loops seamlessly.
  const LOOP = 40000, TAU = Math.PI * 2;
  const cyc = (ms, period) => (((ms % period) + period) % period) / period;
  const ROADS = { hillysides: [[720, 742], [1100, 728], [1680, 746]] };   // valley road (quadratic curve) in the hillside scenes

  class HouseTransitions {
    constructor(canvas, assets, options = {}) {
      this.c = canvas; this.ctx = canvas.getContext("2d"); this.a = assets;
      canvas.width = W; canvas.height = H;
      this.reduced = options.reducedMotion ?? (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const r = rng(11);
      this.drops = Array.from({ length: 230 }, () => {
        const v = 1.2 + r() * 0.9;                                  // px per ms, rounded so each drop cycles a whole number of times per LOOP
        return { x: r() * W * 1.25 - 150, y: r() * H, l: 24 + r() * 28, v: Math.max(1, Math.round(v * LOOP / (H + 80))) * (H + 80) / LOOP };
      });
      this.debris = Array.from({ length: 7 }, (_, i) => ({ x: 90 + i * 230 + r() * 80, w: 60 + r() * 70, ph: r() * 6.3, rot: (r() - 0.5) * 0.5 }));
      this.rocks = Array.from({ length: 16 }, () => ({ d: r(), s: 7 + r() * 12, ph: r() * 6.3, off: (r() - 0.5) * 110 }));
      this.puffs = Array.from({ length: 26 }, () => ({ x: r(), y: r(), r: 50 + r() * 80, k: r() }));
      this.sparks = Array.from({ length: 18 }, () => ({ x: SPR.x + 160 + r() * (SPR.w - 320), y: SPR.y + 120 + r() * (SPR.h - 320), t0: r() }));
      this.raf = 0;
      this.level = options.level || 0;
      this.ambient = !!(options.ambient && assets.bgNormalBase && assets.bgPostBase);
      const r2 = rng(options.seed || 1);
      this.cloudY = [40 + r2() * 50, 140 + r2() * 70, 240 + r2() * 60];   // 3-cloud pattern, used twice across the sky
      this.cloudJit = r2();
      this.stormY = [10 + r2() * 50, 110 + r2() * 70, 220 + r2() * 70];
      this.birdY = 130 + r2() * 110;
      this.anim = null; this.running = false;
    }

    static get DURATION() { return DURATION; }
    static get LOOP() { return LOOP; }
    get layout() { return { stage: { w: W, h: H }, sprite: { ...SPR } }; }

    dmg(level) { return level > 0 ? (this.a.damaged[level] || this.a.damaged[2] || this.a.sprite) : this.a.sprite; }

    /* ---------- building blocks ---------- */
    bg(mix) {
      const g = this.ctx;
      g.globalAlpha = 1; g.drawImage(this.a.bgNormal, 0, 0, W, H);
      if (mix > 0) { g.globalAlpha = mix; g.drawImage(this.a.bgPost, 0, 0, W, H); g.globalAlpha = 1; }
    }
    /* background: static images, or (ambient) base layers + drifting clouds, birds, boats, waves and distant traffic */
    /* draw the per-pixel blend of two layer images (either may be null = empty); exact even for transparent layers */
    mixImages(n, p, mix, transparent) {
      const g = this.ctx;
      if (mix <= 0 || (!p && !transparent)) { if (n) g.drawImage(n, 0, 0, W, H); return; }
      if (mix >= 1) { if (p) g.drawImage(p, 0, 0, W, H); return; }
      if (!transparent) { if (n) g.drawImage(n, 0, 0, W, H); if (p) { g.globalAlpha = mix; g.drawImage(p, 0, 0, W, H); g.globalAlpha = 1; } return; }
      if (!this.off) { this.off = document.createElement("canvas"); this.off.width = W; this.off.height = H; }
      const o = this.off.getContext("2d");
      o.globalCompositeOperation = "source-over"; o.globalAlpha = 1; o.clearRect(0, 0, W, H);
      if (n) { o.drawImage(n, 0, 0, W, H); o.globalCompositeOperation = "destination-out"; o.fillStyle = `rgba(0,0,0,${mix})`; o.fillRect(0, 0, W, H); }
      if (p) { o.globalCompositeOperation = "lighter"; o.globalAlpha = mix; o.drawImage(p, 0, 0, W, H); }
      o.globalCompositeOperation = "source-over"; o.globalAlpha = 1;
      g.drawImage(this.off, 0, 0);
    }
    layer(name, mix) {
      const L = this.a.layers;
      if (L) this.mixImages(L.normal && L.normal[name], L.post && L.post[name], mix, true);
    }
    scenery(mix, ams) {
      if (!this.ambient) { this.bg(mix); return; }
      const g = this.ctx, A = this.a, calm = 1 - mix, region = A.region, layered = !!A.layers;
      // full scene underneath: on its own when there are no depth layers, and as a backstop during crossfades
      if (!layered || (mix > 0 && mix < 1)) this.mixImages(A.bgNormalBase, A.bgPostBase, mix, false);
      if (layered) this.layer("sky", mix);
      if (calm > 0 && A.clouds && A.clouds.length) {               // 6 clouds; moving half the sky per loop lands each on its twin
        const wmax = Math.max(...A.clouds.map(c => c.width)), span = W + wmax + 200;
        g.globalAlpha = calm;
        for (let i = 0; i < 6; i++) {
          const x = ((i / 6 + this.cloudJit / 6 + cyc(ams, LOOP) * 0.5) % 1) * span - wmax - 100;
          g.drawImage(A.clouds[(i % 3) % A.clouds.length], x, this.cloudY[i % 3]);
        }
      }
      if (mix > 0 && A.stormClouds && A.stormClouds.length) {        // 9 storm clouds, faster
        const wmax = Math.max(...A.stormClouds.map(c => c.width)), span = W + wmax + 200;
        g.globalAlpha = mix;
        for (let i = 0; i < 9; i++) {
          const x = ((i / 9 + cyc(ams, LOOP) * (2 / 3)) % 1) * span - wmax - 100;
          g.drawImage(A.stormClouds[(i % 3) % A.stormClouds.length], x, this.stormY[i % 3] + (i % 2) * 18);
        }
      }
      g.globalAlpha = 1;
      if (calm > 0) this.birds(calm, ams, region === "coastal");
      if (layered) this.layer("far", mix);                           // terrain in front of the sky
      if (region === "coastal" && calm > 0) this.bay(calm, ams);
      if (region === "hillysides" && calm > 0) this.valleyTraffic(calm, ams);
      if (layered) this.layer("near", mix);                          // beach, trees, the hill: in front of boats and valley cars
    }
    birds(alpha, ams, gulls) {
      const g = this.ctx, bx = -160 + (W + 320) * cyc(ams, LOOP / 2), by = this.birdY + Math.sin(TAU * cyc(ams, LOOP / 2)) * 12;
      g.save(); g.globalAlpha = alpha; g.lineCap = "round"; g.lineJoin = "round";
      [[0, 0], [-38, 14], [-70, -8], [-104, 20]].forEach(([dx, dy], i) => {
        const flap = Math.sin(TAU * cyc(ams + i * 140, 625)) * 7, x = bx + dx, y = by + dy;
        g.beginPath(); g.moveTo(x - 14, y - 2 + flap); g.quadraticCurveTo(x - 7, y - 9 + flap, x, y);
        g.quadraticCurveTo(x + 7, y - 9 + flap, x + 14, y - 2 + flap);
        g.lineWidth = gulls ? 5 : 4; g.strokeStyle = INK; g.stroke();
        if (gulls) { g.lineWidth = 2.2; g.strokeStyle = "#FFFFFF"; g.stroke(); }
      });
      g.restore();
    }
    bay(alpha, ams) {
      const g = this.ctx, A = this.a;
      g.save(); g.globalAlpha = alpha * 0.8; g.strokeStyle = "#FFFFFF"; g.lineWidth = 3; g.lineCap = "round";
      [625, 662, 700, 738, 772].forEach((y, row) => {                 // wave glints sliding along the bay
        const shift = cyc(ams, LOOP / 4) * 160 * (row % 2 ? -1 : 1);
        for (let x = -160 + ((row * 53) % 160); x < W + 160; x += 160) {
          const xx = x + shift;
          g.beginPath(); g.moveTo(xx, y); g.quadraticCurveTo(xx + 12, y - 7, xx + 24, y); g.quadraticCurveTo(xx + 36, y + 7, xx + 48, y); g.stroke();
        }
      });
      g.restore();
      g.save(); g.globalAlpha = alpha;
      const fx = 640 + Math.sin(TAU * cyc(ams, LOOP) + Math.PI) * 430, fy = 712 + Math.sin(TAU * cyc(ams, LOOP / 50)) * 3;
      g.lineWidth = 3; g.strokeStyle = INK;                          // small fishing boat
      g.beginPath(); g.moveTo(fx - 40, fy - 14); g.lineTo(fx + 44, fy - 14); g.lineTo(fx + 32, fy + 4); g.lineTo(fx - 30, fy + 4); g.closePath();
      g.fillStyle = "#C25B4A"; g.fill(); g.stroke();
      g.fillStyle = "#FFFFFF"; g.fillRect(fx - 12, fy - 34, 26, 20); g.strokeRect(fx - 12, fy - 34, 26, 20);
      if (A.boat) g.drawImage(A.boat, 1000 + Math.sin(TAU * cyc(ams, LOOP)) * 300, 592 - A.boat.height + Math.sin(TAU * cyc(ams, LOOP / 60)) * 3);
      g.restore();
    }
    valleyTraffic(alpha, ams) {                                        // tiny cars on the valley road far below
      const A = this.a, P = (A.roads && A.roads.valley) || ROADS.hillysides;
      if (!A.cars || !A.cars.length) return;
      const g = this.ctx, at = u => {
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        return [a * P[0][0] + b * P[1][0] + c * P[2][0], a * P[0][1] + b * P[1][1] + c * P[2][1]];
      };
      for (let i = 0; i < 4; i++) {
        const right = i < 2, u0 = cyc(ams + i * (LOOP / 4), LOOP / 2), u = right ? u0 : 1 - u0;
        const fade = Math.min(1, u0 / 0.07, (1 - u0) / 0.07), im = A.cars[i % A.cars.length];
        const [x, y] = at(u), w = im.width * 0.3, h = im.height * 0.3;
        g.save(); g.globalAlpha = alpha * fade; g.translate(x, y - h + (right ? 4 : -2));
        if (!right) { g.translate(w, 0); g.scale(-1, 1); }
        g.drawImage(im, -w / 2, 0, w, h); g.restore();
      }
    }
    /* cars driving along the street in front of the house (riverside streets only) */
    traffic(mix, ams) {
      const A = this.a;
      if (!this.ambient || !A.cars || !A.cars.length || A.region !== "riverside" || mix >= 1) return;
      const g = this.ctx, span = W + 500; g.globalAlpha = 1 - mix;
      for (let i = 0; i < 3; i++) {                                    // far lane, left to right: 3 cars cross every LOOP/3
        const im = A.cars[i % A.cars.length], w = im.width * 0.8, h = im.height * 0.8;
        g.drawImage(im, ((i / 3 + cyc(ams, LOOP / 3)) % 1) * span - 250, 978 - h, w, h);
      }
      for (let i = 0; i < 2; i++) {                                    // near lane, right to left: 2 cars every LOOP/4
        const im = A.cars[(i + 3) % A.cars.length], w = im.width, h = im.height;
        const x = W + 250 - ((i / 2 + 0.3 + cyc(ams, LOOP / 4)) % 1) * span;
        g.save(); g.translate(x, 1010 - h); g.scale(-1, 1); g.drawImage(im, 0, 0, w, h); g.restore();
      }
      g.globalAlpha = 1;
    }

    house(img, dx = 0, dy = 0, alpha = 1) {
      const g = this.ctx; g.globalAlpha = alpha;
      g.drawImage(img, SPR.x + dx, SPR.y + dy, SPR.w, SPR.h); g.globalAlpha = 1;
    }
    fg(alpha) {
      if (!this.a.fgPost || alpha <= 0) return;
      const g = this.ctx; g.globalAlpha = alpha; g.drawImage(this.a.fgPost, 0, 0, W, H); g.globalAlpha = 1;
    }
    rain(intensity, ms) {
      if (intensity <= 0) return;
      const g = this.ctx; g.save(); g.strokeStyle = "#DCE6F2"; g.lineWidth = 3; g.lineCap = "round";
      g.globalAlpha = 0.55 * intensity;
      g.beginPath();
      for (const d of this.drops) {
        const y = ((d.y + ms * d.v) % (H + 80)) - 40, x = d.x + ((d.y + ms * d.v) % (H + 80)) * 0.35 - 0;
        g.moveTo(x, y); g.lineTo(x + d.l * 0.35, y + d.l);
      }
      g.stroke(); g.restore();
    }
    flash(alpha) {
      if (alpha <= 0) return;
      const g = this.ctx; g.fillStyle = `rgba(255,255,245,${alpha})`; g.fillRect(0, 0, W, H);
    }
    shake(t, a, b, amp) {
      if (this.reduced) return [0, 0];
      const e = Math.sin(Math.PI * seg(t, a, b)) * amp;
      return [Math.sin(t * 173) * e, Math.cos(t * 211) * e * 0.6];
    }
    water(levelY, ms, alpha) {
      if (alpha <= 0 || levelY >= H + 20) return;
      const g = this.ctx, coastal = this.a.region === "coastal";
      g.save(); g.globalAlpha = alpha;
      g.beginPath(); g.moveTo(-20, H + 20);
      for (let x = -20; x <= W + 20; x += 20) g.lineTo(x, levelY + Math.sin(x / 70 + ms / 260) * 9 + Math.sin(x / 23 + ms / 140) * 3);
      g.lineTo(W + 20, H + 20); g.closePath();
      g.fillStyle = coastal ? "rgba(112,150,150,0.86)" : "rgba(142,118,86,0.88)"; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      g.beginPath();                                           // foam along the surface
      for (let x = -20; x <= W + 20; x += 20) g.lineTo(x, levelY + 6 + Math.sin(x / 70 + ms / 260) * 9);
      g.lineWidth = 5; g.strokeStyle = coastal ? "rgba(240,246,248,0.9)" : "rgba(214,198,166,0.9)"; g.stroke();
      for (const d of this.debris) {                           // planks bobbing on the surface
        const y = levelY + Math.sin(d.x / 70 + ms / 260) * 9 + 4, x = d.x + Math.sin(ms / 900 + d.ph) * 18;
        g.save(); g.translate(x, y); g.rotate(d.rot + Math.sin(ms / 500 + d.ph) * 0.12);
        g.fillStyle = coastal ? "#B9966E" : "#9C7B5A"; g.strokeStyle = INK; g.lineWidth = 3;
        g.beginPath(); g.roundRect(-d.w / 2, -7, d.w, 14, 3); g.fill(); g.stroke(); g.restore();
      }
      g.restore();
    }
    /* point + upward normal at arc length s along the slip path */
    along(s) {
      const P = this.a.slipPath && this.a.slipPath.length > 1 ? this.a.slipPath : [[40, 330], [980, 900]];
      if (!this._lens) { this._lens = [0]; for (let i = 1; i < P.length; i++) this._lens.push(this._lens[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); }
      const L = this._lens, total = L[L.length - 1]; s = clamp(s, 0, total);
      let i = 1; while (i < L.length - 1 && L[i] < s) i++;
      const k = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], d = Math.hypot(dx, dy) || 1;
      return { x: P[i - 1][0] + dx * k, y: P[i - 1][1] + dy * k, nx: dy / d, ny: -dx / d, ux: dx / d, uy: dy / d, total };
    }
    mud(p, ms, alpha) {
      if (p <= 0 || alpha <= 0) return;
      const g = this.ctx, total = this.along(0).total, front = p * total;
      const top = [], bot = [];
      for (let i = 0; i <= 36; i++) {
        const k = i / 36, q = this.along(front * k);
        const th = (34 + 60 * Math.sin(Math.PI * Math.min(1, k * 1.15))) * (0.6 + 0.4 * p) + Math.sin(k * 40 + ms / 90) * 6;
        top.push([q.x + q.nx * th, q.y + q.ny * th]); bot.push([q.x - q.nx * 14, q.y - q.ny * 14]);
      }
      const F = this.along(front);
      g.save(); g.globalAlpha = alpha;
      g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.quadraticCurveTo(F.x + F.ux * 46, F.y + F.uy * 46, bot[bot.length - 1][0], bot[bot.length - 1][1]);
      for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
      g.closePath(); g.fillStyle = "#8A5A35"; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      for (const r of this.rocks) {                            // rocks tumbling with the front
        const q = this.along(r.d * front), bx = q.x + q.nx * (20 + Math.abs(r.off) * 0.3), by = q.y + q.ny * (20 + Math.abs(r.off) * 0.3);
        const hop = Math.abs(Math.sin(ms / 160 + r.ph)) * 18 * p;
        g.beginPath(); g.ellipse(bx, by - hop, r.s, r.s * 0.75, ms / 300 + r.ph, 0, Math.PI * 2);
        g.fillStyle = "#9C978E"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      }
      g.restore();
    }
    dust(spread, alpha) {
      if (alpha <= 0) return;
      const q = this.along(this.along(0).total * 0.68), g = this.ctx, cx = q.x, cy = q.y - 60;
      g.save(); g.globalAlpha = alpha;
      for (const p of this.puffs) {
        const r = p.r * (0.5 + spread * 1.1), x = cx + (p.x - 0.5) * 700 * (0.4 + spread), y = cy + (p.y - 0.6) * 360 * (0.4 + spread);
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = p.k > 0.5 ? "#D9C8AE" : "#C9B597"; g.fill();
      }
      g.restore();
    }
    sparkle(x, y, s, alpha) {
      if (alpha <= 0 || s <= 0) return;
      const g = this.ctx; g.save(); g.globalAlpha = alpha; g.translate(x, y); g.scale(s, s);
      g.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 22, a = (i * Math.PI) / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = "#FFE27A"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke(); g.restore();
    }

    /* ---------- frames ---------- */
    still(level, ams = 0) {
      const mix = level > 0 ? 1 : 0;
      this.ctx.clearRect(0, 0, W, H);
      this.scenery(mix, ams); this.house(this.dmg(level)); this.traffic(mix, ams);
      if (level > 0) this.fg(1);
      if (this.ambient && level > 0) this.rain(0.35, ams);
    }
    drawStatic(level) { this.level = level; if (!this.running) this.still(level, 0); }
    setLevel(level) { this.drawStatic(level); }

    frame(type, t, from = 0, to = 1, ams) {
      const g = this.ctx, ms = t * DURATION[type];
      if (ams === undefined) ams = ms;
      g.clearRect(0, 0, W, H);
      if (type === "flood") {
        const mix = from > 0 ? 1 : ease(seg(t, 0, 0.22));
        const peak = to >= 2 ? 500 : 560, rest = 880;
        const rise = easeOut(seg(t, 0.16, 0.5)), fall = ease(seg(t, 0.62, 0.9));
        const level = t < 0.62 ? (H + 30) + (peak - (H + 30)) * rise : peak + (rest - peak) * fall;
        const [sx, sy] = this.shake(t, 0.42, 0.62, 5);
        this.scenery(mix, ams);
        this.house(t < 0.56 ? this.dmg(from) : this.dmg(to), sx, sy);
        this.traffic(mix, ams);
        this.fg(from > 0 ? 1 - seg(t, 0.1, 0.3) : 0);
        this.water(level, ms, 1 - seg(t, 0.86, 1));
        this.fg(seg(t, 0.86, 1));
        this.rain(Math.max(from > 0 ? 0.35 : 0, seg(t, 0, 0.15)) * (1 - 0.65 * seg(t, 0.85, 1)), ams);
        this.flash(0.85 * pulse(t, 0.56, 0.035) + (this.a.region === "coastal" ? 0.45 * pulse(t, 0.3, 0.02) : 0));
      } else if (type === "landslip") {
        const mix = from > 0 ? 1 : ease(seg(t, 0, 0.2));
        const [sx, sy] = this.shake(t, 0.28, 0.66, 9);
        this.scenery(mix, ams);
        this.house(t < 0.62 ? this.dmg(from) : this.dmg(to), sx, sy);
        this.traffic(mix, ams);
        this.mud(easeOut(seg(t, 0.26, 0.6)), ms, 1 - seg(t, 0.62, 0.8));
        this.dust(seg(t, 0.48, 0.95), 0.95 * seg(t, 0.46, 0.56) * (1 - seg(t, 0.7, 1)));
        this.rain(Math.max(from > 0 ? 0.35 : 0, seg(t, 0, 0.15)) * (1 - 0.65 * seg(t, 0.85, 1)), ams);
      } else if (type === "repair") {
        const mix = 1 - ease(seg(t, 0, 0.35)), q = ease(seg(t, 0.2, 0.82));
        this.scenery(mix, ams);
        this.house(this.dmg(Math.max(1, from)));
        const cutY = SPR.y + SPR.h * (1 - q);                  // clean house wipes in from the bottom
        g.save(); g.beginPath(); g.rect(0, cutY, W, H - cutY); g.clip(); this.house(this.a.sprite); g.restore();
        if (q > 0 && q < 1) {
          const grd = g.createLinearGradient(0, cutY - 26, 0, cutY + 26);
          grd.addColorStop(0, "rgba(255,255,255,0)"); grd.addColorStop(0.5, "rgba(255,250,215,0.95)"); grd.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = grd; g.fillRect(SPR.x + 40, cutY - 26, SPR.w - 80, 52);
        }
        this.traffic(mix, ams);
        this.fg(1 - seg(t, 0, 0.3));
        this.rain(0.35 * (1 - seg(t, 0, 0.25)), ams);
        for (const s of this.sparks) {
          const k = seg(t, 0.25 + s.t0 * 0.5, 0.42 + s.t0 * 0.5);
          this.sparkle(s.x, s.y, Math.sin(Math.PI * k), Math.sin(Math.PI * k));
        }
        if (this.a.repairIcon) {
          const a = seg(t, 0.08, 0.18) * (1 - seg(t, 0.84, 0.96)), bounce = this.reduced ? 0 : Math.abs(Math.sin(ms / 170)) * 34;
          g.globalAlpha = a; g.drawImage(this.a.repairIcon, W / 2 - 80, SPR.y + 10 - bounce, 160, 160); g.globalAlpha = 1;
        }
      }
    }

    play(type, { from = this.level, to = Math.min(this.level + 1, 2) } = {}) {
      if (!DURATION[type]) return Promise.reject(new Error("Unknown transition: " + type));
      const final = type === "repair" ? 0 : to;
      const dur = DURATION[type] * (this.reduced ? 0.35 : 1);
      if (this.running) return new Promise(resolve => { this.anim = { type, from, to, final, dur, start: performance.now(), resolve }; });
      cancelAnimationFrame(this.raf);
      return new Promise(resolve => {
        const start = performance.now();
        const step = now => {
          const t = Math.min(1, (now - start) / dur);
          this.frame(type, t, from, to);
          if (t < 1) this.raf = requestAnimationFrame(step);
          else { this.level = final; this.still(final, 0); resolve(final); }
        };
        this.raf = requestAnimationFrame(step);
      });
    }

    /* continuous loop: ambient scenery, plus any transition started with play() */
    start() {
      if (this.running) return;
      this.running = true;
      const t0 = performance.now();
      const tick = now => {
        if (!this.running) return;
        const ams = this.reduced ? 0 : now - t0;
        const a = this.anim;
        if (a) {
          const t = Math.min(1, (now - a.start) / a.dur);
          this.frame(a.type, t, a.from, a.to, ams);
          if (t >= 1) { this.level = a.final; this.anim = null; a.resolve(a.final); }
        } else this.still(this.level, ams);
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
  }

  global.HouseTransitions = HouseTransitions;
})(typeof window !== "undefined" ? window : globalThis);
