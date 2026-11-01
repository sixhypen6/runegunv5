/* =========================================================
   RUNEGUN · Hidden Characters (Easter Eggs)
   These characters are references or experimental designs.
   ========================================================= */
"use strict";

CHARS.sinner = {
  name: "WAYWARD PASSENGER", glyph: "ᚥ", color: "#9d6bff", cost: 50000,
  hidden: true, melee: true,
  desc: "A dimensional drifter. Purely melee — arm blades rip reality with each swing (Tears). Deals +100% damage with Dimensional Shred.\nUNLOCK: Accumulate 35 WARP stacks in a single run.",
  hp: 90, speed: 280, dashCd: 1.1, startRunes: 0, rerolls: 3,
  startLoadout: ["warp"],
  weaponBase: { dmg: 24, rate: 3.2, size: 85, speed: 450, knock: 100 }
};

CHARS.v1 = {
  name: "V1", glyph: "V", color: "#2e8eff", cost: 75000,
  hidden: true, cycles: true,
  desc: "BLOOD IS FUEL. Inherits permanent LEECH. Cycles through weapon systems every 5 shots: [PISTOL] Rapid fire, [SHOTGUN] Wide burst, [SAW] Piercing blades.\nUNLOCK: Heal 300 HP via the LEECH rune in one run.",
  hp: 50, speed: 340, dashCd: 0.7, startRunes: 0, rerolls: 5,
  dashDur: 0.2, dashSpeed: 1100,
  startLoadout: ["leech", "leech", "leech"]
};

CHARS.john = {
  name: "JOHN RUNEGUN", glyph: "⦿", color: "#aa8844", cost: 100000,
  hidden: true,
  desc: "The absolute legend. Every stack of RUNEGUN doubles his damage. Starts with 10 re-rolls and his signature rune.\nUNLOCK: Attain 20 stacks of MASTERY on 4 characters.",
  hp: 125, speed: 275, dashCd: 1.0, startRunes: 0, rerolls: 10,
  startLoadout: ["runegun"]
};

CHARS.sancho = {
  name: "SANCHO", glyph: "🩸", color: "#cc0000", cost: 125000,
  hidden: true, melee: true,
  desc: "The Second Kindred. Melee master. Cycles weapons based on Hardblood: Fists, Saber, and Lance. Bloodlust at <30% HP. Consumes Bloodfeast for Hardblood.\nUNLOCK: Deal 10,000 damage to BLEEDING enemies in one run.",
  hp: 95, speed: 320, dashCd: 0.65, startRunes: 0, rerolls: 3, runeSlots: 5, bonusRuneSlots: 1,
  dashDur: 0.25, dashSpeed: 1000,
  weaponBase: { dmg: 12, rate: 3.0, size: 60, speed: 400, knock: 80 },
  startLoadout: ["bleed", "vampire"]
};

CHARS.tester = {
  name: "TESTER", glyph: "ᚦ", color: "#ffffff", hidden: true, melee: true,
  desc: "Testing true melee hitbox behavior.",
  hp: 100, speed: 300, dashCd: 1.0, startRunes: 0, rerolls: 10,
  weaponBase: { dmg: 15, rate: 2.5, size: 50, speed: 600, knock: 100 }
};
