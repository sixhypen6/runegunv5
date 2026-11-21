/* =========================================================
   RUNEGUN · Combat
   Targeting, firing the gun and the Wraith's veil burst, applying damage / elements / on-kill effects, the shield, getting hurt, and floor transitions.
   ========================================================= */
"use strict";

/* global multiplier on souls (score) gained per kill — tune to pace unlocks */
const SOUL_RATE = 0.25;
/* FLAWLESS: extra souls when a warden falls with the whole run still damageless —
   bonus = bounty × SOUL_RATE × this (midas applies on top, same as the bounty) */
const FLAWLESS_MUL = 1;

/* =========================================================
   COMBAT
   ========================================================= */

/* claw/body contact vs EVERY living warden — an enemy chasing one player still
   mauls the other if they stand in its path. Solo this is the old single check. */
function contactHurt(e, pad, dmg) {
  if (e.team === "p") {
    // friendly thrall hurting hostile enemies
    for (const o of enemies) {
      if (o === e || o.dead || o.ghost || o.spawnT > 0 || o.team === "p") continue;
      if (dist2(e.x, e.y, o.x, o.y) < (e.r + o.r + pad) ** 2) damageEnemy(o, dmg, { owner: e.owner, x: e.x, y: e.y });
    }
  } else {
    for (const p of players) {
      if (p.hp <= 0 || p.downed) continue;
      if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r + pad) ** 2) hurtPlayer(p, dmg, e);
    }
    // and also hurt other friendly thralls
    for (const o of enemies) {
      if (o.team === "p" && !o.dead && !o.ghost && o.spawnT <= 0) {
        if (dist2(e.x, e.y, o.x, o.y) < (e.r + o.r + pad) ** 2) damageEnemy(o, dmg, e);
      }
    }
  }
}

/* Spawn one full weapon shot (mirror copies, scatter fan, twin parallels) from (x, y)
   with warden `p`'s mods. Shared by the gun and by VEIL BURST corpse-discharges. */
function spawnShot(p, x, y, baseAim, skip) {
  const m = Object.assign({}, p.mods);

  /* SANCHO: Stage 2 Melee Variations */
  if (p.char === "sancho" && p.hbStage === 2 && p.weaponMode === "melee") {
    if (p.s2Var === 1) { // Variation 1: Stronger Single Sword
      m.dmg *= 1.8; m.size *= 1.3;
    } else { // Variation 2: Dual Swords (Sweep / Rapid hits)
      m.count = 2; m.spread = 0.45; m.dmg *= 0.95;
    }
  }

  const isSinner = p.char === "sinner";
  const isSancho = p.char === "sancho";
  const isV1 = p.char === "v1";

  /* V1: BLOOD IS FUEL - Weapon Cycling */
  if (isV1) {
    p.v1Cycle = (p.v1Cycle || 0) + 1;
    const weaponIdx = Math.floor((p.v1Cycle % 18) / 6); // Cycle every 6 shots
    if (weaponIdx === 0) { // PISTOL: High speed, accurate
      m.dmg *= 1.3; m.speed *= 1.6; m.rate *= 1.4;
    } else if (weaponIdx === 1) { // SHOTGUN: 8-pellet burst
      m.count += 7; m.spread += 0.5; m.dmg *= 0.45;
    } else { // SAW: Heavy piercing disks
      m.pierce += 15; m.dmg *= 2.2; m.speed *= 0.45; m.size *= 1.8;
    }
  }

  const bulletR = p.char === "shredder" ? 6 : m.size; // Cap radius for Shredder bullets
  const dirs = [baseAim];
  for (let i = 0; i < m.mirror; i++) dirs.push(baseAim + Math.PI + rnd(-0.06, 0.06));

  // Calculate perpendicular for twin shots
  const perpX = Math.cos(baseAim + Math.PI / 2);
  const perpY = Math.sin(baseAim + Math.PI / 2);

  for (const baseA of dirs) {
    const shots = [];
    for (let i = 0; i < m.count; i++) {
      const off = m.count > 1 ? (i / (m.count - 1) - 0.5) * m.spread * 2 : 0;
      shots.push(baseA + off + rnd(-m.spread, m.spread) * 0.5);
    }
    for (const a of shots) {
      const mk = (ox, oy) => {
        // Determine if this is a melee-tracked attack
        const meleeChar = isSinner || p.char === "tester" || (isSancho && (p.weaponMode === "melee" || !p.weaponMode));

        // Dynamic projectile coloring
        const bulletCol = meleeChar ? "#cc0000" : (isSancho ? "#ff4d5e" : (isV1 ? (Math.floor((p.v1Cycle % 18) / 6) === 1 ? "#ff8a3d" : "#5ee6ff") : undefined));

        const b = {
          x: x + Math.cos(a) * (meleeChar ? 32 : 18) + ox, y: y + Math.sin(a) * (meleeChar ? 32 : 18) + oy,
          vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
          r: meleeChar ? (p.char === "tester" ? 38 : Math.min(m.size, isSinner ? 24 : 18)) : bulletR,
          dmg: m.dmg, t: 0, life: meleeChar ? (p.hbStage === 3 ? 0.35 : 0.22) : 1.5,
          pierce: meleeChar ? 999 : m.pierce,
          bounce: m.bounce, homing: m.homing,
          venom: m.venom, ember: m.ember, frost: m.frost, storm: m.storm, bleed: m.bleed,
          execute: m.execute, knock: m.knock,
          crit: m.crit, critMul: m.critMul, fear: m.fear, fearDur: m.fearDur,
          owner: p, melee: meleeChar, color: bulletCol,
          /* TRUE MELEE HITBOX tracking */
          relD: meleeChar ? (isSinner ? 36 : (p.char === "tester" ? 45 : (p.hbStage === 3 ? 55 : (p.hbStage === 2 ? 30 : 25)))) : undefined,
          relA: meleeChar ? (a - p.aim) : undefined,
          /* WHOLE WEAPON BOX dimensions */
          boxW: meleeChar ? (p.hbStage === 3 ? 90 : (p.hbStage === 2 ? 55 : (isSinner ? 60 : 40))) : undefined,
          boxH: meleeChar ? (p.hbStage === 3 ? 24 : (p.hbStage === 2 ? 18 : (isSinner ? 40 : 30))) : undefined,
          /* Multi-hit refresh for the Lance - slowed down to prevent "shredding" */
          hitRefreshT: (p.char === "sancho" && p.hbStage === 3) ? 0.35 : undefined,
          /* allocated lazily on first hit (update.js) */
          hitSet: skip ? new Set([skip]) : null,
        };

        // Special Visual Flags
        if (isSinner) b.tear = true;
        if ((isSancho || p.char === "tester") && meleeChar) b.punch = true;

        bullets.push(b);
      };

      mk(0, 0);
      for (let i = 0; i < m.twin; i++) {
        const side = (i % 2 === 0) ? 1 : -1;
        const dd = 10 * (Math.floor(i / 2) + 1);
        mk(perpX * dd * side, perpY * dd * side);
      }
    }
  }
  if (bullets.length > 500) bullets.splice(0, bullets.length - 500); // performance guard
}

