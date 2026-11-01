/* =========================================================
   RUNEGUN · Runes — stacking weapon mods
   Every rune and its stacking modifier, the loot pool / path-sealing rules, weapon-stat assembly and recompute.
   ========================================================= */
"use strict";


/* =========================================================
   RUNES — every rune stacks: mod(m, n) where n = stacks held
   ========================================================= */
const RUNES = {
  scatter: { name: "SCATTER", glyph: "ᛋ", color: "#ffd23d",
    desc: "+2 bullets per stack in a widening fan. Each bullet hits a little softer.",
    mod: (m, n) => { m.count += 2 * n; m.spread += 0.3 * n; m.dmg *= Math.pow(0.8, n); } },

  glasscannon: {
    name: "GLASS CANNON", glyph: "ᛥ", color: "#ffffff",
    desc: "Deal +15% damage per stack. Take +8% more damage per stack (caps at +64%). Grants explosive speed the closer you are to death (up to 2.5x velocity).",
    mod: function(m, n) {
      m.dmg *= Math.pow(1.15, n); // 1. Offense: +15% damage per stack layer
      let incomingPenalty = 0.08 * n; // 2. Defense: Take +8% damage per stack (cap at 64%)
      if (incomingPenalty > 0.64) incomingPenalty = 0.64;
      m.dr -= incomingPenalty; 
      if (typeof player !== 'undefined' && player.maxHp > 0) { 
        let missingHealthFrac = (player.maxHp - player.hp) / player.maxHp;
        let speedBoostScalar = 1.0 + (missingHealthFrac * 1.5);
        if (speedBoostScalar > 2.5) speedBoostScalar = 2.5;
        m.speed *= speedBoostScalar; /* 3. Speed Curve: Moves faster the lower your active HP is (up to 2.5x max) */
      }}},

    heavy: { name: "HEAVY", glyph: "ᚻ", color: "#ff8a3d",
    desc: "A hand-cannon. Per stack: huge damage and brutal knockback, but it fires much slower. One devastating slug at a time.",
    mod: (m, n) => { m.dmg *= Math.pow(1.9, n); m.rate *= Math.pow(0.7, n); m.size *= Math.pow(1.08, n); m.knock *= Math.pow(1.6, n); } },
  rapid: { name: "RAPID", glyph: "ᚱ", color: "#ffffff",
    desc: "Per stack: fire rate way up, damage a touch down.",
    mod: (m, n) => { m.rate *= Math.pow(1.45, n); m.dmg *= Math.pow(0.92, n); m.spread += 0.04 * n; } },
  venom: { name: "VENOM", glyph: "ᛢ", color: "#7dff5e",
    desc: "Bullets burst into poison puddles. Stacks widen the puddles and sharpen the poison.",
    mod: (m, n) => { m.venom += n; } },
  ember: { name: "EMBER", glyph: "ᛟ", color: "#ff4d2e",
    desc: "Hits set enemies on fire. Stacks make the burn fiercer and longer.",
    mod: (m, n) => { m.ember += n; } },
  frost: { name: "FROST", glyph: "ᛁ", color: "#5ee6ff",
    desc: "Hits chill enemies. Stacks deepen and lengthen the slow.",
    mod: (m, n) => { m.frost += n; } },
  pierce: { name: "PIERCE", glyph: "ᛏ", color: "#e8e2d0",
    desc: "Bullets punch through 3 extra bodies per stack.",
    mod: (m, n) => { m.pierce += 3 * n; } },
  ricochet: { name: "RICOCHET", glyph: "ᛉ", color: "#9d6bff",
    desc: "Bullets bounce off stone 3 extra times per stack.",
    mod: (m, n) => { m.bounce += 3 * n; } },
  seeker: { name: "SEEKER", glyph: "ᛇ", color: "#ff6bd6",
    desc: "Bullets curve toward enemies. Stacks tighten the curve.",
    mod: (m, n) => { m.homing += 4.5 * n; } },
  titan: { name: "TITAN", glyph: "ᚦ", color: "#c9b27a",
    desc: "Per stack: fires a slow, enormous boulder that bulldozes through +4 more foes and hurls them aside. Modest punch per hit — it's about flattening the crowd, not the single kill.",
    mod: (m, n) => { m.size *= Math.pow(1.6, n); m.speed *= Math.pow(0.8, n); m.pierce += 4 * n; m.knock *= Math.pow(1.6, n); m.dmg *= Math.pow(1.12, n); } },
  twin: { name: "TWIN", glyph: "ᛗ", color: "#a0ffe6",
    desc: "One extra parallel bullet per stack (up to 6). Beyond 6, each stack grants +20% damage.",
    mod: (m, n) => {
      const bullets = Math.min(n, 6);
      const extraDmg = Math.max(0, n - 6);
      m.twin += bullets;
      if (extraDmg > 0) m.dmg *= (1 + extraDmg * 0.2);}},
  leech: { name: "LEECH", glyph: "ᛚ", color: "#ff4d5e",
    desc: "Kills restore 0.2 vitality per stack, up to a maximum of 1 vitality per kill.",
    mod: (m, n) => { m.leech += 0.2 * n; } },
  nova: { name: "NOVA", glyph: "ᛞ", color: "#ffae5e",
    desc: "Slain enemies detonate, scorching everything nearby. Stacks grow the blast.",
    mod: (m, n) => { m.nova += n; } },
  storm: { name: "STORM", glyph: "ᛣ", color: "#bfe3ff",
    desc: "Hits arc lightning to nearby enemies. Stacks add jumps and voltage.",
    mod: (m, n) => { m.storm += n; } },
  splinter: { name: "SPLINTER", glyph: "ᚲ", color: "#d0c4ff",
    desc: "Slain enemies burst into shrapnel that wounds their kin. Stacks add shards.",
    mod: (m, n) => { m.splinter += n; } },
  swift: { name: "SWIFT", glyph: "ᚾ", color: "#9effc4",
    desc: "+12% movement speed per stack. Carve enough and outrun bullets.",
    mod: (m, n) => { m.moveMul *= Math.pow(1.12, n); } },
  bulwark: { name: "BULWARK", glyph: "ᛒ", color: "#e0a86b",
    desc: "A shield orbits you, soaking one hit then bursting to sear nearby foes. Each stack holds one more charge — up to 3 — and further stacks deepen the blast. Spent charges return one at a time.",
    mod: (m, n) => { m.shield = n; } },
  phase: { name: "PHASE", glyph: "ᚷ", color: "#7ad7ff",
    desc: "Dash recharges faster and leaves a cutting wake that inherits your elemental kit (Burn, Chill, Poison, Storm, Bleed). Shredder's melee dominance makes the wake smaller.",
    mod: (m, n, char) => {
      m.dashCdMul *= Math.pow(0.85, n);
      const wakeMul = (char === "shredder") ? 0.4 : 1.0;
      m.dashTrail += n * wakeMul;
      m.dashClip += n;}},
  mirror: { name: "MIRROR", glyph: "ᛖ", color: "#f3c4ff",
    desc: "Fires a copy of your shot backwards per stack. Watch your six — it's armed.",
    mod: (m, n) => { m.mirror += n; } },
  velocity: { name: "VELOCITY", glyph: "ᚢ", color: "#fff89e",
    desc: "Per stack: bullets fly 20% faster and hit 8% harder.",
    mod: (m, n) => { m.speed *= Math.pow(1.2, n); m.dmg *= Math.pow(1.08, n); } },
  reaper: { name: "REAPER", glyph: "ᛦ", color: "#c4c9d4",
    desc: "Hits execute weakened enemies outright. Stacks raise the threshold. Wardens resist.",
    mod: (m, n) => { m.execute = Math.min(0.5, m.execute + 0.08 * n); } },
  midas: { name: "MIDAS", glyph: "ᚠ", color: "#ffd23d",
    desc: "+25% souls from every kill per stack.",
    mod: (m, n) => { m.midas += 0.25 * n; } },
  quarry: { name: "QUARRY", glyph: "ᚩ", color: "#b6ff4d",
    desc: "Your gun savors the wounded — bullets bite +20% harder per stack into anything burning, chilled or bleeding. The finisher every elemental build was missing.",
    mod: (m, n) => { m.prey *= Math.pow(1.2, n); } },
  puncture: { name: "PUNCTURE", glyph: "ᛈ", color: "#ffd23d",
    desc: "Every shot can find the gap in the armor — a chance to strike for more than double. Each stack raises the odds, up to 60%. Bosses bleed too.",
    mod: (m, n) => { m.crit = Math.min(0.6, m.crit + 0.12 * n); } },
  wrath: { name: "WRATH", glyph: "ᚨ", color: "#ff3d2e",
    desc: "The closer to death, the deadlier the gun — up to +50% damage per stack, scaling from nothing at full vitality to its peak near death. Zero risk while healthy.",
    mod: (m, n) => { m.wrath += 0.5 * n; } },
  aegis: { name: "AEGIS", glyph: "ᛝ", color: "#bcd0ff",
    desc: "Carved wards bleed the force from every blow before it lands. Each stack shaves 12% off the damage you take, up to a 60% ward — never enough to make you untouchable.",
    mod: (m, n) => { m.dr = Math.min(0.6, m.dr + 0.12 * n); } },
  bramble: { name: "BRAMBLE", glyph: "ᛕ", color: "#ff6b8a",
    desc: "Strike the warded and the wards strike back. When something wounds you, a ring of barbed force erupts and tears into whatever dared. Stacks sharpen the barbs.",
    mod: (m, n) => { m.thorns += n; } },
  mend: { name: "MEND", glyph: "ᚧ", color: "#8effb0",
    desc: "Your wounds knit closed when you go untouched. Each stack mends a little faster and shortens the lull before the mending begins. Taking a hit stalls it.",
    mod: (m, n) => { m.regen += 0.35 * n; m.regenDelay = Math.max(1.8, 3 - 0.3 * n); } },
  maelstrom: { name: "MAELSTROM", glyph: "ᚳ", color: "#8a6bff",
    desc: "Some slain foes tear open a brief gravity well that gently gathers the living into a knot. It deals no damage — it only sets the table for whatever you bring next. Stacks make wells form more often and reach wider.",
    mod: (m, n) => { m.vortex = Math.min(4, m.vortex + n); } },
  dread: { name: "DREAD", glyph: "ᚹ", color: "#9d9db8",
    desc: "Some wounds carry a whisper of the void. Struck foes may break and flee, running blind — gunners stop firing, swarms scatter. Stacks make terror take hold more often and linger.",
    mod: (m, n) => { m.fear = Math.min(0.5, m.fear + 0.1 * n); m.fearDur = 1 + 0.35 * n; } },
  stillpoint: { name: "STILLPOINT", glyph: "ᚤ", color: "#6be0d4",
    desc: "The air around you thickens — time drags within arm's reach. Enemies and even their bullets crawl inside the bubble. Stacks widen the field and deepen the lull.",
    mod: (m, n) => { m.timeField = Math.min(3, m.timeField + n); m.timeR = 110 + 42 * m.timeField; m.timeMul = Math.max(0.35, 0.6 - 0.08 * m.timeField); } },
  prickle: { name: "PRICKLE", glyph: "ᛡ", color: "#d6e85a",
    desc: "A bristling thornfield rings you, pricking any foe that strays too close for a slow trickle of damage. Each stack widens the ring of barbs and sharpens the thorns.",
    mod: (m, n) => { m.prickle += n; m.prickleR = 50 + 20 * m.prickle; } },
  slime: { name: "SLIME", glyph: "ᛠ", color: "#86d020",
    desc: "You leave a slick of caustic slime in your wake that lingers, then fades. Anything that wades through it festers with damage over time. Stacks thicken and widen the trail.",
    mod: (m, n) => { m.slime += n; } },
  reprieve: { name: "REPRIEVE", glyph: "ᛤ", color: "#bcd0ff",
    desc: "When you would fall, time crystallizes — enemies freeze for 1 second per stack (and pause their attacks). Restore half your max vitality and gain bonus healing equal to stack% of max HP (max 80%). Gain invulnerability: 0.67 seconds per stack (max 2s). Cooldown: 1 + 2×stack seconds.",
    mod: (m, n) => { m.reprieveStacks = n; } },
  bleed: { name: "BLEED", glyph: "ᛊ", color: "#ff4d5e",
    desc: "Hits inflict bleeding. Stacks make the bleed longer and more painful.",
    mod: (m, n) => { m.bleed += n; } },
  sniper: { name: "SNIPER", glyph: "ᚿ", color: "#fff3c8",
    desc: "The farther you are from the target, the harder you hit (+15% dmg per 100px per stack). Increases base damage (+60%) and bullet speed (+50%), but lowers fire rate (-35%). Incompatible with SCATTER.",
    mod: (m, n) => { m.dmg *= Math.pow(1.6, n); m.rate *= Math.pow(0.65, n); m.speed *= Math.pow(1.5, n); m.sniper += n; } },
  echo: { name: "ECHO", glyph: "ᚼ", color: "#f3c4ff",
    desc: "Every 5th hit discharges your full gun shot from the enemy's position. Melee strikes count as 2 hits. Stacks reduce the hits needed (down to every 2nd hit).",
    mod: (m, n) => { m.echo += n; } },
  warp: { name: "WARP", glyph: "ᚥ", color: "#9d6bff",
    desc: "A shifting blade in reality. Dashing TOWARD an enemy triggers DIMENSIONAL SHRED: you instantly slice through 3 phantom paths around the target before reappearing.",
    mod: (m, n) => { m.warp += n; } },
  mastery: { name: "MASTERY", glyph: "ᛘ", color: "#ffd23d",
    desc: "The Great Awakener. Grants a powerful unique effect based on your Gunslinger's mastery of their weapon.",
    mod: (m, n) => { m.mastery += n; } },
  vampire: { name: "VAMPIRE", glyph: "ᛔ", color: "#ff4d5e",
    desc: "Savor the blood. Deal +30% damage and heal 0.25 vitality per stack on hits against BLEEDING enemies. Excess healing raises your max vitality (up to 2× base). Only appears if you hold a BLEED rune.",
    mod: (m, n) => { m.vampire += n; } },
  stealth: { name: "STEALTH", glyph: "ᚬ", color: "#8a86a0",
    desc: "Enemies do not auto-track you; they wander blindly. Entering their detection cone alerts them and nearby foes. Stacks narrow their vision and delay wave spawns (+3s per stack).",
    mod: (m, n) => { m.stealth += n; } },


};
let RUNE_IDS = Object.keys(RUNES);

