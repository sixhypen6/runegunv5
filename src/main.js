/* =========================================================
   RUNEGUN · Boot & main loop
   Loads the save, primes the menu, and drives the single requestAnimationFrame loop that dispatches per state.
   ========================================================= */
"use strict";

/* =========================================================
   BOOT + MAIN LOOP
   ========================================================= */
metaLoad();
applyGlow();         // set the halo budget from the save before the first frame paints
/* the OS motion switch only sets the DEFAULT — once the player picks in Settings, their
   choice wins forever. Deliberately not saved: re-reading it each launch means toggling
   the Android setting takes effect without the game having overwritten it. */
if (!Meta.juiceSet && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) Meta.juice = "off";
document.body.classList.toggle("juiceOff", Meta.juice === "off");
refreshMenu();
applyButtonSize();   // set the --tbtn size var + clamp bounds before first layout/paint
applyCtrlScheme();   // apply saved on-screen control scheme + custom button layout

let last = performance.now();
let bgSkip = 0, bgDt = 0;   // menu-backdrop throttle behind near-opaque overlays
function frame(now) {
  /* The re-arm lives in `finally`: a throw anywhere in the tick must not be able
     to stop the loop. Nothing else in the app calls requestAnimationFrame(frame),
     so an escaping error would freeze the last painted frame forever — and on a
     shipped device there is no console to see it in. One bad frame is dropped
     and the next one is attempted instead. */
  try {
    let dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (Game.state === "cutscene") { cutsceneFrame(dt); }
    else if (Game.state === "vaultcut") { vaultCutsceneFrame(dt); }
    else if (Game.state === "tutorial") { tutorialFrame(dt); }
    else if (Game.state === "ending") { endingFrame(dt); }
    else {
      if (Net.role === "guest" && Coop.running) {
        /* the guest's frame: apply snapshots + predict + cosmetics.
           It also runs behind wait/rune overlays so the arena keeps breathing. */
        if (Game.state === "play" || Game.state === "wait" || Game.state === "rune" || Game.state === "held") Coop.updateGuest(dt);
      }
      else if (Game.state === "play") update(dt);
      if (Net.role === "host" && Coop.running) Coop.hostTick(dt);
      /* "leaderboard" belongs here with the other menu-side overlays: `player` is
         never nulled once a run has started, so without it THE RECKONING opened
         after a run painted the stale arena behind the overlay instead of the
         menu background. */
      if (Game.state === "menu" || Game.state === "vault" || Game.state === "glossary" ||
          Game.state === "leaderboard" || Game.state === "lobby" || !player) {
        /* Vault / glossary / leaderboard sit on a 90%-opaque overlay — the void
           backdrop is barely visible through it, yet it was redrawing its full
           glow pipeline at 60fps (and the vault runs its own Keeper rAF on top).
           Behind those overlays it redraws at quarter rate; dt accumulates
           across the skipped frames so its motion speed is unchanged. */
        const covered = Game.state === "vault" || Game.state === "glossary" || Game.state === "leaderboard" || Game.state === "lobby";
        if (covered && (bgSkip = (bgSkip + 1) % 4)) bgDt += dt;
        else { menuFrame(dt + bgDt); bgDt = 0; }
      }
      else if (typeof draw === "function") draw();
    }
  } catch (e) {
    noteCrash("frame", e);
  } finally {
    requestAnimationFrame(frame);
  }
}
requestAnimationFrame(frame);

/* Prompt before reload/close if a run is active.
   Prevents accidental refreshes / back swipes from losing run progress. */
window.addEventListener("beforeunload", e => {
  if (Game.state === "play" || Game.state === "pause" || Game.state === "rune" || Game.state === "choice") {
    e.preventDefault();
    e.returnValue = ""; // Standard way to trigger the browser's leave-site dialog
  }
});
