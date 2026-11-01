/* =========================================================
   RUNEGUN · Game state
   The central mutable Game object: run progress, wave/score, camera, screen-shake and pending interactions.
   ========================================================= */
"use strict";


/* =========================================================
   GAME STATE
   ========================================================= */
const Game = {
  state: "menu",   // menu | vault | play | pause | held | rune | choice | continue | dead
  wave: 0, score: 0, kills: 0, time: 0,
  /* the build (runes / lockedRunes / rerolls / mods / maxHpMul / bonusRuneSlots)
     lives on each player object now — co-op wardens carve separate paths */
  nextId: 1,                    // monotonic entity id, assigned at every spawn (net sync)
  mapIdx: 0, loop: 0,
  chestsTotal: 4, chestsOpened: 0,
  shake: 0, flash: 0, hitstop: 0,
  slowmo: 0,                    // boss-death slow-motion: while > 0, sim dt is scaled down
  ceremonyT: 0,                 // boss-death ceremony countdown; opens the reward choice when it expires
  comboN: 0, comboT: 0,         // rapid-kill streak counter + its decay window
  streakTier: -1,               // highest STREAK_TIERS index the live streak has reached (-1 = none)
  soulFrac: 0,                  // carried fractional streak bonus — see the payout in killEnemy
  streakHsT: -1,                // Game.time of the last streak hitstop — gates its 0.14s cooldown
  streakFlashT: -1,             // Game.time of the last streak flash — 0.5s photosensitivity floor
  flashCol: null,               // "r,g,b" the screen flash paints with; null = the legacy red
  floorFade: 0,                 // 1 → 0 black fade drawn over the floor swap
  voidImproved: null,           // void records improved this run (merged into recordBests' map)
  cam: { x: 0, y: 0 },
  intermission: 0, ambush: null,
  boss: null, bossPhaseToast: 0,
  bossRocks: [],
  pendingPickup: null,
  pendingPickupBy: 0,     // index into players[] of the warden choosing the rune
  banked: false,
  continuesUsed: 0,      // revives taken this run (souls or ad) — capped at MAX_CONTINUES
  flawless: true,         // no damage taken the ENTIRE run so far — one hit forfeits it for every stage after
  flawlessToast: 0,       // FLAWLESS banner countdown, set when a warden falls with the run still untouched
  flawlessAward: 0,       // bonus souls the banner displays
  /* THE UNKNOWN — the rift offered after the first Warden falls */
  maxHpMul: 1,            // halved (0.5) for the rest of the run if you take the rift
  bonusRuneSlots: 0,      // the unknown carves an extra rune slot
  riftOffered: false, riftDone: false, inRift: false,
  riftCreature: null,
  voidConquered: false,   // has the Event Horizon (void boss) fallen this run
  voidKillTime: -1,       // Game.time at the FIRST void kill this run (-1 = not yet); anchors post-void survival
  hardMode: false,        // HARD descent: +50% enemy & warden HP. Set only by the menu mode
                          // chooser; NOT reset in resetRun() so DESCEND/ASCEND AGAIN repeats the mode.
};
