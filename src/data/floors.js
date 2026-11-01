/* =========================================================
   RUNEGUN · Floors
   The looping floor definitions (palette, rocks, hazards, boss, new enemy) and depth/difficulty scaling.
   ========================================================= */
"use strict";


/* =========================================================
   FLOORS — five floors that loop forever
   ========================================================= */
const FLOORS = [
  { name: "THE CATACOMB", boss: "THE CHAINED WARDEN",
    floor: "#0b0b14", grid: "rgba(44,42,69,0.5)", wallGlow: "#9d6bff", line: "#2c2a45",
    rockA: "#1b1a30", rockB: "#181729", rockTop: "#23223c",
    rocks: 26, hazards: 0, newEnemy: "wisp" },
  { name: "THE OSSUARY", boss: "THE MARROW KING",
    floor: "#0d110c", grid: "rgba(74,84,58,0.4)", wallGlow: "#b8d68a", line: "#2e3526",
    rockA: "#222a1c", rockB: "#1c2418", rockTop: "#2f3a26",
    rocks: 34, hazards: 0, newEnemy: "summoner" },
  { name: "THE HELLFORGE", boss: "THE FORGE TYRANT",
    floor: "#150b0a", grid: "rgba(94,46,38,0.4)", wallGlow: "#ff8a3d", line: "#43221c",
    rockA: "#33160f", rockB: "#2a120c", rockTop: "#47221a",
    rocks: 20, hazards: 5, newEnemy: "cinder" },
  { name: "THE DROWNED NAVE", boss: "THE DROWNED MONARCH",
    floor: "#07131a", grid: "rgba(46,100,110,0.35)", wallGlow: "#7de8e0", line: "#1d3a45",
    rockA: "#12303b", rockB: "#0e2630", rockTop: "#1e4753",
    rocks: 30, hazards: 7, hazardType: "water", newEnemy: "angler" },
  { name: "THE VOID BENEATH", boss: "THE EVENT HORIZON",
    floor: "#060410", grid: "rgba(70,55,120,0.25)", wallGlow: "#c9b8ff", line: "#241d45",
    rockA: "#15102b", rockB: "#100c22", rockTop: "#241d45",
    rocks: 10, hazards: 0, newEnemy: "wisp" },
];
const floorDef = () => FLOORS[Game.mapIdx];
const depth = () => Game.loop * FLOORS.length + Game.mapIdx;   // 0,1,2,3,...
const diffScale = () => {
  if (Game.loop === 0) return 1.0; // No scaling on the first loop
  const base = 1 + (Game.wave - 1) * 0.16 + (depth() - 5) * 0.65;
  return base * Math.pow(1.3, Game.loop - 1); // Exponential loop scaling
};
