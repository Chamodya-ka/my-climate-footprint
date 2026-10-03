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

  class HouseTransitions {
    constructor(canvas, assets, options = {}) {
      this.c = canvas; this.ctx = canvas.getContext("2d"); this.a = assets;
      canvas.width = W; canvas.height = H;
      this.reduced = options.reducedMotion ?? (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const r = rng(11);
      this.drops = Array.from({ length: 230 }, () => ({ x: r() * W * 1.25 - 150, y: r() * H, l: 24 + r() * 28, v: 1.2 + r() * 0.9 }));
      this.debris = Array.from({ length: 7 }, (_, i) => ({ x: 90 + i * 230 + r() * 80, w: 60 + r() * 70, ph: r() * 6.3, rot: (r() - 0.5) * 0.5 }));
      this.rocks = Array.from({ length: 16 }, () => ({ d: r(), s: 7 + r() * 12, ph: r() * 6.3, off: (r() - 0.5) * 110 }));
      this.puffs = Array.from({ length: 26 }, () => ({ x: r(), y: r(), r: 50 + r() * 80, k: r() }));
      this.sparks = Array.from({ length: 18 }, () => ({ x: SPR.x + 160 + r() * (SPR.w - 320), y: SPR.y + 120 + r() * (SPR.h - 320), t0: r() }));
      this.raf = 0;
      this.level = options.level || 0;
      this.ambient = !!(options.ambient && assets.bgNormalBase && assets.bgPostBase);
      const r2 = rng(options.seed || 1);
      this.cloudList = Array.from({ length: 5 }, (_, i) => ({ k: i, x: r2() * W, y: 40 + r2() * 250, sp: 0.6 + r2() * 0.7 }));
      this.stormList = Array.from({ length: 8 }, (_, i) => ({ k: i, x: r2() * W, y: 10 + r2() * 300, sp: 0.8 + r2() * 0.6 }));
      // evenly spaced cars, one speed per lane, so they never drive through each other
      this.carList = [0, 1, 2, 0, 1].map((slot, i) => {
        const lane = i < 3 ? 0 : 1, n = lane ? 2 : 3;
        return { lane, k: i, off: slot * (W + 500) / n + r2() * 120, sp: lane ? 210 : 165 };
      });
      this.anim = null; this.running = false;
    }

    static get DURATION() { return DURATION; }
    get layout() { return { stage: { w: W, h: H }, sprite: { ...SPR } }; }

    dmg(level) { return level > 0 ? (this.a.damaged[level] || this.a.damaged[2] || this.a.sprite) : this.a.sprite; }

    /* ---------- building blocks ---------- */
    bg(mix) {
      const g = this.ctx;
      g.globalAlpha = 1; g.drawImage(this.a.bgNormal, 0, 0, W, H);
      if (mix > 0) { g.globalAlpha = mix; g.drawImage(this.a.bgPost, 0, 0, W, H); g.globalAlpha = 1; }
    }
    /* background: static images, or (ambient) base layers + drifting clouds and the boat */
    scenery(mix, ams) {
      if (!this.ambient) { this.bg(mix); return; }
      const g = this.ctx, A = this.a;
      g.drawImage(A.bgNormalBase, 0, 0, W, H);
      if (mix > 0) { g.globalAlpha = mix; g.drawImage(A.bgPostBase, 0, 0, W, H); g.globalAlpha = 1; }
      const drift = (x, speed, w) => { const span = W + w + 200; return (((x + speed * ams / 1000) % span) + span) % span - w - 100; };
      if (mix < 1 && A.clouds && A.clouds.length) {
        g.globalAlpha = 1 - mix;
        for (const c of this.cloudList) { const im = A.clouds[c.k % A.clouds.length]; g.drawImage(im, drift(c.x, 12 * c.sp, im.width), c.y); }
      }
      if (mix > 0 && A.stormClouds && A.stormClouds.length) {
        g.globalAlpha = mix;
        for (const c of this.stormList) { const im = A.stormClouds[c.k % A.stormClouds.length]; g.drawImage(im, drift(c.x, 34 * c.sp, im.width), c.y); }
      }
      g.globalAlpha = 1;
      if (A.boat && this.a.region === "coastal" && mix < 1) {
        g.globalAlpha = 1 - mix;
        g.drawImage(A.boat, 1010 + Math.sin(ams / 9000) * 280, 590 - A.boat.height + Math.sin(ams / 650) * 3);
        g.globalAlpha = 1;
      }
    }
    /* cars driving along the road in front of the house (riverside streets only) */
    traffic(mix, ams) {
      const A = this.a;
      if (!this.ambient || !A.cars || !A.cars.length || A.region !== "riverside" || mix >= 1) return;
      const g = this.ctx, span = W + 500; g.globalAlpha = 1 - mix;
      for (const lane of [0, 1]) for (const c of this.carList) {
        if (c.lane !== lane) continue;
        const im = A.cars[c.k % A.cars.length], sc = lane ? 1 : 0.8, w = im.width * sc, h = im.height * sc;
        const p = (c.off + c.sp * ams / 1000) % span, y = (lane ? 1010 : 978) - h;
        if (lane) { g.save(); g.translate(W + 250 - p, y); g.scale(-1, 1); g.drawImage(im, 0, 0, w, h); g.restore(); }  // near lane drives left
        else g.drawImage(im, p - 250, y, w, h);
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