/* Process the fire intent for warden `p`. Handles normal shots, mortars, veil bursts, and debris shards. */
function fireWeapon(p, inp, dt) {
  if (!p || !inp) return;
  const m = p.mods;
  if (!m) return;
  p.fireT -= dt;
  let firing = false, aim = p.aim;

  /* SANCHO: Weapon Mode Toggling (SEAL button) */
  if (p.char === "sancho" && !p.downed) {
    if (inp.useTap) {
      // Prioritize interactions (HP boxes, Grand Seal) over weapon switching
      let canInteract = false;
      for (const c of (chests || [])) if (c.state === "sealed" && dist2(c.x, c.y, p.x, p.y) < 64 * 64 && !Game.ambush) canInteract = true;
      for (const h of (healthBoxes || [])) if (h.state === "sealed" && dist2(h.x, h.y, p.x, p.y) < 64 * 64 && !Game.ambush) canInteract = true;
      if (SEAL.state === "ready" && dist2(SEAL.x, SEAL.y, p.x, p.y) < (SEAL.r + 40) ** 2 && !Game.ambush) canInteract = true;

      if (!canInteract) {
        if (p.weaponMode === "melee" && p.hardblood < 5) {
          toast("HARDBLOOD TOO LOW FOR BOW (MIN 5)");
        } else {
          p.weaponMode = (p.weaponMode === "melee" || !p.weaponMode) ? "ranged" : "melee";
          toast("MODE: " + p.weaponMode.toUpperCase());
        }
        return;
      }
    }
  }

  // Resolve firing state from input
  if (inp.touchMode) {
    if (inp.aimMode === "auto") {
      if (p.autoFire) firing = true;
    } else if (inp.aiming) {
      aim = Math.atan2(inp.aimY, inp.aimX); p.aim = aim; firing = true;
    }
  } else if (inp.deskMode === "auto") {
    if (p.autoFire) firing = true;
  } else if (inp.deskMode === "cursor") {
    firing = true;
  } else if (inp.mouseDown) firing = true;

  /* SANCHO: Always-Attacking Lance (Stage 3 Melee) */
  if (p.char === "sancho" && p.hbStage === 3 && p.weaponMode === "melee") {
    firing = true;
  }

  if (!firing || p.fireT > 0) return;

  /* SANCHO: Bloodfeast Refinement & Hardblood Management */
  if (p.char === "sancho") {
    // Stage 2 Variation: Pick before firing so fireT can be adjusted
    if (p.hbStage === 2 && p.weaponMode === "melee") {
       p.s2Var = Math.random() < 0.5 ? 1 : 2;
    }
    p.sanchoAttackCount = (p.sanchoAttackCount || 0) + 1;
    if (p.sanchoAttackCount >= 15) {
      p.sanchoAttackCount = 0;
      const canMake = Math.floor(bloodfeast / 50);
      const gain = Math.min(canMake, 3);
      if (gain > 0) {
        bloodfeast -= gain * 50;
        p.hardblood = Math.min(30, p.hardblood + gain);
        if (p.weaponMode === "melee") {
          if (p.hardblood >= 20) p.hbStage = 3;
          else if (p.hardblood >= 10) p.hbStage = 2;
          else p.hbStage = 1;
        }
        toast("BLOOD REFINED: +" + gain + " HARDBLOOD");
      } else {
        // Penalty: dealing damage to self over 16s (stops at 65% HP)
        applyCurse(p, "bleed", 16, false);
      }
    }
  }

  const jamMul = curseActive(p, "jam") ? 0.5 : 1;

  /* THE WRAITH: Veil Burst auto-attack */
  if (p.char === "wraith") {
    p.veilCdBase = clamp(6.75 / (m.rate * jamMul), 0.5, 4.5);
    p.fireT = p.veilCdBase;
    fireVeil(p);
    return;
  }

  /* THE DEMOLITIONIST: Stub Mortar lob */
  if (p.char === "demolitionist") {
    p.fireT = 1 / (m.rate * jamMul);
    launchShell(p, inp, aim);
    p.kickT = 0.09;
    Game.shake = Math.max(Game.shake, 3);
    for (let k = 0; k < 4; k++) {
      const pa = aim + rnd(-0.5, 0.5);
      particles.push({ x: p.x + Math.cos(aim) * 22, y: p.y + Math.sin(aim) * 22,
        vx: Math.cos(pa) * rnd(60, 160), vy: Math.sin(pa) * rnd(60, 160) - 40,
        t: 0, life: rnd(0.15, 0.3), r: rnd(2, 3.5), color: pick(["#ff5e2e", "#8a5a3d"]) });
    }
    AudioFX.shoot();
    return;
  }

  /* THE SHREDDER: Debris Shards from shredded enemies */
  if (p.char === "shredder") {
    if (!p.sawHitting || !p.lastHitEnemy) return;
    p.fireT = 1 / (m.rate * jamMul);
    spawnShot(p, p.lastHitEnemy.x, p.lastHitEnemy.y, aim, p.lastHitEnemy);
    return;
  }

  /* BASE CASE: Standard gun firing */
  p.fireT = 1 / (m.rate * jamMul);
  if (p.char === "sancho" && p.s2Var === 2) p.fireT *= 0.65; // Dual Sabers have better speed

  spawnShot(p, p.x, p.y, aim);
  p.kickT = 0.09;
  Game.shake = Math.max(Game.shake, 2);
  AudioFX.shoot();
  for (let i = 0; i < 3; i++) particles.push({
    x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
    vx: Math.cos(aim + rnd(-0.5, 0.5)) * rnd(60, 180), vy: Math.sin(aim + rnd(-0.5, 0.5)) * rnd(60, 180),
    t: 0, life: 0.15, r: rnd(2, 4), color: "#ffd23d" });
}

