/* =========================================================
   RUNEGUN · Input (keyboard, mouse, touch)
   Unified input state plus the listeners and the on-screen thumbsticks for mobile.
   ========================================================= */
"use strict";


/* ---------- input ---------- */
const Input = {
  keys: {}, mouseX: 0, mouseY: 0, mouseDown: false,
  moveX: 0, moveY: 0,
  aimX: 0, aimY: 0, aiming: false,
  touchMode: false,
  dashTap: false, useTap: false,
};

function isTextEditingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName && el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

window.addEventListener("keydown", e => {
  if (e.code === "F9") return;
  // Block common reload / search shortcuts that might disrupt the game
  if (e.code === "F5" || (e.ctrlKey && e.code === "KeyR") || (e.metaKey && e.code === "KeyR")) e.preventDefault();
  if ((e.ctrlKey && e.code === "KeyF") || (e.metaKey && e.code === "KeyF")) e.preventDefault();

  if (isTextEditingTarget(document.activeElement)) return;
  Input.keys[e.code] = true;
  if (Game.state === "tutorial") { e.preventDefault(); if (e.code === "Escape") tutorialSkip(); else tutorialAdvance(); return; }
  if (Game.state === "cutscene") { e.preventDefault(); if (e.code === "Escape") endCutscene(); else cutsceneTap(); return; }
  if (Game.state === "vaultcut") { e.preventDefault(); if (e.code === "Escape") endVaultCutscene(); else vaultCutsceneTap(); return; }
  /* dash/seal taps only latch during live play — a Space pressed on an overlay
     must not fire a buffered dash the instant the game resumes */
  if (e.code === "Space") { if (Game.state === "play") Input.dashTap = true; e.preventDefault(); }
  if (e.code === "KeyE" && Game.state === "play") Input.useTap = true;
  if (e.code === "KeyQ" && Game.state === "play") Input.ultTap = true;
  if (e.code === "KeyF" && Game.state === "play") toggleWarp();
  if (e.code === "Tab" || e.code === "KeyI") { e.preventDefault(); toggleRunesHeld(); }
  if (e.code === "Escape" || e.code === "KeyP") {
    /* Settings / layout editor are classList overlays, not states — close them
       first or Escape would silently toggle pause→play underneath the panel.
       The editor (z40) stacks ON TOP of a still-open settings (z20): topmost first. */
    if ($("ctrlEdit").classList.contains("on")) { closeCtrlEdit(true); return; }
    if ($("settings").classList.contains("on")) { closeSettings(); return; }
    if ($("modeChoice").classList.contains("on")) { closeModeChoice(); return; }
    if (Game.state === "play" || Game.state === "pause") togglePause();
    else if (Game.state === "held") toggleRunesHeld();
    else if (Game.state === "vault") closeVault();
    else if (Game.state === "lobby") Lobby.close();
    /* the revive is bought and paid for; Escape here means "I'm ready", not "cancel".
       Deliberately NOT bound to Space — a mashed dash key must not skip the breath. */
    else if (Game.state === "resume") resumeRun();
  }
});
window.addEventListener("keyup", e => Input.keys[e.code] = false);
/* focus loss eats keyup events — release everything or keys stick after alt-tab */
window.addEventListener("blur", () => {
  Input.keys = {}; Input.mouseDown = false;
  Input.moveX = Input.moveY = 0; Input.aiming = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && Game.state === "play") {
    /* a backgrounded GUEST can't pause its own sim (it has none) — it asks the
       host to hold the world for both */
    if (typeof Net !== "undefined" && Net.role === "guest") Net.sendR({ t: "pauseReq" });
    else togglePause();
  }
  /* Park/unpark the audio hardware regardless of state — a menu or cutscene left
     in the background must not keep the context running either. Not gated on
     Game.state, unlike the pause above. */
  if (document.hidden) AudioFX.suspend(); else AudioFX.resume();
});
cv.addEventListener("mousemove", e => { Input.mouseX = e.clientX; Input.mouseY = e.clientY; });
cv.addEventListener("mousedown", e => {
  if (Game.state === "tutorial") { tutorialAdvance(); return; }
  if (Game.state === "cutscene") { cutsceneTap(); return; }
  if (Game.state === "vaultcut") { vaultCutsceneTap(); return; }
  if (e.button === 0) {
    Input.mouseDown = true;
    if (Game.state === "menu" && MENU_BG.hr > 0) {
      const mx = e.clientX, my = e.clientY;
      if (Math.hypot(mx - MENU_BG.hx, my - MENU_BG.hy) <= MENU_BG.hr * 1.3) {
        const cols = ["#9d6bff", "#ffd23d", "#fff", "#c9b8ff", "#ff4d5e"];
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU + rnd(0, 0.22);
          const spd = rnd(280, 500);
          const life = rnd(0.7, 1.3);
          MENU_BG.shots.push({ x: MENU_BG.hx, y: MENU_BG.hy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, col: pick(cols), life, maxLife: life });
        }
        AudioFX.shoot();
      }
    }
  }
  AudioFX.unlock();
});
window.addEventListener("mouseup", e => { if (e.button === 0) Input.mouseDown = false; });
cv.addEventListener("contextmenu", e => e.preventDefault());

