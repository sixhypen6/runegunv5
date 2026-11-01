/* =========================================================
   RUNEGUN · Continue — revive-on-death ("continue your run")
   On death the gate in overlays.js (gameOver) calls offerContinue();
   if a revive is available the player may sacrifice souls (current-run
   souls first, then the banked vault) OR watch a rewarded ad to keep the
   SAME run going. The soul cost escalates per revive and the run is
   capped at MAX_CONTINUES. Declining runs the normal game-over flow.
   ========================================================= */
"use strict";

const CONTINUE_BASE_COST = 3000;   // first revive; the cost climbs per tier below
const MAX_CONTINUES = 2;           // hard cap of revives per run (souls or ad, combined)
const DEATH_INTERSTITIAL_AFTER = 2; // the 1st accepted death is free; show an interstitial from the Nth onward

/* Cost of the NEXT revive: 1500, then 3000, ... */
function continueCost() { return CONTINUE_BASE_COST * (Game.continuesUsed + 1); }
function continuesLeft() { return Game.continuesUsed < MAX_CONTINUES; }
/* Spendable souls = what's in hand this run plus the bank. */
function continueSoulsAvailable() { return Game.score + Meta.bank; }

/* Pay the cost: drain current-run souls first, then the bank for any shortfall. */
function payContinueSouls(cost) {
  const fromScore = Math.min(Game.score, cost);
  Game.score -= fromScore;
  const rest = cost - fromScore;
  if (rest > 0) { Meta.bank -= rest; metaSave(); }
  updateScore();
}

/* The ward you rise under. Longer than the 1.5s new-floor grant — you come back
   standing in whatever killed you. It is spent from the moment the player chooses to
   step back in, NOT from the moment the revive was paid for: the sim is frozen behind
   the resume screen, so a grant set here would otherwise be sitting there in full
   whether they took two seconds to read the floor or two minutes. */
const REVIVE_IFRAMES = 3;

/* Bring the player back: full heal, clear incoming fire, and shove nearby (non-boss)
   foes off so you don't instantly re-die. This does NOT drop the player straight back
   into the fight — it hands off to the resume screen, which is where the run actually
   restarts (see resumeRun). Paying for a revive and being killed in the half-second
   before you had reoriented was the worst way to lose a run. */
function revivePlayer() {
  Game.continuesUsed++;
  player.hp = player.maxHp;
  player.iframes = REVIVE_IFRAMES;            // re-armed on resume; set here so nothing lands in the gap
  player.shield = player.shieldMax;           // restore BULWARK charges if carried
  ebullets.length = 0;                        // the floor "exhales" the incoming volley
  for (const e of enemies) {
    if (e.boss || e.dead) continue;
    if (dist2(e.x, e.y, player.x, player.y) < 320 * 320) {
      const a = angTo(player.x, player.y, e.x, e.y);
      e.x += Math.cos(a) * 180;
      e.y += Math.sin(a) * 180;
      collideWorld(e);
    }
  }
  updateHp(); updateScore();
  renderResume();
  setState("resume");                         // the arena shows through — read it, then step in
}

function renderResume() {
  $("resumeStatLine").textContent =
    "VIGOUR RESTORED  ·  REVIVE " + Game.continuesUsed + " / " + MAX_CONTINUES +
    (continuesLeft() ? "" : "  ·  NO MORE REMAIN");
  $("resumeWardLine").textContent =
    "the volley is scattered and the dead are shoved back — and for " + REVIVE_IFRAMES +
    " SECONDS after you step in, nothing can touch you";
}

/* Step back into the run. The sim has been frozen since the revive, so this is where
   the ward is armed, the ring goes out and the clock starts again. */
function resumeRun() {
  if (Game.state !== "resume") return;
  player.iframes = Math.max(player.iframes, REVIVE_IFRAMES);
  shockwaves.push({ x: player.x, y: player.y, r: 6, max: 300, speed: 900,
    dmg: 0, hostile: false, hitSet: new Set() });   // harmless ring — pure feedback
  try { AudioFX.portal(); } catch (e) {}
  setState("play");
  toast("YOU RISE AGAIN");
}