/* =========================================================
   VEIL BURST — the Wraith's auto-attack.
   ========================================================= */
const VEIL_DMG_MUL = 2.6;
function fireVeil(p) {
  const m = p.mods;
  const R = clamp(110 + m.size * 9 + (m.veilRBonus || 0), 90, 480);
  const ringDmg = m.dmg * VEIL_DMG_MUL;
  p.veilT = 0.45 + (m.veilInvulBonus || 0);
  veils.push({ x: p.x, y: p.y, r: R, t: 0, life: 0.55 });
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, TAU);
    particles.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R,
      vx: -Math.cos(a) * rnd(50, 160), vy: -Math.sin(a) * rnd(50, 160),
      t: 0, life: rnd(0.25, 0.5), r: rnd(2, 4), color: "#5ee6ff" });
  }
  const px = p.x, py = p.y;
  const slain = [];
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0) continue;
    if (dist2(e.x, e.y, px, py) > (R + e.r) ** 2) continue;
    damageEnemy(e, ringDmg, { x: px, y: py, knock: m.knock, owner: p, melee: true });
    if (e.dead) { slain.push(e); continue; }
    if (m.ember) { e.burnT = Math.max(e.burnT, 2 + m.ember); e.burnDps = Math.max(e.burnDps, 2 + 2 * m.ember); e.burnBy = p; }
    if (m.bleed) { e.bleedT = Math.max(e.bleedT, 1 + 0.5 * m.bleed); e.bleedDps = Math.max(e.bleedDps, 3 * m.bleed); e.bleedBy = p; }
    if (m.frost) { e.slowT = Math.max(e.slowT, 1 + 0.7 * m.frost); floatText(e.x, e.y - e.r - 12, "❄", "#5ee6ff"); }
    if (m.storm && !e.dead) chainStorm(e, m.storm, new Set([e]), p);
    if (m.venom && puddles.length < 140) puddles.push({ x: e.x, y: e.y, r: 20 + 10 * m.venom, t: 0, life: 3,
      team: "p", dmg: 3 + 2 * m.venom, color: "#7dff5e", tickMap: {}, owner: p });
  }
  for (const e of slain) {
    let tgt = null, bd = Infinity;
    for (const o of enemies) {
      if (o === e || o.dead || o.ghost || o.spawnT > 0) continue;
      const d = dist2(e.x, e.y, o.x, o.y);
      if (d < bd) { bd = d; tgt = o; }
    }
    spawnShot(p, e.x, e.y, tgt ? angTo(e.x, e.y, tgt.x, tgt.y) : rnd(0, TAU), e);
  }
  Game.shake = Math.max(Game.shake, slain.length ? 6 : 4);
  AudioFX.dash();
  AudioFX.nova();
}

/* =========================================================
   MINES — the Demolitionist's dash-sown hazards.
   ========================================================= */
const MINE_LIFE = 20;
const MINE_STACK_R = 26;
const MINE_STACK_MAX = 5;
const MINE_CAP = 60;
function placeMine(p, x, y) {
  let piled = 0, oldest = null;
  for (const mn of mines) {
    if (dist2(x, y, mn.x, mn.y) < MINE_STACK_R ** 2) {
      piled++;
      if (!oldest || mn.t > oldest.t) oldest = mn;
    }
  }
  if (piled >= MINE_STACK_MAX) { oldest.t = 0; return; }
  if (mines.length >= MINE_CAP) mines.shift();
  mines.push({ x, y, r: 11, t: 0, life: MINE_LIFE, armT: 0.22, pulse: rnd(0, TAU), owner: p });
  for (let k = 0; k < 3; k++) particles.push({ x, y, vx: rnd(-50, 50), vy: rnd(-70, -20),
    t: 0, life: 0.2, r: rnd(1.5, 3), color: "#ff5e2e" });
}