function makeStick(el, onMove, onEnd) {
  const base = el.querySelector(".base"), nub = el.querySelector(".nub");
  let id = null, ox = 0, oy = 0;
  const R = 52;
  el.addEventListener("touchstart", e => {
    document.body.classList.add("touch"); Input.touchMode = true; AudioFX.unlock();
    /* First finger down owns this stick until it lifts. Without this, a second
       touch anywhere in the stick's area re-binds `id` to itself and orphans the
       thumb already steering: its touchmove no longer matches, and when the new
       finger lifts, `end` zeroes movement while the original thumb is still held.
       In the default aim mode stickL is the whole bottom half of the screen, so a
       resting palm or a stray tap would freeze the player mid-fight.
       preventDefault still runs for the ignored touch — the stick has no
       touch-action:none of its own, so the browser must not act on it either. */
    if (id !== null) { e.preventDefault(); return; }
    const t = e.changedTouches[0];
    id = t.identifier; ox = t.clientX; oy = t.clientY;
    base.style.left = (ox - 48 - el.offsetLeft) + "px"; base.style.top = (oy - 48 - el.offsetTop) + "px";
    nub.style.left = (ox - 22 - el.offsetLeft) + "px"; nub.style.top = (oy - 22 - el.offsetTop) + "px";
    base.style.opacity = nub.style.opacity = 1;
    e.preventDefault();
  }, { passive: false });
  el.addEventListener("touchmove", e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      nub.style.left = (ox + dx - 22 - el.offsetLeft) + "px";
      nub.style.top = (oy + dy - 22 - el.offsetTop) + "px";
      onMove(dx / R, dy / R);
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      id = null; base.style.opacity = nub.style.opacity = 0; onEnd();
    }
  };
  el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
}
makeStick($("stickL"),
  (x, y) => { Input.moveX = x; Input.moveY = y; },
  () => { Input.moveX = 0; Input.moveY = 0; });
makeStick($("stickR"),
  (x, y) => { const m = Math.hypot(x, y); Input.aiming = m > 0.25; Input.aimX = x; Input.aimY = y; },
  () => { Input.aiming = false; });
/* ---------- action buttons: dash + seal ----------
   Single-tap fires the action. While the layout editor is open (CtrlEditing) the
   touch is a drag, so the tap is suppressed. */
let CtrlEditing = false;
$("btnDash").addEventListener("touchstart", e => { if (CtrlEditing) return; if (Game.state === "play") Input.dashTap = true; e.preventDefault(); });
$("btnUse").addEventListener("touchstart", e => { if (CtrlEditing) return; if (Game.state === "play") Input.useTap = true; e.preventDefault(); });
$("btnWarp").addEventListener("touchstart", e => { if (CtrlEditing) return; if (Game.state === "play") toggleWarp(); e.preventDefault(); });

function toggleWarp() {
  const p = localPlayer();
  if (!p || !p.mods || !p.mods.warp) return;
  p.warpArmed = !p.warpArmed;
  AudioFX.click();
  updateWarpButton();
}

function updateWarpButton() {
  const btn = $("btnWarp");
  const p = localPlayer();
  if (!btn || !p) return;
  if (p.mods && p.mods.warp) {
    btn.style.display = "flex";
    btn.textContent = "WARP: " + (p.warpArmed ? "ON" : "OFF");
    btn.style.backgroundColor = p.warpArmed ? "rgba(157, 107, 255, 0.4)" : "rgba(20, 18, 38, 0.6)";
  } else {
    btn.style.display = "none";
  }
}

