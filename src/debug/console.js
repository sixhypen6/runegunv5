/* =========================================================
   RUNEGUN · Debug Console
   In-game console toggled with F9. Execute JavaScript and view output.
   =========================================================*/
"use strict";

const DebugConsole = {
  open: false,
  history: [],
  historyIndex: -1,
  output: [],
  maxOutputLines: 100,

  installHelpers() {
    const makeList = (title, obj) => {
      const rows = Object.entries(obj).map(([id, def]) => {
        const meta = def && typeof def === "object" ? (def.name || def.glyph || def.color || "") : "";
        return `${id}${meta ? " = " + meta : ""}`;
      });
      return `${title}\n${rows.join("\n")}`;
    };

    window.help = () => {
      const sections = [
        "DEBUG HELP",
        "--- TESTING & GOD MODE ---",
        "  help() -> show this help",
        "  showHitbox() -> toggle hitboxes visualization",
        "  god() -> toggle invincibility",
        "  killAll() -> wipe all hostiles from screen",
        "  spawnTest(hp) -> spawn stationary dummy with high HP",
        "  spawn(type, x, y, hp, team, ai) -> ai: 'default'|'none'|'aggro'",
        "  pos() -> show player coordinates",
        "  labels() -> toggle entity ID labels on-screen",
        "\n--- SANCHO DEBUG ---",
        "  hardblood(amount) -> set hardblood stacks (0-30)",
        "  bloodfeast(amount) -> set bloodfeast pool (0-999)",
        "\n--- RUNE MANIPULATION ---",
        "  listRunes() -> list all rune ids and descriptions",
        "  addRune(player, 'reprieve', 1) -> add stack(s)",
        "  addRunes(player, { reprieve: 5, rapid: 10, heavy: 1 }) -> add multiple types",
        "  setRune(player, 'reprieve', 5) -> set exact stack count",
        "  recalc(player) -> recompute stats after edits",
        "\n--- CHARACTER & EQUIPMENT ---",
        "  listChars() -> list all character ids",
        "  setChar(player, 'alchemist') -> switch character",
        "  listSkins() -> list all skin ids",
        "  setSkin(player, 'toxin') -> switch skin",
        "  listPets() -> list all pet ids",
        "  setPet(player, 'gunner') -> switch pet",
        "\n--- MISC ---",
        "  ids() -> dump all raw id lists",
        "  listCurses() -> list all curse ids",
        "  listEnemies() -> list all enemy ids",
        "  Example: addRunes(player, { mastery: 20 }); recalc(player);"
      ];
      return sections.join("\n");
    };

    window.ids = () => {
      const sections = [
        makeList("RUNES:", RUNES || {}),
        makeList("CHARS:", CHARS || {}),
        makeList("PETS:", PTYPES || {}),
        makeList("SKINS:", SKINS || {}),
        makeList("CURSES:", CURSES || {})
      ];
      return sections.join("\n\n");
    };

    window.listRunes = () => {
      Object.keys(RUNES).forEach(key => {
        const r = RUNES[key];
        const msg = `[${r.glyph}] ${r.name} (ID: '${key}')\n"${r.desc}"`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Runes listed.";
    };

    window.listChars = window.listCharacters = () => {
      Object.keys(CHARS).forEach(key => {
        const c = CHARS[key];
        const msg = `[${c.glyph}] ${c.name} (ID: '${key}')\n"${c.desc}"\nHP: ${c.hp}, SPD: ${c.speed}`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Characters listed.";
    };

    window.listPets = () => {
      Object.keys(PTYPES).forEach(key => {
        const p = PTYPES[key];
        const msg = `[${p.glyph}] ${p.name} (ID: '${key}')\n"${p.desc}"\nCOST: ${p.cost} SOULS`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Pets listed.";
    };

    window.listEnemies = () => {
      Object.keys(ETYPES).forEach(key => {
        const e = ETYPES[key];
        const msg = `${key.toUpperCase()} (ID: '${key}')\nHP: ${e.hp}, SPD: ${e.speed}, SCORE: ${e.score}`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Enemy types listed.";
    };

    window.listSkins = () => {
      Object.keys(SKINS).forEach(key => {
        const s = SKINS[key];
        const msg = `${s.name} (ID: '${key}')\n"${s.desc}"\nCOST: ${s.cost} SOULS`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Skins listed.";
    };

    window.listCurses = () => {
      Object.keys(CURSES).forEach(key => {
        const c = CURSES[key];
        const msg = `[${c.glyph}] ${c.name} (ID: '${key}')\n"${c.desc}"`;
        this.log(msg, "rune-list");
        this.log("────────────────────────────────────────────────────────────────────────────────", "sep");
      });
      return "Curses listed.";
    };

    window.addRune = (p = player, id, amount = 1) => {
      if (!p || !id) return "usage: addRune(player, 'reprieve', 3)";
      const n = Math.max(0, Number(amount) || 0);
      if (!RUNES[id]) return `unknown rune id: ${id}`;
      for (let i = 0; i < n; i++) {
        if (typeof grantRune === "function") grantRune(p, id, true);
        else p.runes[id] = (p.runes[id] || 0) + 1;
      }
      if (typeof recalc === "function") recalc(p);
      return `${id} = ${p.runes[id] || 0}`;
    };

    window.addRunes = (p = player, runeMap = {}) => {
      if (!p || typeof runeMap !== "object") return "usage: addRunes(player, { reprieve: 5, rapid: 10 })";
      const results = [];
      for (const [id, amount] of Object.entries(runeMap)) {
        if (!RUNES[id]) {
          results.push(`Unknown: ${id}`);
          continue;
        }
        const n = Math.max(0, Number(amount) || 0);
        for (let i = 0; i < n; i++) {
          if (typeof grantRune === "function") grantRune(p, id, true);
          else p.runes[id] = (p.runes[id] || 0) + 1;
        }
        results.push(`${id} +${n} (Total: ${p.runes[id]})`);
      }
      if (typeof recalc === "function") recalc(p);
      return "Added:\n" + results.join("\n");
    };

    window.setRune = (p = player, id, value = 0) => {
      if (!p || !id) return "usage: setRune(player, 'reprieve', 5)";
      if (!RUNES[id]) return `unknown rune id: ${id}`;
      p.runes[id] = Number(value) || 0;
      if (typeof recalc === "function") recalc(p);
      return `${id} = ${p.runes[id]}`;
    };

    window.setChar = (p = player, id) => {
      if (!p || !id) return "usage: setChar(player, 'alchemist')";
      if (!CHARS[id]) return `unknown char id: ${id}`;
      p.char = id;
      if (typeof recalc === "function") recalc(p);
      return `char = ${id}`;
    };

    window.setPet = (p = player, id) => {
      if (!p || !id) return "usage: setPet(player, 'gunner')";
      if (!PTYPES[id]) return `unknown pet id: ${id}`;
      p.pet = id;
      return `pet = ${id}`;
    };

    window.setSkin = (p = player, id) => {
      if (!p || !id) return "usage: setSkin(player, 'toxin')";
      if (!SKINS[id]) return `unknown skin id: ${id}`;
      p.skin = id;
      return `skin = ${id}`;
    };

    window.pos = () => {
      const p = localPlayer();
      if (!p) return "No player found";
      return `Player: ${Math.round(p.x)}, ${Math.round(p.y)} (Map: ${MAP.w}x${MAP.h})`;
    };

    window.labels = () => {
      window.debugLabels = !window.debugLabels;
      return "Debug labels: " + (window.debugLabels ? "ON" : "OFF");
    };

    window.spawn = (type = 'chaser', x, y, hp, team = 'e', ai = 'default') => {
      if (typeof ETYPES === "undefined" || !ETYPES[type]) return "Unknown enemy type: " + type;
      const p = localPlayer();
      const tx = x !== undefined && x !== null ? x : (p ? p.x + 100 : MAP.w / 2);
      const ty = y !== undefined && y !== null ? y : (p ? p.y : MAP.h / 2);
      const e = spawnEnemy(type, tx, ty);
      if (hp !== undefined && hp !== null) e.hp = e.maxHp = hp;
      if (team !== undefined && team !== null) e.team = team;
      e.debugAI = ai;
      if (ai === 'aggro') e.alerted = true;
      enemies.push(e);
      return `Spawned ${type} [ID:${e.id}] at ${Math.round(tx)}, ${Math.round(ty)} (Team: ${e.team}, AI: ${ai})`;
    };

    window.spawnTest = (hp = 1000000) => {
      const p = localPlayer();
      const e = spawnEnemy('slammer', (p ? p.x + 120 : MAP.w / 2 + 120), (p ? p.y : MAP.h / 2));
      e.hp = e.maxHp = hp;
      e.speed = 0;
      e.team = 'e';
      e.color = '#ffffff';
      enemies.push(e);
      return `Spawned Test Dummy with ${hp} HP`;
    };

    window.killAll = () => {
      let count = 0;
      if (typeof enemies === "undefined") return "No enemies array found";
      for (const e of [...enemies]) {
        if (e.team !== 'p' && !e.dead) {
          e.hp = 0;
          if (typeof killEnemy === "function") killEnemy(e, localPlayer());
          else e.dead = true;
          count++;
        }
      }
      return `Purged ${count} hostiles.`;
    };

    window.god = () => {
      const p = localPlayer();
      if (!p) return "No local player found";
      p.godMode = !p.godMode;
      return "God mode: " + (p.godMode ? "ON" : "OFF");
    };

    window.hardblood = (val) => {
      const p = localPlayer();
      if (!p || p.char !== "sancho") return "Only Sancho carries Hardblood.";
      p.hardblood = clamp(Number(val) || 0, 0, 30);
      if (typeof recalc === "function") recalc(p);
      return `Sancho Hardblood set to ${p.hardblood}`;
    };

    window.bloodfeast = (val) => {
      bloodfeast = clamp(Number(val) || 0, 0, 999);
      return `Bloodfeast pool set to ${bloodfeast}`;
    };

    window.showHitbox = window.showHitboxes = () => {
      window.debugHitboxes = !window.debugHitboxes;
      return "Debug hitboxes: " + (window.debugHitboxes ? "ON" : "OFF");
    };
  },

  init() {
    /* create the console element if it doesn't exist */
    if (!document.getElementById("debugConsole")) {
      const html = `
        <div id="debugConsole" class="debug-console">
          <div class="debug-header">
            <span>DEBUG CONSOLE · F9 TO TOGGLE</span>
            <div style="display:flex;gap:8px">
              <button id="debugClear" class="debug-btn">CLEAR</button>
              <button id="debugClose" class="debug-btn" style="background:rgba(255,77,94,0.3);border-color:#ff4d5e">CLOSE</button>
            </div>
          </div>
          <div id="debugOutput" class="debug-output"></div>
          <div class="debug-input-row">
            <span class="debug-prompt">&gt;</span>
            <input type="text" id="debugInput" class="debug-input" autocomplete="off" spellcheck="false" />
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", html);
    }

    const input = document.getElementById("debugInput");
    const clearBtn = document.getElementById("debugClear");
    const closeBtn = document.getElementById("debugClose");
    const output = document.getElementById("debugOutput");

    if (closeBtn) closeBtn.addEventListener("click", () => this.toggle());

    /* keyboard: enter executes, up/down navigates history */
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.execute(input.value);
        input.value = "";
        this.historyIndex = -1;
        output.scrollTop = output.scrollHeight;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.history.length - 1 - this.historyIndex];
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.history.length - 1 - this.historyIndex];
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          input.value = "";
        }
      }
    });

    /* clear button */
    clearBtn.addEventListener("click", () => {
      this.output = [];
      document.getElementById("debugOutput").innerHTML = "";
    });

    /* F9 toggles console */
    document.addEventListener("keydown", (e) => {
      if (e.key === "F9") {
        e.preventDefault();
        this.toggle();
      }
    });

    this.installHelpers();
    this.log("DEBUG CONSOLE READY · TYPE JAVASCRIPT OR COMMANDS · F9 TO TOGGLE");
    this.log("HELP: help(), ids(), listRunes(), recalc(player), addRune(player, 'reprieve', 3), setRune(player, 'reprieve', 5)", "result");
  },

  execute(cmd) {
    if (!cmd.trim()) return;
    this.history.push(cmd);
    this.log(`> ${cmd}`, "input");

    try {
      /* eval in global scope — access to all globals like player, Game, etc. */
      const result = eval(`(${cmd})`);
      if (result !== undefined) {
        this.log(String(result), "result");
      }
    } catch (e) {
      this.log(`ERROR: ${e.message}`, "error");
    }
  },

  log(msg, type = "log") {
    this.output.push({ msg, type });
    if (this.output.length > this.maxOutputLines) {
      this.output.shift();
    }
    this.render();
  },

  render() {
    const output = document.getElementById("debugOutput");
    if (!output) return;
    output.innerHTML = this.output
      .map((line) => {
        const className = line.type ? ` class="debug-${line.type}"` : "";
        return `<div${className}>${this.escapeHtml(line.msg)}</div>`;
      })
      .join("");
    output.scrollTop = output.scrollHeight;
  },

  toggle() {
    const console = document.getElementById("debugConsole");
    if (!console) return;
    this.open = !this.open;
    console.classList.toggle("active", this.open);
    if (this.open) {
      document.getElementById("debugInput").focus();
    }
  },

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },
};

/* auto-initialize on load */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => DebugConsole.init());
} else {
  DebugConsole.init();
}