/* the pool new runes roll from: every rune until the warden seals into four, then only those four.
   Per-player now — every function below takes the warden `p` whose build it touches. */
function runePool(p) {
  let ids = p.lockedRunes || RUNE_IDS;
  // Mutual exclusion: Sniper vs Scatter
  if (p.runes.scatter > 0) ids = ids.filter(id => id !== "sniper");
  if (p.runes.sniper > 0) ids = ids.filter(id => id !== "scatter");

  // Requirement: Vampire needs Bleed
  const hasBleed = p.runes.bleed > 0;
  if (!hasBleed) ids = ids.filter(id => id !== "vampire");

  // Character Restriction: Sniper is terrible for Wraith and Shredder
  if (p.char === "wraith" || p.char === "shredder") {
    ids = ids.filter(id => id !== "sniper");
  }

  // Hidden Runes: only for hidden characters
  const isHiddenChar = CHARS[p.char] && CHARS[p.char].hidden;
  if (!isHiddenChar) {
    ids = ids.filter(id => id !== "exterminate" && id !== "runegun");
  } else {
    // RUNEGUN is JOHN RUNEGUN exclusive
    if (p.char !== "john") ids = ids.filter(id => id !== "runegun");
  }

  return ids;
}
function genThreeRunes(p) {
  const pool = runePool(p);
  const avail = [...pool];

  // Vampire bias: if we have bleed, add vampire to the candidates list multiple times
  if (p.runes.bleed > 0 && avail.includes("vampire")) {
    for (let i = 0; i < 4; i++) avail.push("vampire");
  }

  const ids = [];
  for (let i = 0; i < 3 && avail.length > 0; i++) {
    const idx = Math.floor(Math.random() * avail.length);
    const id = avail[idx];
    ids.push(id);
    // Remove all instances of the picked id to prevent duplicates in choice
    for (let j = avail.length - 1; j >= 0; j--) if (avail[j] === id) avail.splice(j, 1);
  }
  while (ids.length < 3) ids.push(ids[ids.length - 1]);
  return ids;
}
const heldRuneIds = p => Object.keys(p.runes).filter(id => p.runes[id] > 0);
/* how many distinct runes a character may carve before the gun seals (ALCHEMIST gets a fifth,
   and THE UNKNOWN grants one more on top of that) */