function detonateMine(mn, trigger) {
  const p = mn.owner || localPlayer();
  const m = p.mods;
  const waves = m.shardWaves || 1;
  const bulletR = p.char === "shredder" ? 6 : m.size;
  for (let w = 0; w < waves; w++) {
    const shards = Math.min(1 + m.count, 40);
    const delay = w * 0.15;
    for (let i = 0; i < shards; i++) {
      const a = i === 0 && trigger ? angTo(mn.x, mn.y, trigger.x, trigger.y) : rnd(0, TAU);
      bullets.push({ x: mn.x, y: mn.y,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        r: bulletR, dmg: m.dmg, t: -delay, life: 1.2,
        pierce: m.pierce, bounce: m.bounce, homing: m.homing,
        venom: m.venom, ember: m.ember, frost: m.frost, storm: m.storm, bleed: m.bleed,
        execute: m.execute, knock: m.knock,
        crit: m.crit, critMul: m.critMul, fear: m.fear, fearDur: m.fearDur,
        owner: p,
        hitSet: i === 0 || !trigger ? new Set() : new Set([trigger]) });
    }
  }
  if (bullets.length > 450) bullets.splice(0, bullets.length - 450);
  for (let k = 0; k < 10; k++) {
    const a = rnd(0, TAU), sp = rnd(90, 260);
    particles.push({ x: mn.x, y: mn.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: rnd(0.15, 0.35), r: rnd(2, 4), color: pick(["#ff5e2e", "#ffd23d"]) });
  }
  Game.shake = Math.max(Game.shake, 4);
  AudioFX.nova();
}

/* =========================================================
   MORTAR SHELLS — the Demolitionist's weapon arc.
   ========================================================= */
const SHELL_RANGE = 180;
const SHELL_SLAM_R = 90;
function launchShell(p, inp, aim) {
  const m = p.mods;
  let d = SHELL_RANGE;
  if (p.autoFire) {
    const tgt = nearestEnemy(p.x, p.y);
    if (tgt) d = Math.sqrt(dist2(p.x, p.y, tgt.x, tgt.y));
  } else if (!inp.touchMode && inp.mouseX !== undefined) {
    d = Math.hypot(inp.mouseX / ZOOM + Game.cam.x - p.x, inp.mouseY / ZOOM + Game.cam.y - p.y);
  }
  d = clamp(d, 50, SHELL_RANGE);
  const lx = clamp(p.x + Math.cos(aim) * d, 40, MAP.w - 40);
  const ly = clamp(p.y + Math.sin(aim) * d, 40, MAP.h - 40);
  const T = clamp(Math.hypot(lx - p.x, ly - p.y) / 360, 0.26, 0.5);
  shells.push({ sx: p.x, sy: p.y, x: p.x, y: p.y, lx, ly,
    t: 0, T, r: m.size + 6, dmg: m.dmg, knock: m.knock, hitSet: new Set(), owner: p });
  shockwaves.push({ x: lx, y: ly, r: 4, max: SHELL_SLAM_R, speed: (SHELL_SLAM_R - 4) / T,
    dmg: 0, hostile: false, color: "#ff5e2e", hitSet: new Set() });
}

function shellSlam(sh) {
  const p = sh.owner || localPlayer();
  const m = p.mods;
  shockwaves.push({ x: sh.x, y: sh.y, r: 10, max: SHELL_SLAM_R, speed: 420,
    dmg: m.dmg, hostile: false, hitSet: new Set(), owner: p });
  let tgt = null, bd = SHELL_SLAM_R ** 2;
  for (const e of enemies) {
    if (e.dead || e.ghost || e.spawnT > 0) continue;
    const dd = dist2(sh.x, sh.y, e.x, e.y);
    if (dd < bd) { bd = dd; tgt = e; }
  }
  detonateMine({ x: sh.x, y: sh.y, owner: p }, tgt);
  Game.shake = Math.max(Game.shake, 8);
  AudioFX.slam();
}

/* =========================================================
   DAMAGE & HEALING
   ========================================================= */

function healPlayer(p, heal, growthAllowed) {
  const oldHp = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + heal);
  const excess = heal - (p.hp - oldHp);
  if (excess > 0 && growthAllowed) {
    p.vampireExcess = (p.vampireExcess || 0) + excess;
    const m = p.mods;
    // Tighter growth threshold: 100 excess HP per Max HP gain
    const threshold = 100;
    const baseHp = CHARS[p.char].hp;
    if (p.vampireExcess >= threshold && (p.vampireMaxBonus || 0) < baseHp * 2) {
      p.vampireMaxBonus = (p.vampireMaxBonus || 0) + 1;
      p.vampireExcess -= threshold;
      recalc(p);
      floatText(p.x, p.y - 40, "VITALITY GROWTH", "#ff4d5e", 12);
    }
  }
  updateHp();
}