/* ---------- repositionable controls (BUTTONS scheme) ----------
   Button positions persist as viewport fractions (Meta.btnLayout) so they survive
   resolution / orientation changes. null = stock CSS layout (backward compatible). */
let CTRL_BW = 54, CTRL_BH = 54;   // .tbtn size (updated by applyButtonSize)
function placeBtn(el, fx, fy) {
  const px = clamp(fx * window.innerWidth, 0, window.innerWidth - CTRL_BW);
  const py = clamp(fy * window.innerHeight, 0, window.innerHeight - CTRL_BH);
  el.style.position = "fixed";
  el.style.left = px + "px"; el.style.top = py + "px";
  el.style.right = "auto"; el.style.bottom = "auto";
}
function applyControlLayout() {
  const L = Meta.btnLayout, dash = $("btnDash"), use = $("btnUse");
  if (!dash || !use) return;
  document.body.classList.toggle("customCtrl", !!L);
  if (!L) {                                   // stock: clear inline styles, flex layout resumes
    for (const el of [dash, use]) el.style.position = el.style.left = el.style.top = el.style.right = el.style.bottom = "";
    return;
  }
  placeBtn(dash, L.dash.x, L.dash.y);
  placeBtn(use, L.seal.x, L.seal.y);
}
function defaultButtonRects() {                // current on-screen rects → fractions (RESET / first drag)
  const r1 = $("btnDash").getBoundingClientRect(), r2 = $("btnUse").getBoundingClientRect();
  return { dash: { x: r1.left / window.innerWidth, y: r1.top / window.innerHeight },
           seal: { x: r2.left / window.innerWidth, y: r2.top / window.innerHeight } };
}
/* on-screen button size (small/medium/large). Drives the .tbtn CSS var and the
   clamp bounds so a resized button can't be dragged/left off-screen. */
