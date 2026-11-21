/* =========================================================
   RUNEGUN · Persistent meta (the vault save)
   Meta state (bank, unlocks, equipped char/skin, control prefs) and its localStorage load/save.
   ========================================================= */
"use strict";


/* ---------- persistent meta (vault) ---------- */
const Meta = {
  bank: 1000000, volume: 0.8,
  schemaV: 3,         // save-shape version — bump when stored keys change meaning (see the metaLoad migration)
  deaths: 0,          // lifetime accepted deaths — paces the run-end interstitial
  seenTutorial: false, // has the first-launch how-to-play walkthrough played once
  seenCutscene: false, // has the intro fall cutscene played once
  unlocked: { "char:gunsmith": true, "skin:bone": true, "npc:keeper": true },
  slain: {},          // bestiary: every enemy type / "boss:<kind>" ever put down
  slainFlawless: {},  // the untouched-run twin: "boss:<kind>" ever felled with the run unscarred.
                      // Bosses only — it exists to back the FLAWLESS Play Games achievements,
                      // which are re-asserted from here at every sign-in (see leaderboard.js).
  masteredChars: [],  // characters that have reached 20 stacks of MASTERY
  runesSeen: {},      // glossary: every rune id ever carved into a gun
  char: "gunsmith", skin: "bone",
  gunSkin: null,      // warpaint worn on the GUN (SKINS key) or null = unpainted, rune-tinted barrels
  pet: null,          // equipped pet type (PTYPES key) or null for none
  aimMode: "auto",   // mobile: "auto" = 1 stick (move) + auto-aim (default) · "twin" = 2 sticks (move + aim/fire)
  deskMode: "hold",  // desktop: "hold" = aim cursor, fire on hold · "cursor" = aim cursor, auto-fire · "auto" = auto-aim + auto-fire
  ctrlScheme: "buttons", // mobile action controls: "buttons" (repositionable DASH/SEAL) · "gestures" (tap anywhere)
  btnLayout: null,   // null = stock CSS button layout · else {dash:{x,y}, seal:{x,y}} viewport FRACTIONS 0..1
  btnSize: "medium", // mobile DASH/SEAL size: "small"(54) · "medium"(68, default) · "large"(82)
  gestureSwap: false, // gestures scheme: false = tap→seal / 2×→dash (default) · true = tap→dash / 2×→seal
  haptics: true,      // vibration pulses on key combat beats (mobile only; navigator.vibrate)
  glow: "full",       // neon halo budget: "full" (default — the intended look) · "half" · "off".
                      // Trades the glow for GPU raster load; see the glow lever in canvas.js.
  juice: "full",      // kill-streak feedback: "full" · "lite" (no whole-screen effects) · "off".
                      // "lite" keeps every INFORMATIONAL element and drops every whole-screen
                      // one — the same axis serves low-end GPUs and photosensitivity.
  juiceSet: false,    // has the player chosen explicitly? OS reduced-motion only sets the
                      // default while this is false — an explicit choice always outranks it.
  bests: {            // personal records (local leaderboard — you vs your own past runs)
    score: 0,               // max Game.score
    survivedSec: 0,         // longest single run, floor(Game.time)
    wave: 0,                // max Game.wave
    depth: 0,               // max depth() (raw; display as +1)
    voidKills: 0,           // lifetime count of void bosses slain
    fastestVoidClearSec: 0, // min run-time at first void kill; 0 = never
    longestAfterVoidSec: 0, // max survival AFTER the void clear ("how long they last if they continue")
  },
  bestsHard: {        // personal records on HARD descents (lifetime void stats stay in bests above)
    score: 0,               // max Game.score on hard runs
    survivedSec: 0,         // longest single hard run
    wave: 0,                // max wave on hard
    depth: 0,               // max depth on hard
  },
runTimer: true,           // show the speedrun clock in the HUD
  speedBests: {},           // per-warden clear times, keyed "<char>" / "<char>:hard"
};
const SAVE_KEY = "runegun.meta.v2";
let storageOk = true;
function metaSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Meta)); }
  catch (e) { storageOk = false; }
}
function metaLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Meta.bank = d.bank | 0;
      Meta.deaths = d.deaths | 0;
      Meta.seenTutorial = !!d.seenTutorial;
      Meta.seenCutscene = !!d.seenCutscene;
      Meta.volume = typeof d.volume === "number" ? clamp(d.volume, 0, 1) : 0.8;
      Object.assign(Meta.unlocked, d.unlocked || {});
      Object.assign(Meta.slain, d.slain || {});
      Object.assign(Meta.slainFlawless, d.slainFlawless || {});
      Object.assign(Meta.runesSeen, d.runesSeen || {});
      Meta.masteredChars = d.masteredChars || [];
      /* grandfather returning players: anyone who already broke the Chained Warden keeps their
         Vault open (and skips the new unchaining cutscene) — the Keeper counts as already freed. */
      if (Meta.slain["boss:0"] && !Meta.unlocked["npc:keeper"]) Meta.unlocked["npc:keeper"] = true;
      if (d.char && CHARS[d.char]) Meta.char = d.char;
      if (d.skin && SKINS[d.skin]) Meta.skin = d.skin;
      if (d.gunSkin && SKINS[d.gunSkin]) Meta.gunSkin = d.gunSkin;
      if (d.pet && PTYPES[d.pet]) Meta.pet = d.pet;
      if (d.aimMode === "twin" || d.aimMode === "auto") Meta.aimMode = d.aimMode;
      if (d.deskMode === "hold" || d.deskMode === "cursor" || d.deskMode === "auto") Meta.deskMode = d.deskMode;
      if (d.ctrlScheme === "buttons" || d.ctrlScheme === "gestures") Meta.ctrlScheme = d.ctrlScheme;
      if (d.btnSize === "small" || d.btnSize === "medium" || d.btnSize === "large") Meta.btnSize = d.btnSize;
      Meta.gestureSwap = !!d.gestureSwap;
      Meta.haptics = d.haptics !== false;   // default on for saves from before the toggle existed
      /* saves from before the glow toggle existed simply keep "full" — the look they already had */
      if (d.glow === "full" || d.glow === "half" || d.glow === "off") Meta.glow = d.glow;
      /* likewise: saves from before the streak juice existed default to "full" */
      if (d.juice === "full" || d.juice === "lite" || d.juice === "off") Meta.juice = d.juice;
      Meta.juiceSet = !!d.juiceSet;
      if (d.btnLayout && typeof d.btnLayout === "object") {
        const L = d.btnLayout, ok = p => p && typeof p.x === "number" && typeof p.y === "number";
        if (ok(L.dash) && ok(L.seal))
          Meta.btnLayout = { dash: { x: clamp(L.dash.x, 0, 1), y: clamp(L.dash.y, 0, 1) },
                             seal: { x: clamp(L.seal.x, 0, 1), y: clamp(L.seal.y, 0, 1) } };
      }
      if (d.bests && typeof d.bests === "object") {
        for (const k in Meta.bests)
          if (typeof d.bests[k] === "number" && d.bests[k] >= 0) Meta.bests[k] = d.bests[k];
      }
      if (d.bestsHard && typeof d.bestsHard === "object") {
        for (const k in Meta.bestsHard)
          if (typeof d.bestsHard[k] === "number" && d.bestsHard[k] >= 0) Meta.bestsHard[k] = d.bestsHard[k];
      }
      if (d.runTimer !== undefined) Meta.runTimer = !!d.runTimer;
      if (d.speedBests && typeof d.speedBests === "object") Object.assign(Meta.speedBests, d.speedBests);
      // TODO: Remove for production
      Meta.bank = Math.max(Meta.bank, 1000000);
      Meta.unlocked["npc:keeper"] = true;

      // Auto-unlock characters, skins, and pets
      Object.keys(CHARS).forEach(id => Meta.unlocked["char:" + id] = true);
      Object.keys(SKINS).forEach(id => Meta.unlocked["skin:" + id] = true);
      Object.keys(PTYPES).forEach(id => {
        Meta.unlocked["pet:" + id] = true;
        if (PTYPES[id].upgrades) {
          Object.keys(PTYPES[id].upgrades).forEach(u => {
            const upg = PTYPES[id].upgrades[u];
            Meta.unlocked["petbuff:" + id + ":" + u] = upg.max || 1;
          });
        }
      });
      Meta.unlocked["buff:rerolls"] = 10;

      // Auto-unlock glossary
      RUNE_IDS.forEach(id => Meta.runesSeen[id] = true);
      ["chaser", "gunner", "dasher", "slammer", "spitter", "wisp", "summoner", "shade", "cinder", "slag", "slagling", "angler", "riptide"].forEach(id => Meta.slain[id] = true);
      for(let i=0; i<5; i++) {
        Meta.slain["boss:"+i] = true;
        Meta.slainFlawless["boss:"+i] = true;
      }

      /* v3 migration: THE DROWNED NAVE was wedged in before the void, pushing the
         Event Horizon from kind/floor-index 3 to 4 — carry the old void records over.
         Old depth = loop*4 + idx decomposes exactly, old idx 3 (the void) is now 4. */
      if ((d.schemaV | 0) < 3) {
        if (Meta.slain["boss:3"]) { delete Meta.slain["boss:3"]; Meta.slain["boss:4"] = true; }
        const remapDepth = v => Math.floor(v / 4) * 5 + (v % 4 === 3 ? 4 : v % 4);
        Meta.bests.depth = remapDepth(Meta.bests.depth);
        Meta.bestsHard.depth = remapDepth(Meta.bestsHard.depth);
      }
    }
  } catch (e) { storageOk = false; }
}

