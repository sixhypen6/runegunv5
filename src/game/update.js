/* =========================================================
   RUNEGUN · Update — the simulation step
   The per-frame gameplay tick: movement, interactions, waves, all entity/bullet/puddle integration and the camera.
   ========================================================= */
"use strict";

/* =========================================================
   UPDATE
   ========================================================= */
/* directional sparks thrown off a surface a bullet just struck (wall or foe).
   `ang` is the direction the sparks fan around; colored to the bullet's element. */
let ambientT = 0;   // throttle for the per-floor ambient motes
/* change gates for the two DOM readouts written from inside the sim loop —
   an unchanged textContent/style write still costs a style recalc per frame */
let lastHint = null, lastBossW = -1;

function bulletSparks(b, ang, n) {
  if (particles.length > 600) return;
  const col = b.venom ? "#7dff5e" : b.frost ? "#5ee6ff" : b.ember ? "#ff7a3d" : b.pet ? "#ffe08a" : "#fff3c8";
  for (let k = 0; k < n; k++) {
    const pa = ang + rnd(-0.65, 0.65), sp = rnd(110, 290);
    particles.push({ x: b.x, y: b.y, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp,
      t: 0, life: rnd(0.12, 0.2), r: rnd(1.5, 3), color: col });
  }
}

/* =========================================================
   INPUT FRAMES — one normalized record per warden per frame.
   The local warden's frame samples the device (Input + Meta) and
   consumes the tap latches; a partner's frame comes from Net.frameFor
   (the dev harness in Phase A, the wire in Phase C).
   ========================================================= */
function localInputFrame() {
  let mx = Input.moveX, my = Input.moveY;
  if (!Input.touchMode) {
    mx = (Input.keys.KeyD || Input.keys.ArrowRight ? 1 : 0) - (Input.keys.KeyA || Input.keys.ArrowLeft ? 1 : 0);
    my = (Input.keys.KeyS || Input.keys.ArrowDown ? 1 : 0) - (Input.keys.KeyW || Input.keys.ArrowUp ? 1 : 0);
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  }
  const f = { mx, my, aimX: Input.aimX, aimY: Input.aimY, aiming: Input.aiming,
    mouseX: Input.mouseX, mouseY: Input.mouseY, mouseDown: Input.mouseDown,
    touchMode: Input.touchMode, aimMode: Meta.aimMode, deskMode: Meta.deskMode,
    dashTap: Input.dashTap, useTap: Input.useTap, bleed: Input.bleed };
  Input.dashTap = false; Input.useTap = false;
  return f;
}
function zeroFrame() {
  return { mx: 0, my: 0, aimX: 0, aimY: 0, aiming: false, mouseX: undefined, mouseY: undefined,
    mouseDown: false, touchMode: true, aimMode: "auto", deskMode: "auto", dashTap: false, useTap: false };
}
function inputFrameFor(p) {
  if (p === localPlayer()) return localInputFrame();
  const f = (typeof Net !== "undefined" && Net.frameFor) ? Net.frameFor(p) : null;
  return f || zeroFrame();
}

/* =========================================================
   PER-WARDEN TICK — movement, dash, auras-on-self, aim, gun.
   Extracted verbatim from the old single-player block; `p` is
   the warden, `inp` their input frame for this tick.
   ========================================================= */