const BTN_SIZES = { small: 54, medium: 68, large: 82 };
function applyButtonSize() {
  const px = BTN_SIZES[Meta.btnSize] || BTN_SIZES.medium;
  CTRL_BW = CTRL_BH = px;
  document.documentElement.style.setProperty("--tbtn", px + "px");
  applyControlLayout();                        // re-clamp any stored custom fractions to the new size
}
/* drag-to-move handlers for the layout editor (touch + mouse), bound once. */
function bindBtnDrag(el, key) {
  let id = null, gdx = 0, gdy = 0;
  const startAt = (cx, cy) => { const r = el.getBoundingClientRect(); gdx = cx - r.left; gdy = cy - r.top; };
  const moveTo = (cx, cy) => {
    const px = clamp(cx - gdx, 0, window.innerWidth - CTRL_BW);
    const py = clamp(cy - gdy, 0, window.innerHeight - CTRL_BH);
    el.style.position = "fixed"; el.style.left = px + "px"; el.style.top = py + "px";
    el.style.right = "auto"; el.style.bottom = "auto";
    if (Meta.btnLayout) Meta.btnLayout[key] = { x: px / window.innerWidth, y: py / window.innerHeight };
  };
  el.addEventListener("touchstart", e => {
    if (!CtrlEditing) return;
    const t = e.changedTouches[0]; id = t.identifier; startAt(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  el.addEventListener("touchmove", e => {
    if (!CtrlEditing) return;
    for (const t of e.changedTouches) { if (t.identifier !== id) continue; moveTo(t.clientX, t.clientY); }
    e.preventDefault();
  }, { passive: false });
  const tend = e => { for (const t of e.changedTouches) if (t.identifier === id) id = null; };
  el.addEventListener("touchend", tend); el.addEventListener("touchcancel", tend);
  el.addEventListener("mousedown", e => {                // desktop testing
    if (!CtrlEditing) return;
    startAt(e.clientX, e.clientY);
    const mm = ev => moveTo(ev.clientX, ev.clientY);
    const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu); e.preventDefault();
  });
}
bindBtnDrag($("btnDash"), "dash");
bindBtnDrag($("btnUse"), "seal");

/* ---------- tap-anywhere gestures (GESTURES scheme) ----------
   A window-level recognizer that runs alongside the sticks. A stationary, short
   touch is a tap; movement > MOVE_TOL is a drag (stick use) and ignored. A single
   tap fires the "tap" action after DOUBLE_MS (so a double-tap can pre-empt it); a
   second tap inside the window fires the "double" action instead. */
const GEST = { DOUBLE_MS: 280, TAP_MAX_MS: 250, MOVE_TOL: 16 };
let GestActive = false;
const gestTouches = {};                        // identifier → {t, x, y, moved}
let gestPendingTimer = null, gestLastTapT = 0;
/* Guarded like every other tap source (Space/KeyE above, btnDash/btnUse below):
   a latch set outside live play is never cleared, because update() returns before
   its clears. The single-tap path reaches here from a 280ms timer, so the state
   can easily have left "play" in between — the tap killed the boss, the player
   died, or an ad fired visibilitychange → togglePause. Without this, the buffered
   action fires on the first frame after play resumes: an unrequested spawnBoss()
   or a burnt dash, from a tap the player made a state ago. */
function gestFire(act) {
  if (Game.state !== "play") return;
  if (act === "dash") Input.dashTap = true; else if (act === "seal") Input.useTap = true;
}
function gestMap() { return Meta.gestureSwap ? { tap: "dash", dbl: "seal" } : { tap: "seal", dbl: "dash" }; }
function gestEligible(e) {
  return GestActive && Game.state === "play" && Input.touchMode &&
    !(e.target && e.target.closest && e.target.closest("#hud button, .overlay"));
}
window.addEventListener("touchstart", e => {
  if (!gestEligible(e)) return;
  for (const t of e.changedTouches)
    gestTouches[t.identifier] = { t: performance.now(), x: t.clientX, y: t.clientY, moved: false };
  // Block browser default actions (like pull-to-refresh) for game touches
  e.preventDefault();
}, { passive: false });
window.addEventListener("touchmove", e => {
  for (const t of e.changedTouches) {
    const g = gestTouches[t.identifier];
    if (g && Math.hypot(t.clientX - g.x, t.clientY - g.y) > GEST.MOVE_TOL) g.moved = true;
  }
}, { passive: true });
function gestEnd(e) {
  for (const t of e.changedTouches) {
    const g = gestTouches[t.identifier];
    if (!g) continue;
    delete gestTouches[t.identifier];
    if (g.moved) continue;                                 // drag → not a tap
    if (performance.now() - g.t > GEST.TAP_MAX_MS) continue; // long hold → not a tap
    const map = gestMap(), now = performance.now();
    if (now - gestLastTapT < GEST.DOUBLE_MS) {             // second tap → double action
      if (gestPendingTimer) { clearTimeout(gestPendingTimer); gestPendingTimer = null; }
      gestLastTapT = 0;
      gestFire(map.dbl);
    } else {                                               // first tap → defer the single action
      gestLastTapT = now;
      gestPendingTimer = setTimeout(() => { gestFire(map.tap); gestPendingTimer = null; }, GEST.DOUBLE_MS);
    }
  }
}
window.addEventListener("touchend", gestEnd, { passive: true });
window.addEventListener("touchcancel", e => { for (const t of e.changedTouches) delete gestTouches[t.identifier]; }, { passive: true });

/* ---------- apply the chosen control scheme (called on boot + when toggled) ---------- */
function applyCtrlScheme() {
  const gestures = Meta.ctrlScheme === "gestures";
  document.body.classList.toggle("tapgest", gestures);
  GestActive = gestures;
  if (!gestures) applyControlLayout();
}

window.addEventListener("orientationchange", () => setTimeout(applyControlLayout, 60));
/* ---------- device mode ----------
   PC_MODE decides whether the game is allowed to run with keyboard + mouse.

     • false (default) → ALWAYS mobile / touch mode. On-screen sticks and
                         touch buttons are shown and the game uses touch
                         controls. This is what ships to Google Play / iOS.
     • true            → auto-detect: keyboard + mouse on desktop, touch on
                         phones & tablets (the original behaviour).

   We default to mobile because modern iPads report a *desktop* Safari
   user-agent, so the auto-detect below leaves them stuck in PC mode with no
   on-screen controls. Flip PC_MODE to true to play with a real keyboard +
   mouse again (e.g. for desktop / itch.io builds). */
const PC_MODE = true;

if (!PC_MODE ||
    (navigator.maxTouchPoints > 0 && /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent))) {
  document.body.classList.add("touch"); Input.touchMode = true;
}
