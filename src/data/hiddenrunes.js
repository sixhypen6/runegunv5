/* =========================================================
   RUNEGUN · Hidden Runes (Easter Eggs)
   These runes are only obtainable with hidden characters.
   ========================================================= */
"use strict";

// Do NOT use "const RUNES" or "let RUNES" here! 
// Just append the data directly onto the global variable that already exists:
RUNES.exterminate = {
  name: "EXTERMINATE", glyph: "ᛃ", color: "#a30000",
  desc: "Unmatched fire power. Steady damage scaling, smooth speed gains (caps at +100%), and optimized fire rate (caps at +275%). Defense drops 9% per stack (caps at 54% extra damage taken).",
  mod: function(m, n) {
    m.dmg *= Math.pow(1.35, n);
    m.dr -= 0.09 * n; 
    if (m.dr < -0.54) m.dr = -0.54;
    let speedMult = Math.pow(1.06, n);
    m.speed *= (speedMult > 2.0) ? 2.0 : speedMult;
    let rateMult = Math.pow(1.5, n);
    m.rate *= (rateMult > 3.75) ? 3.75 : rateMult;
  }
};

RUNES.runegun = { name: "RUNEGUN", glyph: "⦿", color: "#ffffff",
  desc: "john runegun",
  mod: function(m, n) {
  // Cap the damage doubling to prevent runaway scientific notation
  m.dmg *= Math.pow(2, Math.min(n, 12));
}};

// Update RUNE_IDS to include hidden runes
RUNE_IDS = Object.keys(RUNES);