function runeSlotCount(p) { return ((CHARS[p.char] && CHARS[p.char].runeSlots) || 4) + (p.bonusRuneSlots || 0); }
/* once that many DIFFERENT runes are carved, the gun seals to them for the rest of the descent */
function checkRuneLock(p) {
  if (p.lockedRunes) return;
  const slots = runeSlotCount(p);
  const distinct = heldRuneIds(p);
  if (distinct.length >= slots) {
    p.lockedRunes = distinct.slice(0, slots);
    const glyphs = p.lockedRunes.map(id => RUNES[id].glyph).join("  ");
    if (p === localPlayer()) toast("YOUR PATH IS SEALED — ONLY  " + glyphs + "  WILL ANSWER NOW");
    floatText(p.x, p.y - 32, "RUNES SEALED", "#ffd23d");
    AudioFX.chest();
    refreshRuneStrip();
  }
}

function buildWeaponModsFrom(p) {
  if (!p || !p.runes) return {};
  const runes = p.runes, char = p.char;
  const m = { dmg: 10, rate: 4.5, spread: 0.055, speed: 540, size: 4, count: 1,
    pierce: 0, bounce: 0, homing: 0, knock: 60, twin: 0, mirror: 0,
    venom: 0, ember: 0, frost: 0, leech: 0,
    nova: 0, storm: 0, splinter: 0, execute: 0, midas: 0,
    moveMul: 1, hpBonus: 0, dashCdMul: 1, dashTrail: 0, shield: 0,
    prey: 1, crit: 0, critMul: 2.2, wrath: 0, dr: 0, thorns: 0,
    regen: 0, regenDelay: 3, vortex: 0, fear: 0, fearDur: 0,
    timeField: 0, timeR: 0, timeMul: 0, prickle: 0, prickleR: 0, slime: 0, bleed: 0, sniper: 0, echo: 0, vampire: 0, stealth: 0, dashClip: 0,
    mastery: 0, potency: 1 };
  /* a character may reshape the bare gun before any rune speaks (JUGGERNAUT's massive slow slug) */
  const wb = CHARS[char] && CHARS[char].weaponBase;
  if (wb) Object.assign(m, wb);

  // Alchemist Mastery: Potency pre-recalc
  if (char === "alchemist" && runes.mastery) {
    m.potency = 1 + 0.15 * runes.mastery;
  }

  for (const id in runes) {
    const n = runes[id];
    if (n > 0 && RUNES[id]) {
      // Potency applies a multiplier to the *effective stacks* for scaling functions
      RUNES[id].mod(m, n * (id === "mastery" ? 1 : m.potency), char);
    }
  }

  // Mastery Synergies (Post-rune calc)
  const mn = runes.mastery || 0;
  if (mn > 0) {
    if (char === "gunsmith") m.dmg *= (1 + 0.15 * mn);
    if (char === "shredder") { m.size *= (1 + 0.1 * mn); m.speed *= (1 + 0.15 * mn); }
    if (char === "necromancer") { m.thrallSpawnBonus = 0.25 * mn; m.thrallStatBonus = 1 + 0.3 * mn; }
    if (char === "wraith") { m.veilRBonus = 50 * mn; m.veilInvulBonus = 0.12 * mn; }
    if (char === "juggernaut") { m.truePierce = true; m.dmg *= (1 + 0.1 * mn); }
    if (char === "demolitionist") { m.shardWaves = 1 + mn; }
  }

  // SANCHO REWORK: Hardblood Stat Scaling
  if (char === "sancho") {
    const hbPower = Math.floor((p.hardblood || 0) / 6);
    m.dmg *= (1 + hbPower * 0.1);
    m.dr = Math.min(0.9, m.dr + (hbPower * 0.1)); // Clamp individual character DR

    p.weaponMode = p.weaponMode || "melee";
    const stage = p.hbStage || 1;
    if (p.weaponMode === "melee") {
       if (stage === 3) { m.size = 130; m.rate = 4.2; m.dmg = 26; } // Lance: Auto-fire, balanced rate
       else if (stage === 2) { m.size = 90; m.rate = 5.2; m.dmg = 18; } // Saber
       else { m.size = 65; m.rate = 4.5; m.dmg = 12 + (p.sanchoBonusDmg || 0); } // Fists
    } else { // BOW: "Death from a hundred cuts"
       const hbScale = Math.floor((p.hardblood || 0) / 10);
       m.dmg = 7 + hbScale * 2;
       m.rate = 6.5 + hbScale * 1.0;
       m.size = 6; m.speed = 1000; m.count = 2; m.spread = 0.04;
       m.pierce += hbScale; // HB 10+ (+1), HB 20+ (+2)
    }
  }

  // Shredder Special Buffs: convert bullet stats into melee power
  if (char === "shredder") {
    // Twin: parallel saws (massive damage and shred rate bonus)
    if (m.twin > 0) {
      m.dmg *= (1 + m.twin * 0.4); // +40% dmg per twin stack
      m.rate *= (1 + m.twin * 0.25); // +25% shred rate per twin stack
    }
    // Scatter: massive size bonus for the saw + bonus reach
    const scatterStacks = runes.scatter || 0;
    if (scatterStacks > 0) {
      m.size += scatterStacks * 60;
      m.dmg *= (1 + scatterStacks * 0.1);
    }
    // Ricochet/Pierce: add "Serration" damage bonus + shards grow deadlier
    const bounceStacks = runes.ricochet || 0;
    const pierceStacks = runes.pierce || 0;
    if (bounceStacks > 0 || pierceStacks > 0) {
      m.dmg *= (1 + (bounceStacks * 0.1 + pierceStacks * 0.1));
    }
    // Bullet Speed: increases saw range and rotation speed
    if (m.speed > 540) {
       m.size += (m.speed - 540) * 0.15;
    }
  }

  m.rate = clamp(m.rate, 0.8, 20);
  m.count = Math.min(m.count, 40);
  m.twin = Math.min(m.twin, 6);                           // parallel shots × fire rate is the puddle/perf multiplier
  m.size = clamp(m.size, 2, 320);
  m.speed = clamp(m.speed, 120, 1600);
  m.leech = Math.min(m.leech, 1);                         // hard cap: 1 vitality per kill
  m.leechMax = m.leech >= 1;                              // flag for "MAX" display
  m.shieldMax = Math.min(m.shield, 3);                    // charges cap at 3 stacks
  m.shieldDmg = m.shield > 0 ? 30 + 18 * (m.shield - 1) : 0; // every stack deepens the burst
  m.shieldR = 130;
  return m;
}