/* Apply damage to enemy `e` from source `src`. */
function damageEnemy(e, dmg, src) {
  if (typeof Net !== "undefined" && Net.role === "guest") { e.hitFlash = Math.max(e.hitFlash || 0, 0.08); return 0; }
  if (e.dead || e.ghost || e.spawnT > 0) return 0;

  const ow = src && src.owner;
  if (!ow) {
    e.hp -= dmg;
    if (e.hp <= 0) killEnemy(e, null);
    return dmg;
  }
  const om = ow.mods;
  if (!om) {
    e.hp -= dmg;
    if (e.hp <= 0) killEnemy(e, ow);
    return dmg;
  }

  if (e.team === "p" && ow) return 0; // Friendly fire protection

  /* MARROW KING: Phylactery shield */
  if (e.boss && e.kind === 1 && e.shielded) {
    dmg *= 0.2;
    if (Math.random() < 0.12) floatText(e.x, e.y - e.r - 16, "WARDED — BREAK THE VESSELS", "#d8ffb0");
  }

  /* QUARRY: affliction bonus */
  if (om && om.prey > 1 && (e.burnT > 0 || e.slowT > 0 || e.bleedT > 0)) dmg *= om.prey;

  /* SANCHO: Triple damage to bleeding */
  if (ow && ow.char === "sancho" && e.bleedT > 0) {
    dmg *= 3.0;
    ow.sanchoBleedDmg = (ow.sanchoBleedDmg || 0) + dmg;
    if (!Meta.unlocked["char:sancho"] && ow.sanchoBleedDmg >= 10000) {
      Meta.unlocked["char:sancho"] = true;
      toast("UNLOCKED: SANCHO — THE SECOND KINDRED");
      metaSave();
    }
  }

  /* VAMPIRE: lifesteal on bleeding */
  if (ow && om && om.vampire && e.bleedT > 0) {
    dmg *= 1.3;
    healPlayer(ow, om.vampire * 0.25, true);
  }

  /* SNIPER: distance bonus */
  if (om && om.sniper && src && src.x !== undefined) {
    const dist = Math.sqrt(dist2(ow.x, ow.y, e.x, e.y));
    dmg *= (1 + (dist / 100) * 0.15 * om.sniper);
  }

  /* ECHO: hit accumulation and discharge */
  if (om && om.echo && !e.dead) {
    const hitsPerCharge = Math.max(2, 6 - om.echo);
    e.hitCount = (e.hitCount || 0) + (src && src.melee ? 2 : 1);
    if (e.hitCount >= hitsPerCharge) {
      e.hitCount -= hitsPerCharge;
      let tgt = null, bd = 380 * 380;
      for (const o of enemies) {
        if (o === e || o.dead || o.ghost || o.spawnT > 0 || o.team === "p") continue;
        const d = dist2(e.x, e.y, o.x, o.y);
        if (d < bd) { bd = d; tgt = o; }
      }
      spawnShot(ow, e.x, e.y, tgt ? angTo(e.x, e.y, tgt.x, tgt.y) : rnd(0, TAU), e);
      AudioFX.zap();
    }
  }

  /* WRATH / BLOODLUST / WARP bonuses */
  if (om && om.wrath) dmg *= 1 + om.wrath * (1 - ow.hp / ow.maxHp);
  if (ow && ow.char === "sancho" && ow.hp / ow.maxHp < 0.3) dmg *= 2.0;
  if (ow && ow.warpedT > 0) dmg *= 2.0;

  const finalDmg = dmg;
  e.hp -= finalDmg;

  if (e.alerted === false) alertEnemy(e);
  e.hitFlash = clamp(0.06 + (finalDmg / e.maxHp) * 0.5, 0.06, 0.22);
  if (finalDmg >= 40 && !e.boss) Game.hitstop = Math.max(Game.hitstop, 0.02);

  /* FORWARD KNOCKBACK: push enemies in aim direction */
  if (src && !e.boss && !e.buffed) {
    let ka;
    if (ow && ow.aim !== undefined) ka = ow.aim;
    else if (src.x !== undefined) ka = angTo(src.x, src.y, e.x, e.y);
    if (ka !== undefined) {
      const force = (src.knock || 0) * 0.05;
      e.x += Math.cos(ka) * force; e.y += Math.sin(ka) * force;
    }
  }

  const crit = !!(src && src.critHit);
  floatText(e.x + rnd(-8, 8), e.y - e.r, Math.round(finalDmg),
    crit ? "#ffd23d" : "#e8e2d0", crit ? 24 : (13 + Math.min(7, finalDmg * 0.12)) | 0);
  AudioFX.hit();

  /* REAPER: execute weakened */
  if (!e.boss && e.hp > 0 && om && om.execute > 0 && e.hp / e.maxHp < om.execute) {
    e.hp = 0; floatText(e.x, e.y - e.r - 14, "REAPED", "#c4c9d4");
  }
  if (e.hp <= 0) killEnemy(e, ow);
  return finalDmg;
}

function recordSlain(key, flawless) {
  const book = flawless ? Meta.slainFlawless : Meta.slain;
  if (book[key]) return;
  book[key] = true; metaSave();
}

