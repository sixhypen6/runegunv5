/* =========================================================
   RUNEGUN · UI — HUD, state machine, rune & boss choices
   The overlay state machine, HUD readouts, toasts, the rune-strip, the pick-a-rune screen and the boss reward choice.
   ========================================================= */
"use strict";

/* =========================================================
   UI — HUD, rune choice, boss choice, held codex, pause,
   vault, menus, state machine
   ========================================================= */
const OVERLAYS = { menu: "menu", vault: "vault", glossary: "glossary", leaderboard: "leaderboardScreen", lobby: "coopLobby", wait: "partnerWait", pause: "pause", held: "runesHeld", rune: "runeChoice", choice: "bossChoice", continue: "continueScreen", resume: "resumeScreen", dead: "death", ending: "voidChoice", ascend: "ascend" };
function setState(s) {
  Game.state = s;
  /* a hitstop set in the same frame a state change froze the sim would otherwise
     survive the overlay and burn as a dead ~0.2s freeze on resume */
  if (s === "play") Game.hitstop = 0;
  for (const k in OVERLAYS) $(OVERLAYS[k]).classList.toggle("on", k === s);
  const inGame = s === "play" || s === "pause" || s === "held" || s === "rune" || s === "choice" || s === "wait";
  /* the souls counter moves (or vanishes) with the HUD, so any cached target is stale;
     a payout still in flight would otherwise hang frozen behind the overlay */
  markHudDirty();
  if (!inGame) soulMotes.length = 0;
  $("hud").classList.toggle("on", inGame);
  /* the dash/seal touch buttons sit OUTSIDE #hud (fixed siblings), so they need their
     own gate — without it they bleed through the menu's transparent gradient */
  document.body.classList.toggle("inGame", inGame);
}

function updateHp() {
  const p = localPlayer();
  if (!p) return;
  const showSancho = p.char === "sancho";
  const pct = clamp(p.hp / p.maxHp * 100, 0, 100) + "%";
  $("hpFill").style.width = pct;
  $("hpChip").style.width = pct;   // the pale chip eases after the fill — the bite lingers
  $("hpNum").textContent = Math.ceil(p.hp) + " / " + p.maxHp;
  document.querySelector(".hp-wrap").classList.toggle("low", p.hp > 0 && p.hp / p.maxHp < 0.3);
  /* co-op: the partner's smaller bar underneath */
  const partner = players.find(o => o !== p);
  const pw = $("partnerHp");
  if (partner && typeof Net !== "undefined" && Net.active) {
    pw.style.display = "";
    $("partnerName").textContent = (CHARS[partner.char] ? CHARS[partner.char].name : "PARTNER") + (partner.downed ? " · DOWN" : "");
    $("partnerHpFill").style.width = clamp(partner.hp / partner.maxHp * 100, 0, 100) + "%";
    $("partnerHpNum").textContent = partner.downed ? "✚" : Math.ceil(partner.hp);
  } else pw.style.display = "none";
}

