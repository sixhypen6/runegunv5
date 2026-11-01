/* =========================================================
   RUNEGUN · Math & DOM helpers
   Small pure utilities (rng, clamp, distance, lerp, roman numerals) and the $ element lookup, shared everywhere.
   ========================================================= */
"use strict";


/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const ROMAN = n => { const m=[["L",50],["XL",40],["X",10],["IX",9],["V",5],["IV",4],["I",1]]; let s=""; for(const [r,v] of m){ while(n>=v){s+=r;n-=v;} } return s||"I"; };
const $ = id => document.getElementById(id);

function circleRotRect(cx, cy, cr, rx, ry, rw, rh, ra) {
  const dx = cx - rx, dy = cy - ry;
  const cos = Math.cos(-ra), sin = Math.sin(-ra);
  const x = dx * cos - dy * sin;
  const y = dx * sin + dy * cos;
  const closeX = clamp(x, -rw/2, rw/2);
  const closeY = clamp(y, -rh/2, rh/2);
  return Math.hypot(x - closeX, y - closeY) < cr;
}

function distToLine2(px, py, x1, y1, x2, y2) {
  const l2 = dist2(x1, y1, x2, y2);
  if (l2 === 0) return dist2(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

function findTargetInCone(x, y, ang, maxDist, cone) {
  let best = null, bd = maxDist * maxDist;
  for (const e of (enemies || [])) {
    if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
    const d2 = dist2(x, y, e.x, e.y);
    if (d2 < bd) {
      const aToE = angTo(x, y, e.x, e.y);
      let diff = Math.abs(ang - aToE);
      while (diff > Math.PI) diff -= TAU;
      if (Math.abs(diff) < cone) {
        bd = d2; best = e;
      }
    }
  }
  return best;
}

/* short vibration pulse on key combat beats — Android WebView / mobile browsers
   only (navigator.vibrate is absent on desktop → silent no-op). Meta.haptics
   gates it via the settings toggle. */
const haptic = ms => { if (Meta.haptics !== false && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