/* Process enemy death. Handles scores, streaks, reanimations, and on-kill runes. */
function killEnemy(e, killer) {
  if (typeof Net !== "undefined" && Net.role === "guest") return;
  if (e.dead) return;
  e.dead = true;
  Game.kills++;

  /* On-kill runes read the slayer's build */
  const km = killer ? killer.mods : null;

  /* Rapid-kill streak */
  Game.comboT = COMBO_WINDOW;
  Game.comboN++;
  streakKillFX(e, Game.comboN);

  if (!e.boss) recordSlain(e.type);

  /* Score calculation */
  const base = (ETYPES[e.type] ? ETYPES[e.type].score : e.score) * (e.ambush ? 2 : 1);
  const gainBase = Math.round(base * SOUL_RATE * (1 + (km ? km.midas : 0)));
  let gain = gainBase;
  const mul = e.boss ? 1 : streakMul(Game.comboN);
  if (mul > 1) {
    const bonus = gainBase * (mul - 1) + Game.soulFrac;
    const whole = Math.floor(bonus);
    Game.soulFrac = bonus - whole;
    gain += whole;
  }
  Game.score += gain;
  if (gain > 0) floatText(e.x, e.y - 16, "+" + gain, "#ffd23d", e.boss || e.ambush ? 16 : 11);

  /* NECRO PASSIVE: Heal on Thrall death */
  if (e.team === "p" && e.owner && e.owner.char === "necromancer") {
    const heal = Math.floor(rnd(2, 7));
    healPlayer(e.owner, heal, true);
    floatText(e.owner.x, e.owner.y - 30, "+" + heal + " SOUL FEED", "#7dff5e", 11);
  }

  /* LEECH / Blood is Fuel */
  if (km && km.leech && !killer.downed) {
    let heal = km.leech;
    if (killer.char === "v1") {
      heal *= 3.0;
      killer.v1LeechHeal = (killer.v1LeechHeal || 0) + heal;
      if (!Meta.unlocked["char:v1"] && killer.v1LeechHeal >= 300) {
        Meta.unlocked["char:v1"] = true;
        toast("UNLOCKED: V1 — BLOOD IS FUEL");
        metaSave();
      }
    }
    healPlayer(killer, heal, true);
  }

  /* Death throes & ambush ledger */
  const TD = ETYPES[e.type];
  if (TD && TD.onDeath) TD.onDeath(e);
  if (e.ambush && Game.ambush) {
    Game.ambush.remaining--;
    if (Game.ambush.remaining <= 0) openChest(Game.ambush.chest);
  }

  /* On-kill Procs: NOVA, VORTEX, SPLINTER */
  if (km && km.nova && !e.boss) {
    const n = km.nova;
    shockwaves.push({ x: e.x, y: e.y, r: 6, max: 60 + 28 * n, speed: 500, dmg: 6 + 3 * n, hostile: false, hitSet: new Set([e]), owner: killer });
    AudioFX.nova();
  }
  if (km && km.vortex && !e.boss && Math.random() < 0.25 + 0.1 * km.vortex) {
    const v = km.vortex;
    puddles.push({ x: e.x, y: e.y, r: 80 + 18 * v, t: 0, life: 0.7 + 0.15 * v,
      team: "p", dmg: 0, vortex: true, color: "#8a6bff", tickMap: {}, owner: killer });
  }
  if (km && km.splinter && !e.boss) {
    const shards = 3 + 2 * km.splinter;
    for (let i = 0; i < shards; i++) {
      const a = rnd(0, TAU);
      bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
        r: 3, dmg: 6 + 2 * km.splinter, t: 0, life: 0.5,
        pierce: 0, bounce: 0, homing: 0, venom: 0, ember: 0, frost: 0, storm: 0, bleed: km.bleed || 0,
        execute: 0, knock: 20, hitSet: new Set([e]), shard: true, owner: killer });
    }
  }

  /* Death VFX */
  const st = e.boss || Meta.juice === "off" ? -1 : Game.streakTier;
  const pn = e.boss ? 50 : 14 + Math.max(0, st) * 2;
  const goldP = st >= 0 ? STREAK_TIERS[st].gold : 0;
  for (let i = 0; i < pn; i++) {
    if (i >= 14 && particles.length > 520) break;
    particles.push({ x: e.x, y: e.y, vx: rnd(-260, 260), vy: rnd(-260, 260),
      t: 0, life: rnd(0.3, 0.9), r: rnd(2, 6), color: Math.random() < goldP ? pick(STREAK_GOLD) : e.color });
  }
  Game.shake = Math.max(Game.shake, e.boss ? 16 : 4);
  Game.hitstop = Math.max(Game.hitstop, e.boss ? 0.2 : 0.03);
  AudioFX.kill();

  /* NECROMANCER: Ghost Thrall reanimation */
  const spawnChance = 0.40 + (km ? (km.thrallSpawnBonus || 0) : 0);
  if (killer && killer.char === "necromancer" && !e.boss && !e.summoned && e.team !== "p" && Math.random() < spawnChance) {
    const t = spawnEnemy(e.type, e.x, e.y);
    t.team = "p";
    const statMul = km ? (statMulFinal(killer, km.thrallStatBonus || 1)) : 1;
    t.hp = t.maxHp = Math.floor(t.maxHp * 0.5 * statMul);
    t.owner = killer;
    t.color = "rgba(138,134,160,0.7)";
    if (Math.random() < 0.15) { t.buffed = e.buffed; t.wrath = e.wrath; t.rime = e.rime; t.sear = e.sear; }
    t.alerted = true;
    enemies.push(t);
    floatText(e.x, e.y - 20, "THRALL RISEN", "#8a86a0", 12);
  }

  updateScore(300 + 40 * Math.max(0, Game.streakTier));

  /* Wave Clear Ceremony (ignores friendly thralls) */
  if (!e.boss && !e.ambush && !Game.boss && !Game.ambush && !Game.inRift && players.length &&
      !enemies.some(x => !x.dead && !x.ambush && !x.boss && x.team !== "p")) {
    Game.hitstop = Math.max(Game.hitstop, 0.12);
    Game.shake = Math.max(Game.shake, 8);
    for (const p of players) {
      shockwaves.push({ x: p.x, y: p.y, r: 8, max: 200, speed: 400, dmg: 0,
        hostile: false, color: "#7dff5e", hitSet: new Set() });
      for (let k = 0; k < 10; k++) particles.push({ x: p.x + rnd(-26, 26), y: p.y + rnd(-20, 20),
        vx: rnd(-25, 25), vy: rnd(-90, -35), t: 0, life: rnd(0.5, 0.9), r: rnd(2, 4), color: "#9fe8b8" });
    }
    AudioFX.calm();
  }

  if (e.boss) bossSlain(e, killer);
}

/* =========================================================
   BOSS DEATH
   ========================================================= */