/* What a single rune is actually contributing right now, at its current stack count.
   Computed by diffing the full weapon against the weapon with this rune removed. */
function runeStatLines(p, id) {
  const n = p.runes[id] || 0;
  if (!n) return [];
  const full = buildWeaponModsFrom(p);
  const less = Object.assign({}, p.runes); delete less[id];
  const dummyLess = { runes: less, char: p.char, hardblood: p.hardblood, hbStage: p.hbStage, weaponMode: p.weaponMode };
  const w = buildWeaponModsFrom(dummyLess);
  const L = [];
  const mul = r => (r >= 1 ? "+" : "\u2212") + Math.round(Math.abs(r - 1) * 100) + "%";
  const di = (a, b) => Math.round(a - b);
  if (Math.abs(full.dmg / w.dmg - 1) > 0.005) L.push("DAMAGE " + mul(full.dmg / w.dmg));
  if (Math.abs(full.rate / w.rate - 1) > 0.005) L.push("FIRE RATE " + mul(full.rate / w.rate));
  if (full.count !== w.count) L.push("+" + di(full.count, w.count) + " BULLETS PER SHOT");
  if (full.twin !== w.twin) L.push("+" + di(full.twin, w.twin) + " PARALLEL SHOT");
  if (full.mirror !== w.mirror) L.push("+" + di(full.mirror, w.mirror) + " REAR SHOT");
  if (Math.abs(full.spread - w.spread) > 0.001) L.push("SPREAD +" + Math.round((full.spread - w.spread) * 57) + "\u00b0");
  const sizeLabel = p.char === "shredder" ? "SAW SIZE " : "BULLET SIZE ";
  if (Math.abs(full.size / w.size - 1) > 0.005) L.push(sizeLabel + mul(full.size / w.size));
  if (Math.abs(full.speed / w.speed - 1) > 0.005) L.push("BULLET SPEED " + mul(full.speed / w.speed));
  if (full.pierce !== w.pierce) L.push("+" + di(full.pierce, w.pierce) + " PIERCE");
  if (full.bounce !== w.bounce) L.push("+" + di(full.bounce, w.bounce) + " BOUNCE");
  if (Math.abs(full.knock / w.knock - 1) > 0.005) L.push("KNOCKBACK " + mul(full.knock / w.knock));
  if (full.homing !== w.homing) L.push("HOMING PULL " + full.homing.toFixed(1));
  if (Math.abs(full.moveMul / w.moveMul - 1) > 0.005) L.push("MOVE SPEED " + mul(full.moveMul / w.moveMul));
  if (full.hpBonus !== w.hpBonus) L.push("+" + di(full.hpBonus, w.hpBonus) + " MAX VITALITY");
  if (full.shieldMax !== w.shieldMax) L.push("SHIELD ABSORBS " + full.shieldMax + " HIT" + (full.shieldMax === 1 ? "" : "S"));
  if (full.shieldDmg !== w.shieldDmg) L.push("SHIELD BURST " + full.shieldDmg + " DMG");
  if (Math.abs(full.dashCdMul / w.dashCdMul - 1) > 0.005) L.push("DASH COOLDOWN " + mul(full.dashCdMul / w.dashCdMul));
  /* status / on-kill effects — magnitude attributed entirely to this rune */
  if (full.ember !== w.ember) { const e = full.ember; L.push("BURN " + (2 + 2 * e) + " DMG / 0.45s FOR " + (2 + e) + "s"); }
  if (full.frost !== w.frost) { const f = full.frost; L.push("CHILL \u2014 SLOW ENEMIES FOR " + (1 + 0.7 * f).toFixed(1) + "s"); }
  if (full.venom !== w.venom) { const v = full.venom; L.push("POISON POOL " + (3 + 2 * v) + " DMG / TICK"); }
  if (full.storm !== w.storm) { const s = full.storm; L.push("ARC LIGHTNING " + (1 + s) + " JUMPS, " + (5 + 4 * s) + " DMG"); }
  if (full.nova !== w.nova) { const v = full.nova; L.push("CORPSE BLAST " + (6 + 3 * v) + " DMG"); }
  if (full.splinter !== w.splinter) { const v = full.splinter; L.push((3 + 2 * v) + " DEATH SHARDS, " + (6 + 2 * v) + " DMG"); }
  if (full.leech !== w.leech) L.push("+" + full.leech.toFixed(1) + " VITALITY / KILL" + (full.leechMax ? " (MAX)" : ""));
  if (full.execute !== w.execute) L.push("REAP ENEMIES UNDER " + Math.round(full.execute * 100) + "% HP");
  if (full.midas !== w.midas) L.push("+" + Math.round(full.midas * 100) + "% SOULS / KILL");
  if (full.dashTrail !== w.dashTrail) L.push("DASH WAKE " + (5 + 4 * full.dashTrail) + " DMG / TICK");
  if (full.prey !== w.prey) L.push("+" + Math.round((full.prey - 1) * 100) + "% DMG TO BURNING / CHILLED / BLEEDING");
  if (full.crit !== w.crit) L.push(Math.round(full.crit * 100) + "% CRIT ×" + full.critMul.toFixed(1));
  if (full.wrath !== w.wrath) L.push("UP TO +" + Math.round(full.wrath * 100) + "% DMG NEAR DEATH");
  if (full.dr !== w.dr) {
    const drChange = Math.round(full.dr * 100);
    L.push("DAMAGE TAKEN " + (drChange < 0 ? "+" : "−") + Math.abs(drChange) + "%");
  }
  if (full.thorns !== w.thorns) L.push("THORN BURST " + (12 + 9 * full.thorns) + " DMG WHEN HIT");
  if (full.regen !== w.regen) L.push("REGEN " + full.regen.toFixed(2) + " HP/s WHEN UNTOUCHED");
  if (full.vortex !== w.vortex) L.push("SLAIN FOES MAY PULL THE CROWD INWARD");
  if (full.fear !== w.fear) L.push(Math.round(full.fear * 100) + "% TO TERRIFY (" + full.fearDur.toFixed(1) + "s)");
  if (full.timeField !== w.timeField) L.push("TIME-SLOW AURA, RADIUS " + Math.round(full.timeR));
  if (full.prickle !== w.prickle) L.push("THORN AURA, RADIUS " + Math.round(full.prickleR));
  if (full.slime !== w.slime) L.push("CAUSTIC SLIME TRAIL " + (2 + full.slime) + " DMG / TICK");
  if (full.bleed !== w.bleed) { const b = full.bleed; L.push("BLEED " + (3 * b) + " DMG / 1.0s FOR " + (1 + 0.5 * b).toFixed(1) + "s"); }
  if (full.sniper !== w.sniper) L.push("SNIPER DISTANCE BONUS +" + (15 * full.sniper) + "% / 100px");
  if (full.echo !== w.echo) L.push("ECHO DISCHARGE EVERY " + Math.max(2, 6 - full.echo) + " HITS");
  if (full.vampire !== w.vampire) { const v = full.vampire; L.push("HEAL " + (0.25 * v).toFixed(2) + " ON BLEEDING HIT"); L.push("+30% DMG TO BLEEDING"); }
  if (full.stealth !== w.stealth) L.push("DETECTION CONE NARROWED");
  return L;
}