/* ---------- local best-records (you vs your own past runs) ----------
   Called at each run-end sink. Updates any improved personal best, saves,
   and returns a map of which keys improved (for the "NEW BEST!" highlight
   and to signal Phase-2 online submission). */
function recordBests() {
  const b = Game.hardMode ? Meta.bestsHard : Meta.bests, improved = {};
  const survived = Math.floor(Game.time), d = depth();
  const bump = (key, val, better) => { if (better) { b[key] = val; improved[key] = true; } };
  bump("score",       Game.score, Game.score > b.score);
  bump("survivedSec", survived,   survived   > b.survivedSec);
  bump("wave",        Game.wave,  Game.wave  > b.wave);
  bump("depth",       d,          d          > b.depth);
  if (Game.voidKillTime >= 0) {                       // this run reached & beat the void
    const after = Math.max(0, survived - Math.floor(Game.voidKillTime));
    /* lifetime void records live in Meta.bests regardless of mode (bestsHard has no such key) */
    if (after > Meta.bests.longestAfterVoidSec) { Meta.bests.longestAfterVoidSec = after; improved.longestAfterVoidSec = true; }
  }
  /* void records are bumped at kill time (combat.js) — merge their improved
     flags here so a record void clear still lights the NEW BEST star */
  if (Game.voidImproved) Object.assign(improved, Game.voidImproved);
  metaSave();
  return improved;
}

/* Build the "BEST · …" line shown under the run-end stats. */
function bestLineText(improved) {
  const mmss = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const b = Game.hardMode ? Meta.bestsHard : Meta.bests;
  let s = (Game.hardMode ? "HARD BEST · " : "BEST · ") + b.score + " SOULS · " + mmss(b.survivedSec) + " · WAVE " + ROMAN(b.wave) + " · FLOOR " + (b.depth + 1);
  if (Meta.bests.voidKills > 0)   // lifetime void tally — shared across modes
    s += "  |  VOID ×" + Meta.bests.voidKills + " · CLEAR " + mmss(Meta.bests.fastestVoidClearSec) + " · AFTER " + mmss(Meta.bests.longestAfterVoidSec);
  if (improved && Object.keys(improved).length) s = "★ NEW BEST! — " + s;
  return s;
}