function updateSanchoMeters() {
  const p = localPlayer();
  if (!p) return;
  const showSancho = p.char === "sancho";
  let sWrap = $("sanchoMeters");
  if (showSancho) {
    if (!sWrap) {
      const html = `
        <div id="sanchoMeters" style="position:fixed;bottom:max(80px,env(safe-area-inset-bottom));left:max(12px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:6px;pointer-events:none;z-index:5">
          <div style="font-size:10px;letter-spacing:0.2em;color:#ff4d5e;text-shadow:0 0 10px #ff4d5e;display:flex;justify-content:space-between">
            <span>BLOODFEAST</span>
            <span id="feastNum">0 / 999</span>
          </div>
          <div style="width:160px;height:10px;border:1px solid #440000;background:rgba(0,0,0,0.5)">
            <div id="feastFill" style="height:100%;width:0%;background:linear-gradient(90deg,#880000,#ff4d5e);transition:width 0.15s"></div>
          </div>
          <div style="font-size:10px;letter-spacing:0.2em;color:#ffd23d;text-shadow:0 0 10px #ffd23d;display:flex;justify-content:space-between">
            <span>HARDBLOOD (STAGE <span id="hbStageNum">1</span>)</span>
            <span id="hbNum">0 / 30</span>
          </div>
          <div style="width:160px;height:10px;border:1px solid #444400;background:rgba(0,0,0,0.5)">
            <div id="hbFill" style="height:100%;width:0%;background:linear-gradient(90deg,#888800,#ffd23d);transition:width 0.15s"></div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", html);
      sWrap = $("sanchoMeters");
    }
    sWrap.style.display = (Game.state === "play" || Game.state === "pause") ? "flex" : "none";
    if (sWrap.style.display === "flex") {
      const fPct = bloodfeast / 999;
      $("feastFill").style.width = (fPct * 100) + "%";
      $("feastNum").textContent = Math.floor(bloodfeast) + " / 999";

      const hbPct = p.hardblood / 30;
      $("hbFill").style.width = (hbPct * 100) + "%";
      $("hbNum").textContent = Math.floor(p.hardblood) + " / 30";
      $("hbStageNum").textContent = p.hbStage || 1;
    }
  } else if (sWrap) {
    sWrap.style.display = "none";
  }
}

/* animate a numeric readout from what it currently shows to `to` */
const numTweens = new Map();
function tweenNum(el, to, dur) {
  const from = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10) || 0;
  const prev = numTweens.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  const t0 = performance.now(), state = { raf: 0 };
  numTweens.set(el, state);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(from + (to - from) * k);
    if (k < 1) state.raf = requestAnimationFrame(step); else numTweens.delete(el);
  };
  step(t0);
}
/* `dur` lets a kill stretch the digit roll to cover its soul motes' flight; every
   other caller omits it and keeps the original 300ms */
function updateScore(dur) {
  const el = $("score");
  if (el.textContent !== String(Game.score)) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  tweenNum(el, Game.score, dur || 300);
}
const rerollLabel = n => n === Infinity ? "∞" : "×" + n;
function updateRerolls() {
  const p = localPlayer();
  if (p) $("rerolls").textContent = "RE-ROLLS " + rerollLabel(p.rerolls);

  /* souls & rerolls */
  $("bankVault").textContent = Meta.bank;
  $("bankMenu").textContent = Meta.bank;
}
function updateSeals() {
  $("sealCount").textContent = Game.chestsTotal === 0 ? "THE VOID WAITS" : "SEALS " + Game.chestsOpened + " / " + Game.chestsTotal;
  /* vitality caches left on the floor, counted like the seals above. The void
     floor stocks none, so the line simply disappears there. */
  const el = $("vitalCount");
  if (!el) return;
  const total = healthBoxes ? healthBoxes.length : 0;
  const left = total ? healthBoxes.filter(h => h.state === "sealed").length : 0;
  el.style.display = total ? "" : "none";
  el.textContent = "VITALS " + left + " / " + total;
}

let toastT = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.style.opacity = 0, 2200);
}

/* HUD strip: every stack the LOCAL warden carries */
function refreshRuneStrip() {
  const el = $("runeStrip");
  const p = localPlayer();
  if (!p) { el.innerHTML = ""; return; }
  el.innerHTML = "";
  if (p.lockedRunes) {
    const d = document.createElement("span");
    d.className = "chip";
    d.style.color = "#ffd23d";
    d.style.borderColor = "#ffd23d";
    d.innerHTML = "<small>SEALED</small>";
    el.appendChild(d);
  }
  for (const id in p.runes) {
    const n = p.runes[id]; if (!n) continue;
    const R = RUNES[id];
    const d = document.createElement("span");
    d.className = "chip";
    d.style.color = R.color;
    if (p.lockedRunes && p.lockedRunes.includes(id)) d.style.borderColor = "#ffd23d";
    d.innerHTML = R.glyph + (n > 1 ? "<small>×" + n + "</small>" : "");
    el.appendChild(d);
  }
}

/* ---------- rune choice: pick one of three, reroll per-slot ---------- */
function openRuneChoice() {
  const chooser = players[Game.pendingPickupBy] || localPlayer();
  /* an orb always has a hand to roll from by the time it is opened — co-op orbs
     roll on touch, so this is the last line of defence against an empty offer */
  if (Game.pendingPickup && !Game.pendingPickup.ids)
    Game.pendingPickup.ids = genThreeRunes(chooser);
  /* co-op: the sim freezes for both, but only the CHOOSER sees the cards.
     A remote chooser gets the ids over the wire; this side shows the wait. */
  if (Net.active && chooser !== localPlayer()) {
    if (Net.role === "host") Coop._sendRuneOffer();
    $("waitTitle").textContent = "YOUR PARTNER IS CHOOSING A RUNE";
    setState("wait");
    return;
  }
  setState("rune");
  renderRuneChoice();
}
function renderRuneChoice() {
  const p = Game.pendingPickup;
  /* whose hand carves: the warden that touched the orb */
  const ch = players[Game.pendingPickupBy] || localPlayer();
  const container = $("rcCards");
  container.innerHTML = "";
  /* Never leave a blank modal. This runs from a DataChannel callback on the
     guest, so a throw here is swallowed by the browser and strands both
     players staring at an empty choice — the exact playtest freeze. */
  if (!p || !p.ids || p.ids.length < 3 || p.ids.some(id => !RUNES[id])) {
    container.innerHTML = "<div class='empty-note'>THE RUNES ARE SLOW TO ANSWER…</div>";
    if (Net.role === "guest") Net.sendR({ t: "reofferReq" });
    else if (p) { p.ids = genThreeRunes(ch); renderRuneChoice(); }
    return;
  }
  for (let i = 0; i < 3; i++) {
    const slotIdx = i;
    const id = p.ids[slotIdx];
    const R = RUNES[id];
    const own = ch.runes[id] || 0;
    const card = document.createElement("div");
    card.className = "rc-rune-card";
    card.style.color = R.color;
    card.style.animationDelay = (i * 90) + "ms";   // the three cards deal in like a hand
    card.innerHTML =
      "<div class='rc-glyph'>" + R.glyph + "</div>" +
      "<div class='rc-nm'>" + R.name + "</div>" +
      "<div class='rc-own'>" + (own ? "you carry \xd7" + own + " — stacks to \xd7" + (own + 1) : "first of its kind") + "</div>" +
      "<div class='rc-ds'>" + R.desc + "</div>";
    const takeBtn = document.createElement("button");
    takeBtn.className = "menu-btn";
    takeBtn.textContent = "CARVE IT IN";
    takeBtn.addEventListener("click", () => {
      if (!Game.pendingPickup) return;
      /* GUEST chooser: the pick travels to the host, who grants and resumes */
      if (Net.role === "guest") {
        Net.sendR({ t: "runePick", id: p.ids[slotIdx] });
        Game.pendingPickup = null;
        AudioFX.equip();
        $("waitTitle").textContent = "CARVED — THE DESCENT RESUMES";
        setState("wait");        // the next snapshot flips both back to play
        return;
      }
      const idx = pickups.indexOf(Game.pendingPickup);
      if (idx !== -1) pickups.splice(idx, 1);
      grantRune(ch, p.ids[slotIdx]);
      Game.pendingPickup = null;
      /* the carve lands: a flourish in the rune's color as play resumes */
      floatText(ch.x, ch.y - 30, R.name, R.color, 16);
      shockwaves.push({ x: ch.x, y: ch.y, r: 8, max: 160, speed: 640, dmg: 0,
        hostile: false, color: R.color, hitSet: new Set() });
      for (let k = 0; k < 12; k++) particles.push({ x: ch.x, y: ch.y,
        vx: rnd(-220, 220), vy: rnd(-220, 220), t: 0, life: rnd(0.3, 0.6), r: rnd(2, 4), color: R.color });
      AudioFX.equip();
      if (Net.role === "host") Net.sendR({ t: "runeGranted", idx: ch.idx, id: p.ids[slotIdx] });
      setState("play");
    });
    const rerollBtn = document.createElement("button");
    rerollBtn.className = "menu-btn small";
    rerollBtn.textContent = "RE-ROLL " + rerollLabel(ch.rerolls);
    rerollBtn.disabled = ch.rerolls <= 0;
    rerollBtn.addEventListener("click", () => {
      if (ch.rerolls <= 0 || !Game.pendingPickup) return;
      /* GUEST chooser: the host owns the pool and the reroll count */
      if (Net.role === "guest") { Net.sendR({ t: "reroll", slot: slotIdx }); AudioFX.reroll(); return; }
      ch.rerolls--;
      updateRerolls();
      const pool = runePool(ch);
      const onScreen = new Set(p.ids);                 // remember the three runes on the cards right now
      let avail = pool.filter(id => !onScreen.has(id)); // reroll into something NOT currently shown...
      if (!avail.length) avail = pool.filter(id => id !== p.ids[slotIdx]); // ...sealed pool too small: at least never repeat this slot
      if (avail.length) p.ids[slotIdx] = pick(avail);  // (a one-rune pool has nothing else to offer — leave it)
      AudioFX.reroll();
      renderRuneChoice();
    });
    card.appendChild(takeBtn);
    card.appendChild(rerollBtn);
    container.appendChild(card);
  }
  /* seal status note */
  const note = $("rcLockNote");
  const slots = runeSlotCount(ch);
  if (ch.lockedRunes) {
    note.style.display = "block";
    note.innerHTML = "PATH SEALED — every rune here is one of your " + slots + ": " +
      ch.lockedRunes.map(id => RUNES[id].glyph).join("  ");
  } else {
    const distinct = heldRuneIds(ch).length;
    const hasNew = p.ids.some(id => !ch.runes[id]);
    if (distinct === slots - 1 && hasNew) {
      note.style.display = "block";
      note.innerHTML = "LAST CHANCE — carving a new rune will SEAL your path to those " + slots + ".";
    } else {
      note.style.display = "none";
    }
  }
}

/* ---------- boss choice: mend the flesh or carve a rune ---------- */
function spawnPortal() {
  portal = { x: SEAL.x, y: SEAL.y, r: 46, t: 0 };
  toast("A WAY DOWN OPENS AT THE GRAND SEAL");
  AudioFX.portal();
  /* the first time the Warden falls, something else tears open beside the way down */
  if (Game.mapIdx === 0 && Game.loop === 0 && !Game.riftDone && !Game.riftOffered) {
    Game.riftOffered = true;
    rift = { x: SEAL.x + 170, y: SEAL.y, r: 28, t: 0 };
    setTimeout(() => { if (rift && !Game.inRift) toast("...SOMETHING ELSE STIRS BESIDE IT..."); }, 1400);
    AudioFX.bossRoar();
  }
}
$("bcHeal").addEventListener("click", () => {
  if (Game.state !== "choice") return;
  /* the toll pays out to EVERY warden — half of each one's own maximum */
  for (const p of players) {
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp / 2));
    floatText(p.x, p.y - 24, "+" + Math.round(p.maxHp / 2), "#ff4d5e");
  }
  updateHp();
  spawnPortal();
  setState("play");
});
$("bcRune").addEventListener("click", () => {
  if (Game.state !== "choice") return;
  /* one orb falls ON each warden — each rolls from its taker's own pool.
     dead-centre on purpose: an offset orb can land outside the map or inside a
     rock (nothing validates the spot here), and the toll would be unclaimable.
     At zero distance update() collects it on the next frame. */
  for (const p of players) spawnPickup(p.x, p.y);
  spawnPortal();
  setState("play");
});