/* wrap a player's runes object in a Proxy so any modification auto-recalculates */
function makeRunesProxy(p) {
  return new Proxy(p.runes, {
    set: (target, prop, value) => {
      target[prop] = value;
      recalc(p);
      return true;
    }
  });
}

/* recompute one warden's weapon + body whenever their stacks change */
function recalc(p) {
  if (!p) return;
  /* wrap runes in a proxy if not already wrapped, so any modification auto-recalcs */
  if (!p._runesProxy && p.runes) {
    p.runes = makeRunesProxy(p);
    p._runesProxy = true;
  }
  const wasMax = p.maxHp || 0;
  p.mods = buildWeaponModsFrom(p);
  const c = CHARS[p.char];
  p.maxHp = Math.round((c.hp + p.mods.hpBonus + (p.vampireMaxBonus || 0)) * (p.maxHpMul || 1));
  if (p.maxHp > wasMax) p.hp += p.maxHp - wasMax; // heal what extra max grants
  p.hp = Math.min(p.hp, p.maxHp);
  p.speed = c.speed * p.mods.moveMul;
  /* SANCHO BLOODLUST SPEED */
  if (p.char === "sancho" && p.hp / p.maxHp < 0.3) p.speed *= 1.25;

  p.dashCdBase = c.dashCd * p.mods.dashCdMul;
  p.dashDur = c.dashDur || 0.18;
  /* Dash speed scales with bullet speed (Velocity rune) */
  p.dashSpeed = (c.dashSpeed || 720) * (p.mods.speed / 540);
  /* BULWARK shield: gaining a stack raises the cap and refills every charge at once */
  const prevShieldMax = p.shieldMax || 0;
  p.shieldMax = p.mods.shieldMax;
  if (p.shieldMax > prevShieldMax) p.shield = p.shieldMax;
  p.shield = Math.min(p.shield, p.shieldMax);
  if (p === localPlayer()) {
    refreshRuneStrip();
    if (typeof updateWarpButton !== "undefined") updateWarpButton();
  }
  updateHp();
}