/* Death gate entry point. Returns true if a continue was offered (overlay
   shown), false if none is available and the caller should run game-over. */
let adInFlight = false;   // an ad is loading/showing — freeze the overlay so the run can't end under it
let adInFlightSince = 0;  // when the lock went on — see adStuck()

/* Last resort. ads.js now bounds both the load and show phases, so the promise
   should always settle and lift the lock. But this lock disables every exit from
   the death overlay, and the cost of being wrong is a force-quit and a lost run —
   so if it has somehow outlived the longest watchdog, treat it as broken and let
   the player out rather than trusting the ad layer to be perfect. */
const AD_STUCK_MS = 100000;   // > ads.js SHOW_WATCHDOG_MS (90s), plus slack
function adStuck() { return adInFlight && (performance.now() - adInFlightSince) > AD_STUCK_MS; }
function adBlocking() { return adInFlight && !adStuck(); }

function offerContinue() {
  if (!player || !continuesLeft()) return false;
  adInFlight = false;
  Ads.preload();                 // make sure a rewarded ad is armed before the button is tapped
  const cost = continueCost();
  const canSouls = continueSoulsAvailable() >= cost;
  const canAd = Ads.available();
  if (!canSouls && !canAd) return false;
  renderContinue(canSouls, canAd, cost);
  setState("continue");
  return true;
}

function renderContinue(canSouls, canAd, cost) {
  const soulBtn = $("btnContSoul");
  soulBtn.textContent = "SACRIFICE " + cost + " SOULS";
  soulBtn.style.display = canSouls ? "" : "none";
  $("btnContAd").style.display = canAd ? "" : "none";
  $("contStatLine").textContent =
    "YOU HOLD " + continueSoulsAvailable() + " SOULS  ·  REVIVE " +
    (Game.continuesUsed + 1) + " / " + MAX_CONTINUES;
}

function acceptSoulContinue() {
  if (Game.state !== "continue" || adBlocking()) return;
  const cost = continueCost();
  if (continueSoulsAvailable() < cost) { toast("NOT ENOUGH SOULS"); return; }
  payContinueSouls(cost);
  revivePlayer();
}

function acceptAdContinue() {
  if (Game.state !== "continue" || adBlocking()) return;
  if (!Ads.available()) return;
  adInFlight = true;                                  // lock the overlay; the run can't end mid-ad
  adInFlightSince = performance.now();
  if (!Ads.rewardedReady()) toast("LOADING AD…");     // preloaded → instant, so only toast if not ready
  /* The lock is released on EVERY outcome, not just the resolve path. While it is
     set, decline / sacrifice / hardware-back are all disabled (see the guards
     below and native.js), so a promise that rejected here would seal the player
     into the death overlay with force-quit as the only way out. showRewarded() is
     written not to reject, but this must not depend on the callee's discipline. */
  Ads.showRewarded()
    .catch(e => { noteCrash("continue.showRewarded", e); return false; })
    .then(rewarded => {
      adInFlight = false;
      if (rewarded) { revivePlayer(); return; }       // reward earned → continue the run
      if (Game.state === "continue") toast("AD NOT COMPLETED");
    });
}

function declineContinue() {
  if (Game.state !== "continue" || adBlocking()) return;
  adInFlight = false;   // escaping a stuck lock — don't leave it set behind us
  doGameOver();
}

/* Called once per run that ends in death (from doGameOver). The first accepted
   death is free; from the DEATH_INTERSTITIAL_AFTER-th onward, every death shows a
   full-screen interstitial. The count is lifetime (persisted in Meta), so it does
   not reset between runs or app restarts. No-op off the native Android shell. */
function noteAcceptedDeath() {
  Meta.deaths = (Meta.deaths | 0) + 1;
  metaSave();
  if (Meta.deaths >= DEATH_INTERSTITIAL_AFTER) Ads.showInterstitial();
}

/* The overlay markup is parsed before this script runs, so wire the buttons now. */
$("btnContSoul").addEventListener("click", acceptSoulContinue);
$("btnContAd").addEventListener("click", acceptAdContinue);
$("btnContDecline").addEventListener("click", declineContinue);
$("btnResumeRun").addEventListener("click", resumeRun);
