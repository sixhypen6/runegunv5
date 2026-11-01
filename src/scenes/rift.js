/* =========================================================
   RUNEGUN · Scene — THE UNKNOWN
   The optional rift that tears open beside the way down after the first Warden
   falls. Pay half your vitality to enter a silent stage: no enemies, just a
   patient creature wreathed in runes that carves you one more rune slot.
   ========================================================= */
"use strict";

const RIFT_LINE = "Tread lightly in the unknown, traveller";

/* step through the small portal: pay half your max vitality, descend into the hush */
function enterRift() {
  rift = null;
  const p = localPlayer();
  p.maxHpMul = 0.5;
  recalc(p);                                 // halves max vitality, clamps current hp to it
  AudioFX.bossRoar();
  setupRiftStage();
  /* sacrifice feedback AFTER the stage reset — setupRiftStage wipes the
     floaters array and zeroes the shake, so anything set before it is lost */
  screenFlash(0.4);
  Game.shake = Math.max(Game.shake, 12);
  floatText(player.x, player.y - 26, "HALF GIVEN", "#ff4d5e");
}

/* build the silent stage: empty arena, player at the bottom, the creature at its heart */
function setupRiftStage() {
  Game.inRift = true;
  Game.riftDone = true;
  MAP.rocks = [];
  enemies = []; bullets = []; ebullets = []; puddles = [];
  particles = []; chests = []; pickups = []; shockwaves = []; floaters = []; zaps = []; veils = []; healthBoxes = []; mines = []; shells = [];
  soulMotes = [];
  portal = null; rift = null;
  pets = [];                                  // the unknown is entered alone — no familiar in the hush
  Game.ambush = null; Game.boss = null; Game.shake = 0;
  Game.comboN = 0; Game.comboT = 0; Game.streakTier = -1;
  Game.bossRocks.length = 0;
  Game.chestsTotal = 0; Game.chestsOpened = 0;
  SEAL.state = "spent";                       // no seal answers in the unknown
  player.x = MAP.w / 2; player.y = MAP.h - 170;
  player.iframes = 2;
  Game.riftCreature = {
    x: MAP.w / 2, y: MAP.h / 2, r: 34, t: 0,
    phase: "wait", spin: 1, fade: 1, ritualT: 0, speakT: 0, granted: false,
    glyphs: RUNE_IDS.map((id, i) => ({
      id, a: rnd(0, TAU), orbitR: i % 2 ? 78 : 46, spin: i % 2 ? -1 : 1,
    })),
  };
  $("mapName").textContent = "??????";
  updateSeals();
  $("bossBar").classList.remove("on");
  setState("play");
  toast("YOU STEP INTO THE UNKNOWN");
  AudioFX.portal();
}

/* commune with the creature — begins the rite that opens a new rune slot */
function riftRitual() {
  const rc = Game.riftCreature;
  if (!rc || rc.phase !== "wait") return;
  rc.phase = "ritual"; rc.ritualT = 0;
  AudioFX.chest();
  floatText(rc.x, rc.y - rc.r - 18, "IT KNOWS YOU", "#c9b8ff");
}

/* per-frame rift tick: animates the small portal + the creature, returns any
   interaction hint for update() to surface */
function updateRift(dt) {
  let hint = null, act = null;

  /* the small portal pulses beside the grand seal until taken */
  if (rift) {
    rift.t += dt;
    if (dist2(rift.x, rift.y, player.x, player.y) < (rift.r + 46) ** 2 && !Game.ambush) {
      hint = "?????? — [ E ] SACRIFICE HALF YOUR MAX VITALITY AND ENTER";
      act = enterRift;
    }
  }

  const rc = Game.riftCreature;
  if (rc) {
    rc.t += dt;
    for (const g of rc.glyphs) g.a += g.spin * rc.spin * dt;
    /* ambient violet motes drifting around it */
    if (Math.random() < 0.35) {
      const ga = rnd(0, TAU), gd = rc.r + rnd(18, 80);
      particles.push({ x: rc.x + Math.cos(ga) * gd, y: rc.y + Math.sin(ga) * gd,
        vx: Math.cos(ga + 1.4) * 22, vy: Math.sin(ga + 1.4) * 22, t: 0, life: rnd(0.4, 0.9),
        r: rnd(1.5, 3), color: pick(["#c9b8ff", "#9d6bff", "#fff3c8"]) });
    }

    if (rc.phase === "wait") {
      if (dist2(rc.x, rc.y, player.x, player.y) < (rc.r + 72) ** 2 && !hint) {
        hint = "[ E ] ??????";
        act = riftRitual;
      }

    } else if (rc.phase === "ritual") {
      rc.ritualT += dt;
      rc.spin = 1 + rc.ritualT * 4;
      /* runes spiral inward and a current pours from the creature into the player */
      for (const g of rc.glyphs) g.orbitR = lerp(g.orbitR, 10, 1 - Math.pow(0.04, dt));
      if (Math.random() < 0.9) {
        const t = rnd(0, 1);
        particles.push({ x: lerp(rc.x, player.x, t) + rnd(-10, 10), y: lerp(rc.y, player.y, t) + rnd(-10, 10),
          vx: (player.x - rc.x) * 0.6, vy: (player.y - rc.y) * 0.6, t: 0, life: 0.35,
          r: rnd(2, 4), color: pick(["#c9b8ff", "#ffd23d"]) });
      }
      /* halfway through the rite, the new slot is carved */
      if (rc.ritualT > 1.5 && !rc.granted) {
        rc.granted = true;
        grantRiftSlot(localPlayer());
        Game.shake = Math.max(Game.shake, 12); screenFlash(0.3);
        AudioFX.nova();
        floatText(player.x, player.y - 34, "A SLOT OPENS", "#ffd23d");
        for (let k = 0; k < 28; k++) {
          const aa = rnd(0, TAU);
          particles.push({ x: player.x, y: player.y, vx: Math.cos(aa) * rnd(120, 320), vy: Math.sin(aa) * rnd(120, 320),
            t: 0, life: rnd(0.4, 0.8), r: rnd(2, 5), color: pick(["#ffd23d", "#c9b8ff", "#fff"]) });
        }
      }
      if (rc.ritualT > 2.4) { rc.phase = "speak"; rc.speakT = 0; AudioFX.bossRoar(); }

    } else if (rc.phase === "speak") {
      rc.speakT += dt;
      if (rc.speakT > 1.4) rc.fade = clamp(1 - (rc.speakT - 1.4) / 1.3, 0, 1);
      /* once it has finished speaking and faded, a way onward opens where it stood */
      if (rc.speakT > 2.9 && !portal) {
        portal = { x: rc.x, y: rc.y, r: 46, t: 0 };
        AudioFX.portal(); Game.shake = Math.max(Game.shake, 8);
        toast("THE WAY ONWARD OPENS");
      }
      if (rc.fade <= 0.01 && portal) Game.riftCreature = null;
    }
  }

  return { hint, act };
}