function updatePlayer(p, inp, dt) {
  if (p.hp <= 0 && !p.downed) return;
  const isLocal = p === localPlayer();
  const mx = inp.mx, my = inp.my;
  p.dashCd -= dt;
  p.iframes -= dt;
  p.warpedT = Math.max(0, (p.warpedT || 0) - dt);

  /* SANCHO PASSIVES: Hardblood & Bloodfeast */
  if (p.char === "sancho" && !p.downed && p.hp > 0) {
    p.hbTimer -= dt;
    if (p.hbTimer <= 0) {
      p.hbTimer = 20; // 1 Hardblood every 20 seconds
      p.hardblood = Math.min(30, p.hardblood + 1);
    }
    // Stages
    if (p.hardblood >= 20) p.hbStage = 3;
    else if (p.hardblood >= 10) p.hbStage = 2;
    else p.hbStage = 1;

    // Stage Buffs: +10% DMG / -10% DR per 6 stacks
    const m = p.mods;
    const hbPower = Math.floor(p.hardblood / 6);
    m.dmg *= (1 + hbPower * 0.1);
    m.dr += (hbPower * 0.1);
    p.speed = 320 * (p.hbStage === 3 ? 1.3 : p.hbStage === 2 ? 1.15 : 1.0);

    // Weapon Scaling logic
    p.weaponMode = p.weaponMode || "melee";
    if (p.weaponMode === "melee") {
       if (p.hbStage === 3) { m.size = 110; m.rate = 4.2; m.dmg = 20; } // Lance
       else if (p.hbStage === 2) { m.size = 85; m.rate = 3.8; m.dmg = 16; } // Saber
       else { m.size = 65; m.rate = 3.4; m.dmg = 12 + (p.sanchoBonusDmg || 0); } // Fists
    } else { // BOW
       m.dmg = 10 + Math.floor(p.hardblood / 10) * 5;
       m.rate = 2.5 + Math.floor(p.hardblood / 10) * 0.25;
       m.size = 6; m.speed = 1000; m.count = 1; m.spread = 0.05;
    }

    // La Aventura Ha Terminado (Q)
    if (Input.ultTap && p.hardblood >= 30 && !p.sanchoUlt) {
      p.sanchoUlt = 0.5; // Start windup
      Input.ultTap = false;
      toast("LA AVENTURA HA TERMINADO!");
    }
    if (p.sanchoUlt > 0) {
      p.sanchoUlt -= dt;
      p.vx = p.vy = 0; // Rooted during windup
      if (p.sanchoUlt <= 0) {
        p.sanchoUlt = -0.7; // Transition to Jump/Slam phase (0.7s total)
        p.iframes = 1.0; // Invulnerable during jump
      }
    } else if (p.sanchoUlt < 0) {
      p.sanchoUlt += dt;
      p.vx = p.vy = 0;
      if (p.sanchoUlt >= 0) {
        p.sanchoUlt = 0;
        p.hardblood = 0; // Consume stacks
        // Slam damage
        shockwaves.push({ x: p.x, y: p.y, r: 12, max: 280, speed: 900, dmg: 150, hostile: false, color: "#ff0000", hitSet: new Set(), owner: p });
        for (let k = 0; k < 20; k++) particles.push({ x: p.x, y: p.y, vx: rnd(-300, 300), vy: rnd(-300, 300), t: 0, life: 0.6, r: rnd(3, 6), color: "#ff4d5e" });
        Game.shake = Math.max(Game.shake, 15);
        AudioFX.slam();
      }
    }
  }

  // Warp: Dimensional Shred sequence
  if (p.shredPoints && p.shredPoints.length > 0) {
    p.shredT -= dt;
    p.shredNextT -= dt;
    if (p.shredNextT <= 0) {
      const pt = p.shredPoints.shift();
      if (pt) {
        const oldX = p.x, oldY = p.y;
        p.x = pt.x; p.y = pt.y;
        collideWorld(p);
        p.shredNextT = 0.05; // Slightly faster slices
        // Slice effect: line between old and new position
        zaps.push({ x1: oldX, y1: oldY, x2: p.x, y2: p.y, t: 0, color: "#9d6bff" });
        AudioFX.zap();
        // Damage everything along the path
        let shredDmg = (p.mods ? p.mods.dmg : 10) * 3.5;
        if (p.char === "sinner") shredDmg *= 2.0; // WAYWARD PASSENGER +100% shred dmg
        for (const e of enemies) {
          if (e.dead || e.ghost || e.team === "p") continue;
          const d2line = distToLine2(e.x, e.y, oldX, oldY, p.x, p.y);
          if (d2line < (e.r + 20) ** 2) damageEnemy(e, shredDmg, { owner: p, x: p.x, y: p.y, melee: true });
        }
      }
    }
    if (p.shredT <= 0 || p.shredPoints.length === 0) { p.shredPoints = null; p.shredTgt = null; }
    return; // Don't allow other movement while shredding
  }

  p.reprieveInvul = Math.max(0, (p.reprieveInvul || 0) - dt);
  p.reprieveCd = Math.max(0, (p.reprieveCd || 0) - dt);
  p.kickT = Math.max(0, (p.kickT || 0) - dt);
  /* THE SHREDDER: always-active void chainsaw */
  if (p.char === "shredder" && !p.downed && p.hp > 0) {
    const m = p.mods;
    // Independent visual rotation
    const baseSpin = 28;
    const rateBonus = (m.rate - 8) * 4;
    const speedBonus = (m.speed / 540 - 1) * 10;
    p.sawRot = (p.sawRot || 0) + dt * (baseSpin + rateBonus + speedBonus);

    // Angular rotation bonus: spinning the aim stick accelerates shredding
    let dAim = Math.abs(p.aim - (p.lastAim || p.aim));
    if (dAim > Math.PI) dAim = Math.abs(dAim - TAU);
    p.lastAim = p.aim;

    p.sawT = (p.sawT || 0) - (dt + Math.min(dAim, 0.4) * 0.4); // rotation speed boosts shred rate
    p.sawHitting = false;
    if (p.sawT <= 0) {
      p.sawT = 0.1; // base shred every 0.1s
      const sawR = m.size + (m.speed - 540) * 0.1; // speed rune slightly increases range
      const dashMul = (p.dashT > 0) ? 2.5 : 1; // +150% damage while dashing
      const sawDmg = m.dmg * (m.rate / 5) * dashMul;
      for (const e of enemies) {
        if (e.dead || e.ghost || e.spawnT > 0) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (sawR + e.r) ** 2) {
          if (e.team === "p") continue; // protect thralls
          p.sawHitting = true;
          p.lastHitEnemy = e; // remember who we are shredding
          damageEnemy(e, sawDmg, { owner: p, x: p.x, y: p.y, knock: m.knock * 0.4, melee: true });
          for (let k = 0; k < 2; k++) particles.push({
            x: (p.x + e.x) / 2 + rnd(-5, 5), y: (p.y + e.y) / 2 + rnd(-5, 5),
            vx: rnd(-120, 120), vy: rnd(-120, 120), t: 0, life: 0.12, r: rnd(1, 2.5), color: "#fff3c8"
          });
        }
      }
    } else {
      // maintain flag between damage ticks so firing feels smooth
      const sawR = m.size + (m.speed - 540) * 0.1;
      for (const e of enemies) {
        if (!e.dead && !e.ghost && e.spawnT <= 0 && dist2(p.x, p.y, e.x, e.y) < (sawR + e.r) ** 2) {
          p.sawHitting = true; break;
        }
      }
    }
  }
  /* DOWNED: a slow crawl toward help — no dash, no gun, no interactions */
  if (p.downed) {
    p.x += mx * p.speed * 0.35 * dt;
    p.y += my * p.speed * 0.35 * dt;
    collideWorld(p);
    if ((mx || my) && Math.random() < dt * 8)
      particles.push({ x: p.x + rnd(-6, 6), y: p.y + rnd(-2, 8), vx: rnd(-15, 15), vy: rnd(-30, -8),
        t: 0, life: 0.4, r: rnd(1.5, 3), color: "#ff4d5e" });
    return;
  }
  if (inp.dashTap && p.dashCd <= 0) {
    const dashA = (mx || my) ? Math.atan2(my, mx) : p.aim;
    let warped = false;

    if (p.mods.warp) {
      // Find a target in the cone of the dash
      const tgt = findTargetInCone(p.x, p.y, dashA, 500, 1.2);
      if (tgt) {
        // DIMENSIONAL SHRED: Generate 5 sequence points (Pentagram-like shred)
        p.shredPoints = [];
        const r = tgt.r + rnd(60, 100);
        const startA = rnd(0, TAU);
        for (let i = 0; i < 5; i++) {
          const pa = startA + (i / 5) * TAU * 2; // Star pattern order
          p.shredPoints.push({ x: tgt.x + Math.cos(pa) * r, y: tgt.y + Math.sin(pa) * r });
        }
        p.shredT = 0.4;
        p.shredTgt = tgt;
        p.shredNextT = 0;
        p.warpedT = 1.8;
        p.iframes = Math.max(p.iframes, 0.7);
        warped = true;
        toast("DIMENSIONAL SHRED");
        AudioFX.bossRoar();
      }
    }

    if (warped) {
      p.dashCd = p.dashCdBase * 1.5;
    } else {
      p.dashT = p.dashDur; p.dashCd = p.dashCdBase;
      p.dashAng = dashA;
      p.wasOverLava = false;
      p.mineTrailT = 0;   // DEMOLITIONIST: the first dash-mine drops immediately
      p.dashHitSet = new Set(); // Sancho/Warden dash-hit tracking
      AudioFX.dash();
    }
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += Math.cos(p.dashAng) * (p.dashSpeed || 720) * dt;
    p.y += Math.sin(p.dashAng) * (p.dashSpeed || 720) * dt;
    const dashCol = p.char === "sancho" ? "rgba(204,0,0,0.6)" : "rgba(94,230,255,0.5)";
    particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0, life: 0.25, r: 9, color: dashCol });

    /* SANCHO: Blood Dash — wounds everything she passes through */
    if (p.char === "sancho") {
      for (const e of enemies) {
        if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p") continue;
        if (p.dashHitSet && p.dashHitSet.has(e)) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r + 24) ** 2) {
          p.dashHitSet.add(e);
          // Lance Dash Bonus: +150% dmg while thrusting in Stage 3
          let dashDmgMul = 2.0;
          if (p.weaponMode === "melee" && p.hbStage === 3) dashDmgMul = 3.5;
          damageEnemy(e, p.mods.dmg * dashDmgMul, { owner: p, x: p.x, y: p.y, melee: true, bleed: p.mods.bleed });
          // Impact spray
          for (let k = 0; k < 5; k++) particles.push({ x: e.x, y: e.y, vx: rnd(-150, 150), vy: rnd(-150, 150), t: 0, life: 0.2, r: rnd(2, 4), color: "#cc0000" });
          AudioFX.hit();
        }
      }
    }

    if (p.dashT <= 0) {
      if (p.char === "wraith") p.iframes = Math.max(p.iframes, 0.35);
      if (p.char === "shredder") p.iframes = Math.max(p.iframes, 0.45); // extra iframes for shredder
    }
    /* skimming fire: dashing across lava is damage-free but kicks a hissing ember wake */
    p.lavaWakeT = (p.lavaWakeT || 0) - dt;
    let overLava = false;
    for (const pu of puddles) if (pu.lava && dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2) { overLava = true; break; }
    if (overLava && p.lavaWakeT <= 0) {
      p.lavaWakeT = 0.06;
      if (!p.wasOverLava) AudioFX.sizzle();
      for (let k = 0; k < 3; k++) {
        const wa = p.dashAng + Math.PI + rnd(-0.5, 0.5);
        particles.push({ x: p.x, y: p.y, vx: Math.cos(wa) * rnd(120, 260), vy: Math.sin(wa) * rnd(120, 260),
          t: 0, life: 0.35, r: rnd(2, 4), color: "#ff5e2e" });
      }
    }
    p.wasOverLava = overLava;
    /* THE DEMOLITIONIST sows its wake — a dash leaves a few mines along the path */
    if (p.char === "demolitionist") {
      p.mineTrailT = (p.mineTrailT || 0) - dt;
      if (p.mineTrailT <= 0) { p.mineTrailT = 0.055; placeMine(p, p.x, p.y); }
    }
    /* PHASE rune: cutting wake — carries your elemental kit (burn / chill / poison / storm / bleed) */
    if (p.mods.dashTrail) {
      const m = p.mods;
      const col = m.bleed ? "#ff4d5e" : m.ember ? "#ff7a3d" : m.venom ? "#7dff5e" : m.frost ? "#5ee6ff" : "#7ad7ff";
      puddles.push({ x: p.x, y: p.y, r: 20 + 5 * m.dashTrail, t: 0, life: 1.1,
        team: "p", dmg: 5 + 4 * m.dashTrail, color: col, tickMap: {}, phase: true, owner: p });
    }
  } else {
    const weightMul = curseActive(p, "weight") ? 0.5 : 1;
    /* flood water drags at your boots — dashing skims it, like lava */
    let wadeMul = 1;
    for (const pu of puddles) if (pu.water && dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2) { wadeMul = 0.6; break; }
    p.x += mx * p.speed * weightMul * wadeMul * dt;
    p.y += my * p.speed * weightMul * wadeMul * dt;
    if (wadeMul < 1 && (mx || my) && Math.random() < dt * 10) {
      particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(0, 10),
        vx: rnd(-45, 45), vy: rnd(-90, -25), t: 0, life: rnd(0.2, 0.4), r: rnd(1.5, 3), color: "#7de8e0" });
    }
  }
  collideWorld(p);
  /* MEND: wounds knit closed when you go untouched */
  if (p.mods.regen && p.hp < p.maxHp && p.hp > 0) {
    p.regenT = (p.regenT || 0) + dt;
    if (p.regenT >= p.mods.regenDelay) { p.hp = Math.min(p.maxHp, p.hp + p.mods.regen * dt); updateHp(); }
  }
  /* HULL DISTRESS: the battered ship spits yellow sparks at critical HP */
  if (p.hp > 0 && p.hp / p.maxHp < 0.3 && p.veilT <= 0 && particles.length < 480) {
    const frac = p.hp / p.maxHp;
    if (Math.random() < dt * (5 + 15 * (1 - frac / 0.3))) {
      const a = rnd(0, TAU), rr = rnd(6, p.r);
      particles.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr,
        vx: Math.cos(a) * rnd(40, 130), vy: Math.sin(a) * rnd(40, 130) - 30,
        t: 0, life: rnd(0.15, 0.35), r: rnd(1.5, 3.5), color: "#ffd23d" });
    }
  }
  /* SLIME: lay a caustic trail in your wake while you move */
  if (p.mods.slime && (mx || my || p.dashT > 0)) {
    p.slimeT = (p.slimeT || 0) - dt;
    if (p.slimeT <= 0 && puddles.length < 150) {
      p.slimeT = 0.1;
      puddles.push({ x: p.x, y: p.y, r: 13 + 4 * p.mods.slime, t: 0,
        life: 1.4 + 0.3 * p.mods.slime, team: "p", dmg: 2 + p.mods.slime,
        color: "#86d020", tickMap: {}, slime: true, owner: p });
    }
  }
  /* BULWARK shield: every 12s, one spent charge returns — a full refill takes 12s per charge */
  if (p.shieldMax > 0 && p.shield < p.shieldMax) {
    p.shieldT += dt;
    if (p.shieldT >= 12) { p.shieldT = 0; p.shield++; AudioFX.pickup(); }
  } else p.shieldT = 0;
  if (p.veilT > 0) {
    p.veilT = Math.max(0, p.veilT - dt);
    /* a thin trail of mist marks where the vanished wraith drifts */
    if (Math.random() < 0.6) particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8),
      vx: rnd(-30, 30), vy: rnd(-40, 10), t: 0, life: 0.3, r: rnd(2, 4), color: "rgba(94,230,255,0.4)" });
  }
  /* aim resolution — mouse math is only meaningful on the local screen (Game.cam) */
  if (!inp.touchMode) {
    if (inp.deskMode === "auto") {
      const tgt = nearestEnemy(p.x, p.y);
      if (tgt) { p.aim = angTo(p.x, p.y, tgt.x, tgt.y); p.autoFire = true; }
      else {
        if (isLocal && inp.mouseX !== undefined)
          p.aim = Math.atan2((inp.mouseY / ZOOM + Game.cam.y) - p.y, (inp.mouseX / ZOOM + Game.cam.x) - p.x);
        p.autoFire = false;
      }
    } else if (isLocal && inp.mouseX !== undefined) {
      p.aim = Math.atan2((inp.mouseY / ZOOM + Game.cam.y) - p.y, (inp.mouseX / ZOOM + Game.cam.x) - p.x);
    }
  } else if (inp.aimMode === "auto") {
    const tgt = nearestEnemy(p.x, p.y);
    if (tgt) { p.aim = angTo(p.x, p.y, tgt.x, tgt.y); p.autoFire = true; }
    else p.autoFire = false;
  }
  fireWeapon(p, inp, dt);
}