function bossSlain(e, killer) {
  if (e) { recordSlain("boss:" + e.kind); if (Game.flawless) recordSlain("boss:" + e.kind, true); }
  Game.boss = null; $("bossBar").classList.remove("on"); document.body.classList.remove("bossOn");
  haptic(80); clearBossTerrain(); for (const p of players) p.curses = {}; refreshCurseStrip();
  const km = killer ? killer.mods : (localPlayer() && localPlayer().mods);
  const bounty = e && e.kind === 4 ? 1500 : 400;
  const award = Math.round(bounty * SOUL_RATE * (1 + (km ? km.midas : 0)));
  Game.score += award;
  if (Game.flawless) {
    const bonus = Math.round(bounty * SOUL_RATE * FLAWLESS_MUL * (1 + (km ? km.midas : 0)));
    Game.score += bonus; Game.flawlessAward = bonus; Game.flawlessToast = 2.0;
    if (e) floatText(e.x, e.y - e.r - 66, "FLAWLESS +" + bonus, "#fff3c8", 24); AudioFX.waveUp();
  }
  if (e && e.kind === 4) {
    toast("THE VOID COLLAPSES — " + award + " SOULS SPILL FREE");
    Meta.bests.voidKills++; Game.voidImproved = Object.assign(Game.voidImproved || {}, { voidKills: true });
    const clr = Math.floor(Game.time); if (Game.voidKillTime < 0) Game.voidKillTime = clr;
    if (!Meta.bests.fastestVoidClearSec || clr < Meta.bests.fastestVoidClearSec) { Meta.bests.fastestVoidClearSec = clr; Game.voidImproved.fastestVoidClearSec = true; }
    metaSave();
  }
  for (const e of enemies) if (!e.boss && !e.dead) { recordSlain(e.type); e.hp = 0; e.dead = true; }
  ebullets.length = 0; for (let i = puddles.length - 1; i >= 0; i--) if (puddles[i].team === "e") puddles.splice(i, 1);
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].hostile) shockwaves.splice(i, 1);
  for (const rc of MAP.rocks) delete rc.meltAt;
  if (e && e.kind === 4 && !Game.voidConquered) { Game.voidConquered = true; if (!(typeof Net !== "undefined" && Net.active)) { startEnding(); return; } }
  if (e) {
    for (let k = 0; k < 4; k++) shockwaves.push({ x: e.x, y: e.y, r: 10, max: 180 + k * 90, speed: 700, dmg: 0, hostile: false, color: e.color, hitSet: new Set(), delay: k * 0.12 });
    for (let k = 0; k < 30; k++) particles.push({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-330, -90), t: 0, life: rnd(0.6, 1.2), r: rnd(2, 5), color: "#ffd23d" });
    floatText(e.x, e.y - e.r - 40, "+" + award + " SOULS", "#ffd23d", 20); Game.slowmo = 0.9; Game.ceremonyT = 1.25;
  } else setState("choice");
  $("bcTitle").textContent = floorDef().boss.replace("THE ", "THE ") + " FALLS";
  $("bcHealDesc").textContent = "Restore " + Math.round(localPlayer().maxHp / 2) + " vitality (half your maximum).";
}

/* =========================================================
   INTERACTIONS & PICKUPS
   ========================================================= */

function openChest(chest) {
  chest.state = "open"; Game.ambush = null; Game.chestsOpened++; updateSeals(); spawnPickup(chest.x, chest.y - 30);
  for (let i = 0; i < 20; i++) particles.push({ x: chest.x, y: chest.y, vx: rnd(-260, 260), vy: rnd(-320, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: "#ffd23d" });
  shockwaves.push({ x: chest.x, y: chest.y, r: 6, max: 170, speed: 520, dmg: 0, hostile: false, color: "#ffd23d", hitSet: new Set() });
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; particles.push({ x: chest.x, y: chest.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, t: 0, life: 0.7, r: 2, color: "#fff3c8" }); }
  Game.shake = Math.max(Game.shake, 6); AudioFX.chest();
  if (Game.chestsOpened >= Game.chestsTotal) {
    SEAL.state = "ready"; toast("EVERY SEAL IS BROKEN — THE GRAND SEAL STIRS");
    shockwaves.push({ x: SEAL.x, y: SEAL.y, r: 10, max: 260, speed: 480, dmg: 0, hostile: false, color: "#ff4d5e", hitSet: new Set() });
    floatText(SEAL.x, SEAL.y - SEAL.r - 24, "THE GRAND SEAL STIRS", "#ff4d5e", 16); AudioFX.waveUp();
  } else { toast("THE SEAL YIELDS A RUNE"); } AudioFX.pickup();
}

function openHealthBox(hbox, p) {
  hbox.state = "open"; p = p || localPlayer(); const heal = 25; healPlayer(p, heal, true); healFlare(p.x, p.y);
  floatText(p.x, p.y - 34, "+" + heal + " VITALITY", "#7dff5e", 16);
  if (p === localPlayer()) toast("THE BOX OPENS — +" + heal + " VITALITY"); updateSeals(); AudioFX.pickup();
}

/* =========================================================
   SHIELDS & DAMAGE
   ========================================================= */

function shieldBurst(p) {
  p.shield--; p.shieldT = 0; p.iframes = 0.9; haptic(30); Game.shake = Math.max(Game.shake, 12);
  if (p === localPlayer()) screenFlash(0.1);
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: p.mods.shieldR, speed: 720, dmg: p.mods.shieldDmg, hostile: false, hitSet: new Set(), owner: p });
  for (let i = 0; i < 26; i++) particles.push({ x: p.x, y: p.y, vx: rnd(-360, 360), vy: rnd(-360, 360), t: 0, life: rnd(0.3, 0.7), r: rnd(2, 5), color: "#e0a86b" });
  floatText(p.x, p.y - 28, "SHIELD BURST", "#e0a86b"); AudioFX.nova(); updateHp();
}