/* world-space render: the small rift portal, the creature, its rune halo and its parting words */
function drawRift() {
  /* the small ominous portal beside the grand seal */
  if (rift) {
    const t = rift.t;
    cx.save(); cx.translate(rift.x, rift.y);
    for (let k = 0; k < 3; k++) {
      cx.rotate(-t * (1.4 + k * 0.6));
      cx.strokeStyle = ["#ff4d5e", "#9d6bff", "#3a3654"][k];
      cx.globalAlpha = 0.75;
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, 0, rift.r - k * 7, t, t + TAU * 0.66); cx.stroke();
    }
    cx.globalAlpha = 1;
    cx.shadowColor = "#ff4d5e"; cx.shadowBlur = 22;
    cx.fillStyle = "#06040a";
    cx.beginPath(); cx.arc(0, 0, rift.r - 18, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = "#ff4d5e"; cx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
    cx.font = "16px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText("?", 0, 1);
    cx.globalAlpha = 1;
    cx.restore();
  }

  const rc = Game.riftCreature;
  if (rc) {
    const a = rc.fade;
    cx.save(); cx.translate(rc.x, rc.y);

    /* soft halo */
    const halo = cx.createRadialGradient(0, 0, 0, 0, 0, rc.r * 3.4);
    halo.addColorStop(0, "rgba(201,184,255," + (0.32 * a) + ")");
    halo.addColorStop(1, "rgba(201,184,255,0)");
    cx.fillStyle = halo;
    cx.beginPath(); cx.arc(0, 0, rc.r * 3.4, 0, TAU); cx.fill();

    /* the body: a dark cowled core with two patient eyes */
    cx.globalAlpha = a;
    cx.fillStyle = "#0a0818";
    cx.shadowColor = "#9d6bff"; cx.shadowBlur = 26;
    cx.beginPath(); cx.arc(0, 0, rc.r, 0, TAU); cx.fill();
    cx.shadowBlur = 0;
    cx.strokeStyle = "#c9b8ff"; cx.lineWidth = 2; cx.globalAlpha = a * 0.8;
    cx.beginPath(); cx.arc(0, 0, rc.r, 0, TAU); cx.stroke();
    const eyeGlow = 0.6 + 0.4 * Math.sin(rc.t * 3);
    cx.globalAlpha = a * eyeGlow;
    cx.fillStyle = "#fff3c8"; cx.shadowColor = "#ffd23d"; cx.shadowBlur = 12;
    cx.beginPath(); cx.arc(-9, -3, 3.4, 0, TAU); cx.fill();
    cx.beginPath(); cx.arc(9, -3, 3.4, 0, TAU); cx.fill();
    cx.shadowBlur = 0;

    /* the rune halo — every glyph in the game, orbiting */
    cx.font = "bold 18px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
    for (const g of rc.glyphs) {
      const R = RUNES[g.id];
      const gx = Math.cos(g.a) * g.orbitR, gy = Math.sin(g.a) * g.orbitR;
      cx.globalAlpha = a;
      cx.fillStyle = R.color; cx.shadowColor = R.color; cx.shadowBlur = 12;
      cx.fillText(R.glyph, gx, gy);
    }
    cx.shadowBlur = 0;
    cx.globalAlpha = 1;
    cx.restore();

    /* its parting words, hanging in the dark above it */
    if (rc.phase === "speak") {
      const ta = clamp(rc.speakT < 0.4 ? rc.speakT / 0.4 : 1, 0, 1) * clamp(rc.fade + 0.25, 0, 1);
      cx.globalAlpha = ta;
      cx.fillStyle = "#e8e2d0"; cx.shadowColor = "#9d6bff"; cx.shadowBlur = 16;
      cx.font = "italic 22px monospace"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(RIFT_LINE, rc.x, rc.y - rc.r - 64);
      cx.shadowBlur = 0; cx.globalAlpha = 1;
    }
  }
}