/* THE UNKNOWN cracks open one more rune slot. If your path was already sealed,
   the seal loosens so a brand-new rune can answer the empty slot — then it re-seals
   once the new, wider set is full. */
function grantRiftSlot(p) {
  p.bonusRuneSlots = (p.bonusRuneSlots || 0) + 1;
  p.lockedRunes = null;
  recalc(p);
  checkRuneLock(p);   // re-seal immediately if you were already past the new count
}

/* glossary: remember every rune the player has ever carved, across all descents.
   Only the first time a given rune is seen touches storage. */
function recordRuneSeen(id) {
  if (Meta.runesSeen[id]) return;
  Meta.runesSeen[id] = true;
  metaSave();
}

function grantRune(p, id, silent) {
  /* the glossary only records what the LOCAL warden has personally carved */
  if (p === localPlayer()) recordRuneSeen(id);
  p.runes[id] = (p.runes[id] || 0) + 1;
  recalc(p);

  if (p === localPlayer()) {
    // UNLOCK: Wayward Passenger (35 WARP)
    if (id === "warp" && p.runes.warp >= 35 && !Meta.unlocked["char:sinner"]) {
      Meta.unlocked["char:sinner"] = true;
      toast("UNLOCKED: WAYWARD PASSENGER — THE DIMENSIONAL DRIFTER");
      metaSave();
    }
    // UNLOCK: John Runegun (20 MASTERY on 4 chars)
    if (id === "mastery" && p.runes.mastery >= 20) {
      if (!Meta.masteredChars.includes(p.char)) {
        Meta.masteredChars.push(p.char);
        metaSave();
        if (!Meta.unlocked["char:john"] && Meta.masteredChars.length >= 4) {
          Meta.unlocked["char:john"] = true;
          toast("UNLOCKED: JOHN RUNEGUN — THE LEGEND");
          metaSave();
        }
      }
    }
  }

  if (!silent && p === localPlayer()) { toast(RUNES[id].name + " ×" + p.runes[id] + " CARVED IN"); AudioFX.equip(); }
  checkRuneLock(p);
}

/* console helper: enable auto-recalc for a player BEFORE modifying runes in console
   (e.g., enableRuneAutoRecalc(player); player.runes.reprieve = 5) */
function enableRuneAutoRecalc(p) {
  recalc(p);
}
