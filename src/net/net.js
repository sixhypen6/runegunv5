/* =========================================================
   RUNEGUN · Net — the co-op session (two-warden WebRTC).
   Who this client is (role/localIdx), one RTCPeerConnection with the
   partner, two data channels, and the seam the sim reads a partner's
   input from (frameFor).

   Signaling lives in signal.js (Firebase Realtime DB). This build uses the
   host-offer-first mailbox: the host mints one offer under a short code and
   holds it; the guest fetches that offer, posts an answer, and both trickle
   ICE candidates into the room until the link comes up. This file turns that
   mailbox into a live peer link and then gets out of the way — the room is
   retired the instant the data channels open, and every byte of the run
   after that is phone-to-phone.

   Channels (one pair):
     "u" — unreliable/unordered: inputs + snapshots (latest-wins)
     "r" — reliable/ordered:     hello, lifecycle events, control
   ========================================================= */
"use strict";

/* Bump whenever the snapshot layout OR the lobby handshake changes: the two
   builds refuse each other with a clear message rather than desyncing. Kept
   in lockstep with the value signal.js stamps into the room. */
const PROTOCOL_VERSION = 1;

const Net = {
  role: "none",          // "none" (solo) | "host" | "guest"
  localIdx: 0,           // index into players[] of the warden THIS screen steers
  get peerIdx() { return this.role === "host" ? 1 : this.role === "guest" ? 0 : 1; },
  get active() { return this.role !== "none"; },

  pc: null, chU: null, chR: null,
  peerCfg: null,         // the partner's warden cfg (from the hello handshake)
  rtt: 0,                // last ping round-trip, ms — what the lobby shows
  _opened: 0,            // how many of the two channels have fired onopen
  _hbTimer: 0,
  _dropping: false,      // re-entrancy guard while a drop notifies the game layer
  lastHeard: 0,
  _iceOut: [], _iceIn: [], _iceCanSend: false, _iceCanAdd: false,

  /* wired by the lobby / game layer */
  onConnected: null,     // () the link is up (both channels open)
  onPeerHello: null,     // (cfg) the partner's warden cfg arrived
  onPeerLost: null,      // (why) heartbeat silence / ICE failure / close / refused
  onMessage: null,       // (msg) every non-internal message

  /* debug latency harness: { ms, jitter, loss } */
  fakeLag: null,

  /* what the last attempt managed — surfaced in the lobby so a failure can
     say WHY instead of blaming the code */
  iceStats: { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" },

  init() { /* RTC initialization — the peer is built per host()/join() */ },

  /* =========================================================
     PEER CONNECTION
     ========================================================= */
  _newPc() {
    if (typeof RTCPeerConnection === "undefined") throw new Error("no-webrtc");
    const pc = new RTCPeerConnection({ iceServers: iceServers(), iceCandidatePoolSize: 2 });
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      this.iceStats.state = s;
      if (s === "connected" || s === "completed") this._noteRoute(pc);
      if (s === "failed" || s === "closed") this._drop("ice-" + s);
      /* "disconnected" often self-heals — the heartbeat below is the arbiter */
    };
    return pc;
  },

  /* =========================================================
     ICE PLUMBING — two ordering hazards, both of which silently LOSE
     candidates, and a pair that has lost its candidates simply never meets.

     1. OUTBOUND. Gathering starts the instant setLocalDescription() resolves,
        but the room to publish into does not exist until Firebase answers —
        hundreds of milliseconds on mobile. Candidates emitted in that window
        hit no handler at all and vanished.
     2. INBOUND. addIceCandidate() is only legal once a REMOTE description
        exists. The host has none until the answer arrives, so every guest
        candidate that beat the answer was swallowed.

     Both directions are buffered and flushed instead of dropped.
     ========================================================= */
  _wireLocalIce() {
    this._iceOut = []; this._iceCanSend = false;
    this._iceIn = []; this._iceCanAdd = false;
    this.pc.onicecandidate = e => {
      if (!e.candidate) return;
      this._noteCandidate(e.candidate);
      const c = e.candidate.toJSON();
      if (this._iceCanSend) { try { Signal.pushCandidate(this.role, c); } catch (err) {} }
      else this._iceOut.push(c);
    };
  },
  _iceSendReady() {
    this._iceCanSend = true;
    this.iceStats.rescued += this._iceOut.length;
    for (const c of this._iceOut) { try { Signal.pushCandidate(this.role, c); } catch (e) {} }
    this._iceOut = [];
  },
  _addRemoteIce(c) {
    if (this._iceCanAdd && this.pc) this.pc.addIceCandidate(c).catch(() => {});
    else this._iceIn.push(c);
  },
  _iceAddReady() {
    this._iceCanAdd = true;
    this.iceStats.rescued += this._iceIn.length;
    if (this.pc) for (const c of this._iceIn) this.pc.addIceCandidate(c).catch(() => {});
    this._iceIn = [];
  },

  /* count our own candidate types as they gather: zero relay candidates means
     the TURN server never answered, which is a very different problem from a
     peer that simply couldn't be reached */
  _noteCandidate(c) {
    this.iceStats.gathered++;
    if (!c || !c.candidate) return;
    if (c.candidate.indexOf(" typ relay") !== -1) this.iceStats.relay++;
    else if (c.candidate.indexOf(" typ srflx") !== -1) this.iceStats.srflx++;
  },
  /* which pair actually won — "relay" here means we're paying for TURN */
  _noteRoute(pc) {
    if (!pc.getStats) return;
    pc.getStats(null).then(report => {
      let pairId = null;
      report.forEach(r => { if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId; });
      report.forEach(r => {
        const isPair = r.type === "candidate-pair" && (r.id === pairId || (!pairId && r.selected));
        if (!isPair) return;
        const local = report.get && report.get(r.localCandidateId);
        if (local) this.iceStats.route = local.candidateType || "";
      });
    }).catch(() => {});
  },

  /* =========================================================
     CONNECT FLOWS
     ========================================================= */

  /* HOST: mint the offer, claim a room code, and wait for one answer. Resolves
     with the code as soon as the room exists — the guest connects in the
     background. The host owns the channels, so they are created (and wired)
     BEFORE the offer so the SDP advertises them. */
  async host() {
    if (this.role !== "none") this.hangUp();   // a retry must not leave a stale room behind
    this.role = "host"; this.localIdx = 0;
    this.peerCfg = null; this.rtt = 0;
    this.iceStats = { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" };
    try {
      const pc = this.pc = this._newPc();
      this._wire(pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 }), "u");
      this._wire(pc.createDataChannel("r"), "r");
      this._wireLocalIce();                    // armed before gathering can start
      await pc.setLocalDescription(await pc.createOffer());
      const code = await Signal.createRoom(pc.localDescription.sdp);
      this._iceSendReady();                    // room exists — flush everything gathered
      /* their candidates may already be waiting: buffer them until the answer
         lands and a remote description exists */
      Signal.onCandidates("guest", c => this._addRemoteIce(c));
      Signal.waitForAnswer().then(sdp => {
        if (!this.pc || this.role !== "host") return;
        pc.setRemoteDescription({ type: "answer", sdp })
          .then(() => this._iceAddReady())     // only NOW may their candidates be added
          .catch(() => this._drop("answer-bad"));
      });
      return code;
    } catch (e) {
      this.role = "none";
      this._closePeer();
      try { Signal.cleanup(true); } catch (err) {}
      throw e;
    }
  },

  /* GUEST: fetch the host's offer, answer it, and let the channels come up. */
  async join(code) {
    if (this.role !== "none") this.hangUp();   // a retry must withdraw the previous join
    this.role = "guest"; this.localIdx = 1;
    this.peerCfg = null; this.rtt = 0;
    this.iceStats = { gathered: 0, relay: 0, srflx: 0, rescued: 0, state: "", route: "" };
    let offerSdp;
    try {
      offerSdp = await Signal.fetchOffer(code);   // sets Signal.code + owner="guest"; throws on bad code
    } catch (e) {
      this.role = "none";
      throw e;
    }
    try {
      const pc = this.pc = this._newPc();
      pc.ondatachannel = e => this._wire(e.channel, e.channel.label);
      this._wireLocalIce();
      Signal.onCandidates("host", c => this._addRemoteIce(c));   // buffer until remote desc set
      await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
      this._iceAddReady();                     // remote description in hand from the start
      this._iceSendReady();                    // the room already exists — send at once
      await pc.setLocalDescription(await pc.createAnswer());
      await Signal.postAnswer(pc.localDescription.sdp);
    } catch (e) {
      this.role = "none";
      this._closePeer();
      try { Signal.cleanup(false); } catch (err) {}   // a guest only withdraws its own answer
      throw e;
    }
  },

  _wire(ch, label) {
    if (label === "u") this.chU = ch; else this.chR = ch;
    ch.onmessage = ev => this._recv(ev.data);
    ch.onopen = () => { this._opened++; if (this._opened >= 2) this._onOpen(); };
    ch.onclose = () => this._drop("channel-closed");
  },

  _onOpen() {
    this.lastHeard = performance.now();
    this._startHeartbeat();
    this.sendR({ t: "hello", v: PROTOCOL_VERSION, cfg: localPlayerCfg() });
    /* the room's job is done the moment the link is up — retire it so no stray
       knock can claim a seat, and hand the socket back (all game traffic is P2P) */
    try { Signal.cleanup(this.role === "host"); Signal.releaseSoon(); } catch (e) {}
    if (this.onConnected) this.onConnected();
  },

  _startHeartbeat() {
    if (this._hbTimer) return;
    this._hbTimer = setInterval(() => this._heartbeat(), 2000);
  },
  _heartbeat() {
    if (!this.chU || this.chU.readyState !== "open") return;
    const now = performance.now();
    this.sendU({ t: "ping", ts: now });
    if (now - this.lastHeard > 8000) this._drop("silence");
  },

  /* =========================================================
     SEND / RECEIVE
     ========================================================= */
  sendU(obj) { this._sendData(this.chU, obj); },   // unreliable / unordered
  sendR(obj) { this._sendData(this.chR, obj); },   // reliable / ordered

  _sendData(ch, obj) {
    /* a channel that is not open yet drops silently — the wire is UDP-like by
       design, and every message either is periodic (next one refreshes it) or
       is re-sent by its own watchdog (see Coop._runeWatchdog) */
    if (!ch || ch.readyState !== "open") return;
    let data; try { data = JSON.stringify(obj); } catch (e) { return; }
    const L = this.fakeLag;
    if (L && Math.random() < (L.loss || 0)) return;
    const fire = () => { try { ch.send(data); } catch (e) {} };
    if (L) setTimeout(fire, L.ms + Math.random() * (L.jitter || 0));
    else fire();
  },

  _recv(data) {
    this.lastHeard = performance.now();
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    switch (m.t) {
      /* heartbeat: reply, never surface */
      case "ping": this.sendU({ t: "pong", ts: m.ts }); return;
      case "pong": this.rtt = Math.round(performance.now() - m.ts); return;
      /* handshake: version-checked before the lobby trusts the partner's cfg */
      case "hello":
        if (m.v !== PROTOCOL_VERSION) { this.sendR({ t: "err", code: "version" }); this._drop("version"); return; }
        this.peerCfg = m.cfg;
        if (this.onPeerHello) this.onPeerHello(m.cfg);
        return;
      case "err": this._drop(m.code || "peer-error"); return;
    }
    if (this.onMessage) this.onMessage(m);
  },

  /* =========================================================
     TEARDOWN
     ========================================================= */
  _closePeer() {
    const pc = this.pc, u = this.chU, r = this.chR;
    this.pc = this.chU = this.chR = null;
    this._opened = 0;
    try { if (u) u.close(); } catch (e) {}
    try { if (r) r.close(); } catch (e) {}
    try { if (pc) pc.close(); } catch (e) {}
  },

  /* One partner is gone. The role is left intact so the game layer can read it
     (Coop captures wasHost BEFORE it hangs up); the callback owns the hangUp. */
  _drop(why) {
    if (this.role === "none" || this._dropping) return;
    this._dropping = true;
    const cb = this.onPeerLost;
    if (cb) cb(why); else this.hangUp();
    if (this.role !== "none") this.hangUp();   // a callback that did not tear down
    this._dropping = false;
  },

  hangUp() {
    this.role = "none"; this.localIdx = 0;     // first: channel close handlers see "none" and no-op
    clearInterval(this._hbTimer); this._hbTimer = 0;
    this._closePeer();
    this.peerCfg = null; this.rtt = 0;
    this._iceOut = []; this._iceIn = []; this._iceCanSend = this._iceCanAdd = false;
    try { Signal.cleanup(true); } catch (e) {}
    try { Signal.releaseSoon(); } catch (e) {}
  },

  /* the input frame steering warden `p` this tick when p is not local.
     Coop wraps this to feed the guest's wire input on the host; DEV_P2 is the
     couch harness. */
  frameFor(p) {
    if (typeof DEV_P2 !== "undefined" && DEV_P2) return devP2Frame(p);
    return null;   // update() substitutes a zero frame
  },
};

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