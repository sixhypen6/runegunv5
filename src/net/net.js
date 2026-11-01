/* =========================================================
   RUNEGUN · Network (Phase C: WebRTC + P2P)
   The high-level DataChannel broker: room-codes, signaling,
   reliable/unreliable channels, and co-op lifecycle.
   ========================================================= */
"use strict";

const Net = (() => {
  let active = false;
  let localIdx = 0;
  let peerIdx = 1;
  let role = "host"; // "host" | "guest"

  // Callbacks
  let onOpen = null;
  let onData = null;
  let onPeerLost = null;

  return {
    get active() { return active; },
    get localIdx() { return localIdx; },
    get peerIdx() { return peerIdx; },
    get role() { return role; },

    set onOpen(fn) { onOpen = fn; },
    set onData(fn) { onData = fn; },
    set onPeerLost(fn) { onPeerLost = fn; },

    init() { /* RTC initialization */ },

    send(msg) { /* unreliable (UDP-like) send */ },
    sendR(msg) { /* reliable (TCP-like) send */ },

    host() { /* become the room host */ },
    join(code) { /* join a room with code */ },
    hangUp() { /* close connection */ active = false; },

    _lost(why) {
      if (!this.active) return;
      const cb = this.onPeerLost;
      this.hangUp();
      if (cb) cb(why);
    },

    /* the input frame steering warden `p` this tick when p is not local.
       Phase C feeds the guest's wire input here; DEV_P2 is the couch harness. */
    frameFor(p) {
      if (typeof DEV_P2 !== "undefined" && DEV_P2) return devP2Frame(p);
      return null;   // update() substitutes a zero frame
    },
  };
})();

/* =========================================================
   DEV_P2 — couch-test harness (web build only).
   Flip to true (with PC_MODE = true in input.js) and resetRun gains a
   second warden steered by IJKL + ; (dash) + ' (use), auto-aiming.
   Exists purely to exercise every per-player code path with no network.
   ========================================================= */
const DEV_P2 = false;
const DEV_P2_CFG = { char: "gunsmith", skin: "toxin", pet: null, rerollBuff: 0 };
let devP2Dash = false;
let devP2Use = false;

if (DEV_P2) {
  window.addEventListener("keydown", e => {
    if (e.code === "Semicolon") devP2Dash = true;
    if (e.code === "Quote") devP2Use = true;
  });
}

function devP2Frame() {
  const k = Input.keys;
  let mx = (k.KeyL ? 1 : 0) - (k.KeyJ ? 1 : 0);
  let my = (k.KeyK ? 1 : 0) - (k.KeyI ? 1 : 0);
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  const f = { mx, my, aimX: 0, aimY: 0, aiming: false, mouseX: undefined, mouseY: undefined,
    mouseDown: false, touchMode: true, aimMode: "auto", deskMode: "auto",
    dashTap: devP2Dash, useTap: devP2Use };
  devP2Dash = devP2Use = false;
  return f;
}