function hurtPlayer(p, dmg, src) {
  if (typeof Net !== "undefined" && Net.role === "guest") return;
  if (p.godMode || p.iframes > 0 || p.dashT > 0 || p.veilT > 0 || p.downed || Game.state !== "play") return;
  if (p.reprieveInvul > 0) return;
  if (p.shield > 0) { shieldBurst(p); return; }

  if (src && src.wrath) dmg *= WRATH_DMG_MUL;

  /* AEGIS: wards bleed the force from the blow before it lands */
  // Clamp damage reduction at 90% total to prevent overflow healing
  const dr = Math.min(0.9, (p.mods && p.mods.dr) || 0);
  dmg *= (1 - dr);

  if (p.char === "sancho" && p.lanceWindup > 0) dmg *= 0.2;

  p.hp = clamp(p.hp - dmg, 0, p.maxHp);
  Game.flawless = false;

  /* REPRIEVE: when you would fall, enemies freeze and you're saved */
  if (p.hp <= 0 && p.mods.reprieveStacks > 0 && (p.reprieveCd || 0) <= 0) {
    const n = p.mods.reprieveStacks;
    for (const e of enemies) {
      if (!e.dead && !e.ghost) {
        e.slowT = Math.max(e.slowT, n);
        if (e.cd !== undefined) e.cd += n;
        if (e.pt !== undefined) e.pt += n;
      }
    }
    const healed = Math.floor(p.maxHp * 0.5);
    p.hp = Math.min(p.maxHp, p.hp + healed);
    const bonusHeal = Math.floor(p.maxHp * Math.min(0.8, n * 0.01));
    p.hp = Math.min(p.maxHp, p.hp + bonusHeal);
    p.reprieveCd = 1 + n * 2;
    p.reprieveInvul = Math.min(2, n * 0.67);
    Game.shake = Math.max(Game.shake, 12);
    if (p === localPlayer()) screenFlash(0.3);
    floatText(p.x, p.y - 30, "REPRIEVE", "#bcd0ff", 18);
    toast(p === localPlayer() ? "REPRIEVE — YOU ARE SPARED" : "PARTNER REPRIEVED");
    AudioFX.chest();
    updateHp();
    return;
  }

  p.iframes = 0.9;
  p.regenT = 0;
  if (src && src.rime) { applyCurse(p, "weight", RIME_SLOW_T, false); floatText(p.x, p.y - 24, "❄ CHILLED", "#5ee6ff"); }
  if (src && src.sear && Math.random() < SEAR_CHANCE) { applyCurse(p, "brand", SEAR_BURN_T, false); floatText(p.x, p.y - 24, "IGNITED", "#ff8a3d"); }
  if (p.mods.thorns) {
    shockwaves.push({ x: p.x, y: p.y, r: 8, max: 70 + 26 * p.mods.thorns,
      speed: 700, dmg: 12 + 9 * p.mods.thorns, hostile: false, hitSet: new Set(), owner: p });
    floatText(p.x, p.y - 24, "BRAMBLE", "#ff6b8a");
  }

  if (p === localPlayer()) {
    screenFlash(0.25);
    const bar = document.querySelector(".hp-bar");
    if (bar) { bar.classList.remove("hurt"); void bar.offsetWidth; bar.classList.add("hurt"); }
    haptic(40);
  }
  Game.shake = Math.max(Game.shake, 8);
  if (src && src.x !== undefined) { const a = angTo(src.x, src.y, p.x, p.y); p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14; }
  AudioFX.hurt();
  if (p.hp <= 0) { p.hp = 0; downPlayer(p); }
  updateHp();
}

/* =========================================================
   DOWNED / REVIVE
   ========================================================= */
const REVIVE_RANGE = 60;     // px a living partner must close to lift them
const REVIVE_TIME = 3;       // seconds of contact to complete the lift
const REVIVE_HP_FRAC = 0.4;  // vitality restored on the lift

function downPlayer(p) {
  p.hp = 0; const partnerUp = players.some(o => o !== p && o.hp > 0 && !o.downed); if (!partnerUp) { gameOver(); return; }
  p.downed = true; p.reviveT = 0; p.dashT = 0; p.veilT = 0; p.autoFire = false;
  floatText(p.x, p.y - 26, "DOWN", "#ff4d5e", 20); toast(p === localPlayer() ? "YOU ARE DOWN — YOUR PARTNER CAN LIFT YOU" : "YOUR PARTNER IS DOWN — REACH THEM");
  screenFlash(0.2); Game.shake = Math.max(Game.shake, 10); AudioFX.hurt(); updateHp();
}

function revivePartner(p) {
  p.downed = false; p.hp = Math.max(1, Math.round(p.maxHp * REVIVE_HP_FRAC)); p.iframes = 2; p.reviveT = 0;
  shockwaves.push({ x: p.x, y: p.y, r: 8, max: 220, speed: 520, dmg: 0, hostile: false, color: "#7dff5e", hitSet: new Set() });
  for (const e of enemies) { if (e.boss || e.dead) continue; const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y)); if (d < 260) { const a = angTo(p.x, p.y, e.x, e.y); const push = 260 - d; e.x += Math.cos(a) * push; e.y += Math.sin(a) * push; } }
  healFlare(p.x, p.y); floatText(p.x, p.y - 30, "RISEN", "#7dff5e", 18); toast(p === localPlayer() ? "YOU RISE — FIGHT ON" : "YOUR PARTNER RISES"); AudioFX.pickup(); updateHp();
}

/* =========================================================
   FLOOR TRANSITION
   ========================================================= */

function nextFloor() {
  if (Game.mapIdx === 0 && Game.loop === 0 && !keeperUnlocked()) { startVaultCutscene(); return; }
  Game.mapIdx++; if (Game.mapIdx >= FLOORS.length) { Game.mapIdx = 0; Game.loop++; }
  setupFloor(false); Game.intermission = 2.5;
}