function update(dt) {
  Game.time += dt;
  if (Game.flawlessToast > 0) Game.flawlessToast = Math.max(0, Game.flawlessToast - dt);
  if (Game.hitstop > 0) { Game.hitstop -= dt; return; }
  /* boss-death ceremony: the blasts play out, then the toll is offered */
  if (Game.ceremonyT > 0) {
    Game.ceremonyT -= dt;
    if (Game.ceremonyT <= 0) { Game.ceremonyT = 0; setState("choice"); return; }
  }
  /* boss-death slow-motion: time drags while the corpse comes apart */
  if (Game.slowmo > 0) { Game.slowmo = Math.max(0, Game.slowmo - dt); dt *= 0.35; }
  tickCurses(dt);
  if (typeof updateSanchoMeters === "function") updateSanchoMeters();
  if (Game.state !== "play") return;

  /* --- wardens: input frames, then each takes their tick --- */
  const frames = players.map(p => inputFrameFor(p));
  for (const p of players) {
    updatePlayer(p, frames[p.idx], dt);
    if (Game.state !== "play") return;   // a thorns kill / veil kill can end the frame
  }

  /* --- revive: living hands close on a downed partner --- */
  for (const p of players) {
    if (!p.downed || p.gone) continue;
    let rescuer = null;
    for (const o of alivePlayers()) if (dist2(o.x, o.y, p.x, p.y) < REVIVE_RANGE ** 2) { rescuer = o; break; }
    if (rescuer) {
      p.reviveT += dt;
      if (Math.random() < dt * 12) particles.push({ x: p.x + rnd(-14, 14), y: p.y + rnd(-14, 6),
        vx: rnd(-15, 15), vy: rnd(-70, -25), t: 0, life: rnd(0.3, 0.6), r: rnd(1.5, 3), color: "#7dff5e" });
      if (p.reviveT >= REVIVE_TIME) revivePartner(p);
    } else p.reviveT = Math.max(0, p.reviveT - dt * 2);
  }

  /* --- interactions: chests, grand seal, portal --- */
  for (const c of chests) c.pulse += dt * 2;
  for (const h of healthBoxes) h.pulse += dt * 2;
  SEAL.pulse += dt * 1.5;
  /* THE UNKNOWN — ticked once per frame; only the local warden communes */
  const rh = updateRift(dt);
  let hint = null;                       // the LOCAL warden's hint (DOM readout)
  for (const p of alivePlayers()) {
    let pHint = null, pAct = null;
    for (const c of chests) {
      if (c.state === "sealed" && dist2(c.x, c.y, p.x, p.y) < 64 * 64 && !Game.ambush) {
        pHint = "[ E ] BREAK THE SEAL"; pAct = () => triggerAmbush(c);
      }
    }
    for (const h of healthBoxes) {
      if (h.state === "sealed" && dist2(h.x, h.y, p.x, p.y) < 64 * 64 && !Game.ambush) {
        pHint = "[ E ] TAKE THE VITALITY"; pAct = () => openHealthBox(h, p);
      }
    }
    if (SEAL.state === "ready" && dist2(SEAL.x, SEAL.y, p.x, p.y) < (SEAL.r + 40) ** 2 && !Game.ambush) {
      pHint = "[ E ] WAKE WHAT SLEEPS BELOW"; pAct = () => spawnBoss();
    }
    if (p === localPlayer()) {
      if (rh.hint && !pHint) { pHint = rh.hint; pAct = rh.act; }
      hint = pHint;
    }
    const f = frames[p.idx];
    if (f && f.useTap && pAct) pAct();
  }
  if (Input.touchMode && hint) hint = hint.replace("[ E ]", "[ SEAL ]");
  if (hint !== lastHint) {
    lastHint = hint;
    const hintEl = $("interactHint");
    hintEl.textContent = hint || "";
    hintEl.style.opacity = hint ? 1 : 0;
  }

  if (portal) {
    portal.t += dt;
    /* motes drawn into the way down — it visibly pulls */
    if (Math.random() < 0.5 && particles.length < 500) {
      const pa = rnd(0, TAU), pd = rnd(60, 130);
      const sx = portal.x + Math.cos(pa) * pd, sy = portal.y + Math.sin(pa) * pd;
      const ia = angTo(sx, sy, portal.x, portal.y);
      particles.push({ x: sx, y: sy, vx: Math.cos(ia) * rnd(70, 140), vy: Math.sin(ia) * rnd(70, 140),
        t: 0, life: 0.5, r: rnd(1.5, 3), color: "#9d6bff" });
    }
    /* either warden stepping through takes them BOTH down */
    if (portal.t > 0.8) for (const p of alivePlayers()) {
      if (dist2(portal.x, portal.y, p.x, p.y) < (portal.r + p.r) ** 2) {
        portal = null;
        Game.floorFade = 1;          // the dark swallows the descent, then releases the new floor
        nextFloor();
        return;
      }
    }
  }

  /* --- pickups: whichever warden touches the orb rolls from THEIR pool ---
     One choice at a time. With two orbs down (a chest each, or the boss toll)
     both wardens can touch on the SAME frame, and Game.pendingPickup is a
     single slot — so a second claim while one is unresolved is dropped here
     rather than overwriting the first. The untouched orb simply waits and
     opens its own choice on a later frame. */
  if (!Game.pendingPickup) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i]; pk.t += dt;
      for (const p of alivePlayers()) {
        if (dist2(pk.x, pk.y, p.x, p.y) < (pk.r + p.r + 8) ** 2) {
          Game.pendingPickup = pk;
          Game.pendingPickupBy = p.idx;
          if (!pk.ids) pk.ids = genThreeRunes(p);
          openRuneChoice();
          return;
        }
      }
    }
  } else for (const pk of pickups) pk.t += dt;   // still bob while one is open

  /* --- waves keep coming until the warden falls --- */
  const ambient = enemies.filter(e => !e.ambush && !e.boss && e.team !== "p").length;
  if (!Game.ambush && !Game.boss && ambient === 0 && !portal && !Game.inRift && !Game.ceremonyT) {
    Game.intermission -= dt;
    if (Game.intermission <= 0) {
      startWave();
      const stealthStacks = players.reduce((sum, p) => sum + (p.mods ? p.mods.stealth || 0 : 0), 0);
      Game.intermission = 3 + stealthStacks * 3;
    }
  }

  /* --- enemies --- */
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      if (e.boss) {                                  // a warden tearing its way in
        Game.shake = Math.max(Game.shake, 3);        // a low, building tremor of anticipation
        if (Math.random() < 0.6) {                   // motes spiralling into the seal
          const a = rnd(0, TAU), d = rnd(e.r + 70, e.r + 190);
          const sx = e.x + Math.cos(a) * d, sy = e.y + Math.sin(a) * d;
          const ia = angTo(sx, sy, e.x, e.y) + 0.5;
          particles.push({ x: sx, y: sy, vx: Math.cos(ia) * 230, vy: Math.sin(ia) * 230, t: 0, life: 0.4, r: rnd(2, 4), color: e.color });
        }
        if (e.spawnT <= 0) bossArrives(e);            // it lands
      }
      continue;
    }
    e.slowT -= dt;
    /* STILLPOINT: any warden's time bubble keeps nearby foes mired */
    for (const p of alivePlayers()) {
      if (p.mods.timeField && dist2(e.x, e.y, p.x, p.y) < p.mods.timeR ** 2) { e.slowT = Math.max(e.slowT, 0.12); break; }
    }
    e.slowMul = e.slowT > 0 ? (e.boss ? 0.7 : 0.45) : 1;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) {
        /* the burn keeps its author — their FROST/STORM ride every tick */
        const bm = e.burnBy ? e.burnBy.mods : null;
        e.burnTick = 0.45; damageEnemy(e, e.burnDps, e.burnBy ? { owner: e.burnBy } : undefined);
        particles.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-20, 20), vy: rnd(-90, -40), t: 0, life: 0.4, r: 3, color: "#ff4d2e" });
        if (bm && bm.frost) e.slowT = Math.max(e.slowT, 1 + 0.7 * bm.frost);
        if (bm && bm.storm && !e.dead) chainStorm(e, bm.storm, new Set([e]), e.burnBy);
      }
      if (e.dead) { enemies.splice(i, 1); continue; }
    }
    if (e.bleedT > 0) {
      e.bleedT -= dt; e.bleedTick -= dt;
      if (e.bleedTick <= 0) {
        e.bleedTick = 1.0;
        const bDmg = e.bleedDps;
        damageEnemy(e, bDmg, e.bleedBy ? { owner: e.bleedBy } : undefined);
        bloodfeast = Math.min(999, (bloodfeast || 0) + bDmg); // 100% of bleed damage contributes
        particles.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-10, 10), vy: rnd(-30, 0), t: 0, life: 0.5, r: 2, color: "#ff4d5e" });
      }
      if (e.dead) { enemies.splice(i, 1); continue; }
    }

    // Debug AI override
    if (e.debugAI === 'none') {
      e.vx = 0; e.vy = 0;
    } else if (e.debugAI === 'aggro') {
      e.alerted = true;
      ETYPES[e.type].ai(e, dt);
    } else if (e.fearT > 0 && !e.boss) {
      e.fearT -= dt;
      const FP = findTarget(e);
      const fa = angTo(FP.x, FP.y, e.x, e.y);
      e.vx = Math.cos(fa) * e.speed * e.slowMul; e.vy = Math.sin(fa) * e.speed * e.slowMul;
    } else if (e.boss) {
      e.alerted = true; // Bosses are always alerted
      bossAI(e, dt);
    } else {
      const hasStealth = players.some(p => p.mods && p.mods.stealth > 0);
      const isFriendly = e.team === "p";

      if (isFriendly) {
        // Friendly thrall: hunt enemies if they exist, otherwise follow aim
        const target = findTarget(e);
        if (target) {
          ETYPES[e.type].ai(e, dt);
        } else {
          passiveAI(e, dt);
        }
      } else {
        // Hostile enemy logic
        if (hasStealth && !e.alerted) {
          passiveAI(e, dt);
        } else {
          ETYPES[e.type].ai(e, dt);
        }
      }
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    /* a slaghulk mid-leap sails clean over the rocks; a shade simply drifts through them —
       both still honor the arena's outer walls */
    if (!e.airLeap && !e.noclip) collideWorld(e);
    else { e.x = clamp(e.x, 30 + e.r, MAP.w - 30 - e.r); e.y = clamp(e.y, 30 + e.r, MAP.h - 30 - e.r); }
    e.hitFlash -= dt;
    /* MAELSTROM: gravity wells gently gather the living toward a corpse */
    if (!e.boss) {
      for (const pu of puddles) {
        if (!pu.vortex) continue;
        const vd2 = dist2(e.x, e.y, pu.x, pu.y);
        if (vd2 < pu.r * pu.r && vd2 > 1) {
          const vd = Math.sqrt(vd2), va = angTo(e.x, e.y, pu.x, pu.y), pull = 90 * (1 - vd / pu.r) * dt;
          e.x += Math.cos(va) * pull; e.y += Math.sin(va) * pull;
        }
      }
    }
    /* PRICKLE: any warden's thornfield pricks whatever strays in, for very little */
    if (!e.ghost) {
      e.prickleTick = (e.prickleTick || 0) - dt;
      if (e.prickleTick <= 0) for (const p of alivePlayers()) {
        if (p.mods.prickle && dist2(e.x, e.y, p.x, p.y) < p.mods.prickleR ** 2) {
          e.prickleTick = 0.4;
          let pDmg = 1.5 + 1.2 * p.mods.prickle; // Buffed base scaling
          if (p.char === "sancho") pDmg *= 2.5; // Sancho Synergy: Blood Rose
          damageEnemy(e, pDmg, { owner: p });
          break;
        }
      }
    }
    /* friendly puddles bite enemies — shared timer prevents overlapping puddles from stacking */
    if (!e.ghost && e.team !== "p") {
      e.puddleTick = (e.puddleTick || 0) - dt;
      for (const pu of puddles) {
        if (pu.team !== "p" && !(pu.team === undefined)) continue;
        if (!pu.vortex && (pu.team === "p" || pu.venomous) && dist2(e.x, e.y, pu.x, pu.y) < (pu.r + e.r * 0.5) ** 2) {
          if (e.puddleTick <= 0) {
            /* the pool bites with its POURER's elements */
            const pown = pu.owner;
            const m = pown ? pown.mods : null;
            e.puddleTick = 0.4; damageEnemy(e, pu.dmg, pown ? { owner: pown } : undefined);
            if (m && m.ember) { e.burnT = Math.max(e.burnT, 2 + m.ember); e.burnDps = Math.max(e.burnDps, 2 + 2 * m.ember); e.burnBy = pown; }
            if (m && m.frost) e.slowT = Math.max(e.slowT, 1 + 0.7 * m.frost);
            if (m && m.bleed) { e.bleedT = Math.max(e.bleedT, 1 + 0.5 * m.bleed); e.bleedDps = Math.max(e.bleedDps, 3 * m.bleed); e.bleedBy = pown; }
            if (m && m.storm && !e.dead) chainStorm(e, m.storm, new Set([e]), pown);
            /* the PHASE wake also seeds poison if you carry VENOM */
            if (pu.phase && m && m.venom && !e.dead && puddles.length < 140) {
              puddles.push({ x: e.x, y: e.y, r: 18 + 8 * m.venom, t: 0, life: 2.2,
                team: "p", dmg: 3 + 2 * m.venom, color: "#7dff5e", tickMap: {}, owner: pown });
            }
          }
          break;
        }
      }
    }
    if (e.dead) enemies.splice(i, 1);
  }
  /* the player may have died to enemy contact mid-loop — stop simulating the
     frame so nothing (pets, stray bullets) can overwrite the death/continue screen */
  if (Game.state !== "play") return;

  /* separation */
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const a = enemies[i], b = enemies[j];
    if (a.ghost || b.ghost || a.noclip || b.noclip) continue;   // the incorporeal shoulder past everything
    const d2 = dist2(a.x, a.y, b.x, b.y), min = a.r + b.r;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (min - d) / 2, ang = angTo(b.x, b.y, a.x, a.y);
      a.x += Math.cos(ang) * push; a.y += Math.sin(ang) * push;
      b.x -= Math.cos(ang) * push; b.y -= Math.sin(ang) * push;
    }
  }

  /* --- pets --- */
  for (const pet of pets) { if (Game.state !== "play") break; updatePet(pet, dt); }

  /* --- Hellforge meltdown: superheated rocks run into lava once the Tyrant walks --- */
  tickForgeMelt(dt);

  /* --- hostile puddles bite the wardens --- */
  for (const p of alivePlayers()) {
    p.puddleTick -= dt;
    for (const pu of puddles) {
      if (pu.team !== "e") continue;
      if (!pu.dmg) continue;   // the Nave's flood water wades, it doesn't bite
      if (dist2(p.x, p.y, pu.x, pu.y) < (pu.r * 0.9) ** 2 && p.puddleTick <= 0 && p.dashT <= 0 && p.veilT <= 0) {
        p.puddleTick = 0.5;
        /* standing in fire must READ as fire: embers splash off your boots, it hisses */
        if (pu.lava) {
          for (let k = 0; k < 7; k++) particles.push({ x: p.x + rnd(-8, 8), y: p.y + rnd(-4, 10),
            vx: rnd(-90, 90), vy: rnd(-160, -40), t: 0, life: rnd(0.25, 0.45), r: rnd(2, 4), color: "#ff5e2e" });
          AudioFX.sizzle();
        }
        hurtPlayer(p, pu.dmg, null);
      }
    }
  }

  /* --- mines: the Demolitionist's seeded floor waits for a footfall --- */
  for (let i = mines.length - 1; i >= 0; i--) {
    const mn = mines[i]; mn.t += dt;
    if (mn.armT > 0) { mn.armT -= dt; continue; }   // still settling — can't be tripped yet
    if (mn.t > mn.life) {
      /* the charge sours and dies with a dull fizzle */
      for (let k = 0; k < 4; k++) particles.push({ x: mn.x, y: mn.y, vx: rnd(-30, 30), vy: rnd(-60, -15),
        t: 0, life: 0.3, r: rnd(1.5, 3), color: "#8a5a3d" });
      mines.splice(i, 1); continue;
    }
    let trigger = null;
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0) continue;
      if (dist2(mn.x, mn.y, e.x, e.y) < (mn.r + e.r) ** 2) { trigger = e; break; }
    }
    if (trigger) { mines.splice(i, 1); detonateMine(mn, trigger); }
  }

  /* --- mortar shells: the Demolitionist's rounds mid-lob — airborne like a
         slag leap (rock can't stop them) yet still a bullet to whatever they cross --- */
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i]; sh.t += dt;
    const p = Math.min(sh.t / sh.T, 1);
    sh.x = lerp(sh.sx, sh.lx, p);
    sh.y = lerp(sh.sy, sh.ly, p);
    if (p >= 1) { shells.splice(i, 1); shellSlam(sh); continue; }
    for (const e of enemies) {
      if (e.dead || e.ghost || e.spawnT > 0 || sh.hitSet.has(e)) continue;
      if (dist2(sh.x, sh.y, e.x, e.y) < (sh.r + e.r) ** 2) {
        sh.hitSet.add(e);
        damageEnemy(e, sh.dmg, sh);
        bulletSparks(sh, angTo(sh.lx, sh.ly, sh.sx, sh.sy), 4);
      }
    }
    if (Game.state !== "play") return;   // a clip can fell the warden mid-frame
  }

  /* --- player bullets --- */
  const hole = Game.boss && Game.boss.kind === 4 && !Game.boss.airborne && Game.boss.spawnT <= 0 ? Game.boss : null;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.t += dt;
    /* THE EVENT HORIZON bends every shot that strays too close */
    if (hole) {
      const d = Math.sqrt(dist2(b.x, b.y, hole.x, hole.y));
      if (d > 1 && d < 380) {
        const aa = angTo(b.x, b.y, hole.x, hole.y);
        const g = 1500 * (1 - d / 380) * (hole.feasting ? 1.7 : 1);
        b.vx += Math.cos(aa) * g * dt; b.vy += Math.sin(aa) * g * dt;
      }
      /* while it FEASTS, anything that touches it is swallowed — and counted */
      if (hole.feasting && d < hole.r + b.r + 28) {
        hole.stored++;
        const ia = angTo(b.x, b.y, hole.x, hole.y);
        for (let k = 0; k < 3; k++)
          particles.push({ x: b.x, y: b.y, vx: Math.cos(ia) * rnd(180, 320), vy: Math.sin(ia) * rnd(180, 320), t: 0, life: 0.22, r: 2, color: "#fff3c8" });
        if (hole.stored % 10 === 0) floatText(hole.x, hole.y - hole.r - 24, "FED ×" + hole.stored, "#fff3c8");
        bullets.splice(i, 1);
        continue;
      }
    }
    if (b.homing) {
      let best = null, bd = 380 * 380;
      for (const e of enemies) {
        if (e.spawnT > 0 || e.ghost) continue;
        const d = dist2(b.x, b.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const want = angTo(b.x, b.y, best.x, best.y);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const turn = clamp(diff, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
      }
    }
    if (b.relD !== undefined && b.owner) {
      // TRUE MELEE HITBOX: Stick to player
      b.x = b.owner.x + Math.cos(b.owner.aim + b.relA) * b.relD;
      b.y = b.owner.y + Math.sin(b.owner.aim + b.relA) * b.relD;
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt;
    }

    // MULTI-HIT REFRESH: periodic hitSet clear for weapons like the Lance
    if (b.hitRefreshT !== undefined) {
      b.hrT = (b.hrT || 0) + dt;
      if (b.hrT >= b.hitRefreshT) {
        b.hrT = 0;
        if (b.hitSet) b.hitSet.clear();
      }
    }

    let dead = b.t > b.life;
    let bounced = false;
    if (!b.melee) {
      if (b.x < 32 || b.x > MAP.w - 32) { b.vx *= -1; b.x = clamp(b.x, 33, MAP.w - 33); bounced = true; }
      if (b.y < 32 || b.y > MAP.h - 32) { b.vy *= -1; b.y = clamp(b.y, 33, MAP.h - 33); bounced = true; }
      if (!bounced) for (const rc of MAP.rocks) {
        if (circleRect(b.x, b.y, b.r, rc)) {
          const cxp = clamp(b.x, rc.x, rc.x + rc.w), cyp = clamp(b.y, rc.y, rc.y + rc.h);
          if (Math.abs(b.x - cxp) > Math.abs(b.y - cyp)) b.vx *= -1; else b.vy *= -1;
          bounced = true; break;
        }
      }
    }
    if (bounced) {
      /* the flipped velocity now points off the surface — sparks follow it */
      if (!b.shard) bulletSparks(b, Math.atan2(b.vy, b.vx), 4);
      if (b.bounce > 0) { b.bounce--; if (b.hitSet) b.hitSet.clear(); } else dead = true;
    }
    if (!dead) for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || e.ghost || e.team === "p" || (b.hitSet && b.hitSet.has(e))) continue;

      let hit = false;
      const bAng = (b.relD !== undefined && b.owner) ? (b.owner.aim + b.relA) : Math.atan2(b.vy, b.vx);

      if (b.relD !== undefined && b.owner) {
        // RECTANGLE HITBOX for Melee: Use custom width/height if provided
        const hw = b.boxW || b.r * 2;
        const hh = b.boxH || b.r * 3;
        hit = circleRotRect(e.x, e.y, e.r, b.x, b.y, hw, hh, bAng);
      } else {
        hit = dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2;
      }

      if (hit) {
        (b.hitSet || (b.hitSet = new Set())).add(e);
        let bdmg = b.dmg;
        /* PUNCTURE: a chance to find the gap and strike for more than double */
        const crit = b.crit && Math.random() < b.crit;
        if (crit) { bdmg *= b.critMul; Game.shake = Math.max(Game.shake, 5); AudioFX.crit(); }
        b.critHit = crit;                                  // damageEnemy prints the number gold + oversized
        damageEnemy(e, bdmg, b);
        b.critHit = false;
        /* impact sparks fan back off the wound along the shot's reverse */
        bulletSparks(b, Math.atan2(-b.vy, -b.vx), crit ? 6 : 4);
        /* DREAD: the hit may break the foe's nerve */
        if (b.fear && !e.boss && Math.random() < b.fear) e.fearT = Math.max(e.fearT || 0, b.fearDur);
        if (b.ember) { e.burnT = 2 + b.ember; e.burnDps = 2 + 2 * b.ember; e.burnBy = b.owner; }
        if (b.bleed) { e.bleedT = 1 + 0.5 * b.bleed; e.bleedDps = 3 * b.bleed; e.bleedBy = b.owner; }
        if (b.frost) { e.slowT = 1 + 0.7 * b.frost; floatText(e.x, e.y - e.r - 12, "❄", "#5ee6ff"); }
        if (b.storm && !e.dead) chainStorm(e, b.storm, new Set([e]), b.owner);
        if (b.pierce > 0) {
          if (!b.owner || !b.owner.mods.truePierce) b.pierce--;
        } else dead = true;
        break;
      }
    }
    /* the hit may have felled the EVENT HORIZON — startEnding() empties this very
       array mid-loop, so the frame must stop here, not at the guard below */
    if (Game.state !== "play") return;
    if (dead) {
      if (b.venom) {
        /* RAPID+TWIN can land 100+ venom bullets/sec on one spot — a fresh pool
           per death piles up hundreds of alpha-blended discs and OOM-kills the
           WebView on low-RAM phones. A pool that mostly overlaps an existing one
           refreshes it instead, and brand-new pools respect the shared cap. */
        let near = null;
        for (const pu of puddles) {
          if (pu.team === "p" && !pu.lava && !pu.vortex && !pu.phase && !pu.slime &&
              dist2(b.x, b.y, pu.x, pu.y) < (pu.r * 0.5) ** 2) { near = pu; break; }
        }
        if (near) {
          near.t = Math.min(near.t, 0.3); near.life = 4;
          near.r = Math.max(near.r, 26 + 14 * b.venom);
          near.dmg = Math.max(near.dmg, 3 + 2 * b.venom);
        } else if (puddles.length < 140) {
          puddles.push({ x: b.x, y: b.y, r: 26 + 14 * b.venom, t: 0, life: 4,
            team: "p", dmg: 3 + 2 * b.venom, color: "#7dff5e", tickMap: {}, owner: b.owner });
        }
      }
      if (!b.shard) for (let k = 0; k < 3; k++) particles.push({ x: b.x, y: b.y, vx: rnd(-90, 90), vy: rnd(-90, 90), t: 0, life: 0.2, r: 2, color: b.venom ? "#7dff5e" : "#e8e2d0" });
      bullets.splice(i, 1);
    }
  }
  /* a bullet may have felled the warden (state → "choice") — freeze the rest of the frame */
  if (Game.state !== "play") return;

  /* --- enemy bullets --- */
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i]; b.t += dt;
    if (b.homing) {
      const HP = nearestPlayer(b.x, b.y);
      const want = angTo(b.x, b.y, HP.x, HP.y);
      const cur = Math.atan2(b.vy, b.vx);
      let diff = want - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
      const turn = clamp(diff, -b.homing * dt, b.homing * dt);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
    }
    /* STILLPOINT: enemy fire crawls inside any warden's bubble — rescaled from a stored base speed so it never compounds */
    {
      let mul = 1, hasField = false;
      for (const p of alivePlayers()) {
        if (!p.mods.timeField) continue;
        hasField = true;
        if (dist2(b.x, b.y, p.x, p.y) < p.mods.timeR ** 2) mul = Math.min(mul, p.mods.timeMul);
      }
      if (hasField) {
        if (b.baseSp === undefined) b.baseSp = Math.hypot(b.vx, b.vy);
        const cur = Math.hypot(b.vx, b.vy) || 1;
        const k = (b.baseSp * mul) / cur;
        b.vx *= k; b.vy *= k;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.t > 4 || b.x < 32 || b.x > MAP.w - 32 || b.y < 32 || b.y > MAP.h - 32;
    if (!dead) for (const rc of MAP.rocks) if (circleRect(b.x, b.y, b.r, rc)) { dead = true; break; }
    if (!dead) for (const p of alivePlayers()) {
      // Friendly thrall bullets (team 'p') should not hurt players
      if (b.team === "p") continue;
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) { hurtPlayer(p, b.dmg, b); dead = true; break; }
    }
    // Hostile bullets hitting friendly thralls
    if (!dead && b.team !== "p") for (const e of enemies) {
      if (e.team === "p" && !e.dead && !e.ghost && e.spawnT <= 0) {
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) { damageEnemy(e, b.dmg, b); dead = true; break; }
      }
    }
    if (dead) ebullets.splice(i, 1);
  }
  if (ebullets.length > 400) ebullets.splice(0, ebullets.length - 400); // enemy bullet cap

  /* --- shockwaves: hostile rings hit the player, friendly novas hit enemies --- */
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    if (!s) continue;   // bossSlain splices hostile waves mid-loop; the index may overshoot
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.r += s.speed * dt;
    if (s.hostile && !s.hit && s.dmg > 0) {
      for (const p of alivePlayers()) {
        const d = Math.sqrt(dist2(s.x, s.y, p.x, p.y));
        if (Math.abs(d - s.r) < 16 + p.r) { hurtPlayer(p, s.dmg, s); s.hit = true; break; }
      }
      // Hostile shockwaves hitting friendly thralls
      if (!s.hit) for (const e of enemies) {
        if (e.team === "p" && !e.dead && !e.ghost && e.spawnT <= 0 && (s.hitSet instanceof Set)) {
          const d = Math.sqrt(dist2(s.x, s.y, e.x, e.y));
          if (Math.abs(d - s.r) < 16 + e.r && !s.hitSet.has(e)) {
            s.hitSet.add(e);
            damageEnemy(e, s.dmg, s);
          }
        }
      }
    }
    if (!s.hostile && s.dmg > 0) {
      for (const e of enemies) {
        if (e.dead || e.ghost || e.spawnT > 0 || e.team === "p" || !(s.hitSet instanceof Set) || s.hitSet.has(e)) continue;
        if (dist2(s.x, s.y, e.x, e.y) < (s.r + e.r) ** 2) { s.hitSet.add(e); damageEnemy(e, s.dmg, s.owner ? { owner: s.owner } : undefined); }
      }
      /* a friendly wave may have felled the warden — same mid-frame stop as the bullet loop */
      if (Game.state !== "play") return;
    }
    if (s.r > s.max) shockwaves.splice(i, 1);
  }

  /* --- puddles, particles, floaters, zaps --- */
  for (let i = puddles.length - 1; i >= 0; i--) {
    const p = puddles[i];
    if (p.life !== Infinity) { p.t += dt; if (p.t > p.life) { puddles.splice(i, 1); continue; } }
    else p.t += dt;
    /* lava breathes: idle pools spit rising embers (rate is per-pool — the
       Tyrant's rivers make 100+ pools, so keep it low or they pin the cap) */
    if (p.lava && Math.random() < dt * 1.2 && particles.length < 500) {
      particles.push({ x: p.x + rnd(-p.r * 0.6, p.r * 0.6), y: p.y + rnd(-p.r * 0.6, p.r * 0.6),
        vx: rnd(-25, 25), vy: rnd(-120, -40), t: 0, life: rnd(0.4, 0.9), r: rnd(2, 5), color: "#ff5e2e" });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) particles.splice(i, 1); }
  for (let i = veils.length - 1; i >= 0; i--) { veils[i].t += dt; if (veils[i].t > veils[i].life) veils.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; f.y -= (f.vy === undefined ? 40 : f.vy) * dt; if (f.t > (f.life || 0.7)) floaters.splice(i, 1); }
  if (soulMotes.length) tickSoulMotes(dt);   // after particles: motes freeze with hitstop, drag with slowmo
  for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t += dt; if (zaps[i].t > 0.15) zaps.splice(i, 1); }

  /* --- boss bar --- */
  if (Game.boss) {
    const bw = clamp(Game.boss.hp / Game.boss.maxHp * 100, 0, 100);
    /* the CSS width transition (.1s) smooths anything finer than this anyway */
    if (Math.abs(bw - lastBossW) > 0.2) { lastBossW = bw; $("bossFill").style.width = bw + "%"; }
  }

  /* --- camera: locked to the warden THIS screen steers --- */
  const camP = localPlayer();
  Game.cam.x = lerp(Game.cam.x, clamp(camP.x - VW / 2, 0, MAP.w - VW), 1 - Math.pow(0.001, dt));
  Game.cam.y = lerp(Game.cam.y, clamp(camP.y - VH / 2, 0, MAP.h - VH), 1 - Math.pow(0.001, dt));
  if (MAP.w < VW) Game.cam.x = (MAP.w - VW) / 2;
  if (MAP.h < VH) Game.cam.y = (MAP.h - VH) / 2;
  /* --- ambient floor life: a few drifting motes keyed to the floor's palette --- */
  ambientT -= dt;
  if (ambientT <= 0 && particles.length < 450) {
    ambientT = rnd(0.25, 0.5);
    const ax = Game.cam.x + rnd(0, VW), ay = Game.cam.y + rnd(0, VH);
    const fi = Game.inRift ? 4 : Game.mapIdx;
    if (fi === 0)      particles.push({ x: ax, y: ay, vx: rnd(8, 26), vy: rnd(-8, 8), t: 0, life: rnd(1.2, 2.2), r: rnd(1, 2.2), color: "rgba(157,107,255,0.4)" });      // catacomb: sidelong violet dust
    else if (fi === 1) particles.push({ x: ax, y: ay, vx: rnd(-10, 10), vy: rnd(-38, -16), t: 0, life: rnd(1.2, 2), r: rnd(1.2, 2.4), color: "rgba(184,214,138,0.4)" }); // ossuary: rising bone spores
    else if (fi === 2) particles.push({ x: ax, y: ay, vx: rnd(-14, 14), vy: rnd(-90, -40), t: 0, life: rnd(0.6, 1.2), r: rnd(1.2, 2.6), color: pick(["rgba(255,138,61,0.55)", "rgba(255,210,61,0.4)"]) }); // hellforge: embers
    else if (fi === 3) particles.push({ x: ax, y: ay, vx: rnd(-8, 8), vy: rnd(-34, -12), t: 0, life: rnd(1.4, 2.4), r: rnd(1, 2.4), color: "rgba(125,232,224,0.35)" });  // drowned nave: rising bubbles
    else               particles.push({ x: ax, y: ay, vx: rnd(-6, 6), vy: rnd(-6, 6), t: 0, life: rnd(1.5, 2.6), r: rnd(1, 2), color: "rgba(201,184,255,0.35)" });       // the void: still motes
  }

  Game.shake = Math.max(0, Game.shake - dt * 30);
  Game.flash = Math.max(0, Game.flash - dt);
  if (Game.flash === 0) Game.flashCol = null;   // never let a gold streak flash tint the next hurt
  Game.floorFade = Math.max(0, Game.floorFade - dt / 1.1);
  Game.comboT -= dt;
  if (Game.comboT <= 0) {
    /* only a streak that actually reached a tier gets a send-off — anything lower would nag */
    if (Game.comboN >= 5) streakEnd(Game.comboN, Game.streakTier);
    Game.comboT = 0; Game.comboN = 0; Game.streakTier = -1;
  }
}

