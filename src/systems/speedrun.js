/* =========================================================
   RUNEGUN · Speedrun timer
   A millisecond run clock that only advances while the descent is live
   (pauses, the codex and menus freeze it), plus per-warden personal bests
   for a completed descent.
   ========================================================= */
"use strict";

/* states in which the run clock is allowed to advance — an allow-list, so any
   new overlay/state added later freezes the clock until it is opted in */
const RUN_TIMER_STATES = new Set(["play", "rune", "choice", "held", "wait"]);

/* 1:23.456 — minutes unpadded, milliseconds always three digits */
function fmtRunTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

/* fastest clear for a warden: their own record first, then the mode ledger.
   Every descent keeps its own key — NORMAL is the bare warden id, then :hard —
   so a fast NORMAL run can never masquerade as a HARD best. */
function runSpeedKey(forChar) {
  return (typeof Game !== "undefined" && Game.hardMode) ? forChar + ":hard" : forChar;
}
function runModeLabel() {
  return (typeof Game !== "undefined" && Game.hardMode) ? "HARD BEST" : "BEST";
}
function runBestTime(forChar) {
  const per = Meta.speedBests && Meta.speedBests[runSpeedKey(forChar)];
  return (typeof per === "number" && per > 0) ? per : 0;
}

const RunTimer = {
  t: 0,                 // seconds of live run time
  running: false,       // a descent is under way
  done: false,          // the descent was completed (clock frozen for good)
  lastClock: "", lastBest: "",

  reset() {
    this.t = 0; this.running = false; this.done = false;
    this.paint(true);
  },
  /* called from resetRun — the clock starts with the descent, not the menu */
  start() {
    this.t = 0; this.running = true; this.done = false;
    this.lastClock = ""; this.lastBest = "";
    this.paint(true);
  },
  tick(dt) {
    if (this.running && !this.done && RUN_TIMER_STATES.has(Game.state)) this.t += dt;
    this.paint();
  },
  /* THE EVENT HORIZON falls — the descent is complete; bank the record.
     Death needs no explicit stop: the allow-list freezes the clock in dead/continue,
     so a paid revive steps back into the same running clock. Co-op runs are timed
     but not banked (a shared descent has no single warden's record). */
  finish() {
    if (!this.running || this.done) return null;
    this.running = false; this.done = true;
    const sec = this.t, stamp = Math.round(sec * 1000) / 1000;
    let prev = 0, newBest = false;
    if (!(typeof Net !== "undefined" && Net.active)) {
      if (!Meta.speedBests) Meta.speedBests = {};
      const key = runSpeedKey(Meta.char);
      const per = Meta.speedBests[key] || 0;
      prev = per;
      if (!per || stamp < per) { Meta.speedBests[key] = stamp; newBest = true; }
      metaSave();
    }
    this.paint(true);
    const msg = "DESCENT COMPLETE · " + fmtRunTime(sec) + (newBest ? " · NEW BEST" : prev ? " · BEST " + fmtRunTime(prev) : "");
    if (typeof RunegunConsole !== "undefined" && RunegunConsole.logEvent) RunegunConsole.logEvent("FINISH", msg);
    setTimeout(() => { if (Game.state === "play") toast(msg); }, 1600);
    return sec;
  },
  paint(force) {
    const clock = $("runClock"), bestEl = $("runBest");
    if (!clock) return;
    const txt = fmtRunTime(this.t);
    if (force || txt !== this.lastClock) { clock.textContent = txt; this.lastClock = txt; }
    clock.classList.toggle("done", this.done);
    if (!bestEl) return;
    const pb = runBestTime(Meta.char), bt = pb ? runModeLabel() + " · " + fmtRunTime(pb) : "";
    if (force || bt !== this.lastBest) { bestEl.textContent = bt; this.lastBest = bt; }
  },
};