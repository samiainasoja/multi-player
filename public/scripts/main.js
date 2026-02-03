const $ = (selector) => document.querySelector(selector);

const arenaEl = $("#arena");
const arenaFieldEl = $("#arenaField");
const timerLabel = $("#timerLabel");
const statusLabel = $("#statusLabel");
const leaderboardEl = $("#leaderboard");
const overlayEl = $("#overlay");
const joinForm = $("#joinForm");
const playerNameInput = $("#playerName");
const roomInput = $("#roomCode");
const startMatchBtn = $("#startMatch");
const pauseToggleBtn = $("#pauseToggle");
const leaveMatchBtn = $("#leaveMatch");
const resetViewBtn = $("#resetView");
const devModeBtn = $("#devMode");
const messagesEl = $("#arenaMessages");
const eventFeedEl = $("#eventFeed");
const miniMapCanvas = $("#miniMap");
const motionToggle = $("#motionToggle");
const touchStickEl = $("#touchStick");
const touchDashBtn = $("#touchDash");
const roomDisplay = $("#roomDisplay");
const playerCount = $("#playerCount");
const playerList = $("#playerList");
const pauseOverlay = $("#pauseOverlay");
const pausedByLabel = $("#pausedBy");
const resumeBtn = $("#resumeBtn");
const quitMatchBtn = $("#quitMatch");
const copyRoomBtn = $("#copyRoom");

let ARENA_SIZE = { width: 1100, height: 640 };
let VIEWPORT_SIZE = { width: 0, height: 0 };
let ARENA_SCALE = 1;
let ARENA_OFFSET = { x: 0, y: 0 };
const PLAYER_SPEED = 396;
const DASH_SCALE = 1.55;
const MATCH_SECONDS = 5 * 60;
const PLAYER_RADIUS = 27;
// BACKEND: MOVE - orb spawn pacing belongs to the server for authoritative sync.
const ORB_SPAWN_INTERVAL = 4000;
// BACKEND: MOVE - orb spawn count belongs to the server for authoritative sync.
const ORB_SPAWN_COUNT = 4;
// BACKEND: MOVE - orb values should be owned by server game rules.
const ORB_VALUES = [1, 3, 5, 10];

const KEY_MAP = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "dash",
  ShiftRight: "dash",
};

const COLORS = [
  "#FF5F6D",
  "#FFAA3B",
  "#7C5CFF",
  "#50FFC0",
  "#26C6DA",
  "#F5F7A6",
];

// BACKEND: DELETE - bot names are only for sandbox simulation.
const BOT_NAMES = [
  "Rogue",
  "Helix",
  "Nyx",
  "Mako",
  "Pulse",
  "Nova",
  "Quill",
  "Flux",
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
// BACKEND: MOVE - orb sizing rules should align with server-defined values.
const orbRadiusForValue = (value) => 6 + value * 1.2;
const syncArenaSize = () => {
  if (!arenaEl) return;
  const width = Math.max(200, Math.floor(arenaEl.clientWidth));
  const height = Math.max(200, Math.floor(arenaEl.clientHeight));
  if (!width || !height) return;
  VIEWPORT_SIZE = { width, height };
  const scale = Math.min(
    VIEWPORT_SIZE.width / ARENA_SIZE.width,
    VIEWPORT_SIZE.height / ARENA_SIZE.height
  );
  ARENA_SCALE = Number.isFinite(scale) && scale > 0 ? scale : 1;
  ARENA_OFFSET = {
    x: (VIEWPORT_SIZE.width - ARENA_SIZE.width * ARENA_SCALE) / 2,
    y: (VIEWPORT_SIZE.height - ARENA_SIZE.height * ARENA_SCALE) / 2,
  };
  if (arenaFieldEl) {
    arenaFieldEl.style.width = `${ARENA_SIZE.width * ARENA_SCALE}px`;
    arenaFieldEl.style.height = `${ARENA_SIZE.height * ARENA_SCALE}px`;
    arenaFieldEl.style.left = `${ARENA_OFFSET.x}px`;
    arenaFieldEl.style.top = `${ARENA_OFFSET.y}px`;
  }
};
const formatClock = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

class InputController {
  constructor() {
    this.keys = new Set();
    this.listenersAttached = false;
    this.virtualVector = { x: 0, y: 0, dash: false };
  }

  attach() {
    if (this.listenersAttached) return;
    window.addEventListener("keydown", (event) => this.#handle(event, true));
    window.addEventListener("keyup", (event) => this.#handle(event, false));
    this.listenersAttached = true;
  }

  #handle(event, isDown) {
    const action = KEY_MAP[event.code];
    if (!action) return;
    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (isTypingTarget) return;
    event.preventDefault();
    if (isDown) this.keys.add(action);
    else this.keys.delete(action);
  }

  setVirtual(vector) {
    this.virtualVector = vector;
  }

  getVirtual() {
    return this.virtualVector;
  }

  vector() {
    const up = this.keys.has("up") ? -1 : 0;
    const down = this.keys.has("down") ? 1 : 0;
    const left = this.keys.has("left") ? -1 : 0;
    const right = this.keys.has("right") ? 1 : 0;
    const dash = this.keys.has("dash") || this.virtualVector.dash;
    let x = clamp(left + right + this.virtualVector.x, -1, 1);
    let y = clamp(up + down + this.virtualVector.y, -1, 1);
    // avoid lingering tiny values that jitter the avatar
    if (Math.abs(x) < 0.05) x = 0;
    if (Math.abs(y) < 0.05) y = 0;
    return { x, y, dash };
  }
}

class AudioKit {
  constructor() {
    this.ctx = null;
  }

  prime() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
  }

  blip({ freq = 440, duration = 0.02 }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "triangle";
    gain.gain.value = 0.01;
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}

class EventFeed {
  constructor(root, maxItems = 6) {
    this.root = root;
    this.maxItems = maxItems;
    this.fadeAfterMs = 10000;
    this.fadeDurationMs = 1200;
  }

  push(text) {
    if (!this.root) return;
    const row = document.createElement("li");
    row.textContent = text;
    this.root.prepend(row);
    setTimeout(() => {
      row.classList.add("event-feed__item--fade");
      setTimeout(() => row.remove(), this.fadeDurationMs);
    }, this.fadeAfterMs);
    while (this.root.children.length > this.maxItems) {
      this.root.removeChild(this.root.lastChild);
    }
  }
}

class MiniMapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
  }

  draw(players, localId) {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    this.ctx.fillRect(0, 0, width, height);
    players.forEach((player) => {
      const px = (player.position.x / ARENA_SIZE.width) * width;
      const py = (player.position.y / ARENA_SIZE.height) * height;
      this.ctx.fillStyle = player.color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, player.id === localId ? 5 : 3.5, 0, Math.PI * 2);
      this.ctx.fill();
      if (player.isIt) {
        this.ctx.strokeStyle = "rgba(255,255,255,0.8)";
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
    });
  }
}

class TouchStick {
  constructor(root, dashButton) {
    this.root = root;
    this.knob = root ? root.querySelector(".touch-stick__knob") : null;
    this.dashButton = dashButton;
    this.input = null;
    this.pointerActive = false;
    this.dashActive = false;
    this.enabled = false;
    this.boundStart = (event) => this.#start(event);
    this.boundMove = (event) => this.#move(event);
    this.boundEnd = (event) => this.#end(event);
    this.boundDashOn = () => this.#setDash(true);
    this.boundDashOff = () => this.#setDash(false);
  }

  enable() {
    if (!this.root || this.enabled) return;
    this.enabled = true;
    this.root.classList.add("is-visible");
    this.root.setAttribute("aria-hidden", "false");
    this.dashButton?.classList.add("is-visible");
    this.dashButton?.setAttribute("aria-hidden", "false");
    this.root.addEventListener("pointerdown", this.boundStart);
    window.addEventListener("pointermove", this.boundMove);
    window.addEventListener("pointerup", this.boundEnd);
    window.addEventListener("pointercancel", this.boundEnd);
    this.dashButton?.addEventListener("pointerdown", this.boundDashOn);
    this.dashButton?.addEventListener("pointerup", this.boundDashOff);
    this.dashButton?.addEventListener("pointercancel", this.boundDashOff);
  }

  setInput(input) {
    this.input = input;
    if (!input) return;
    this.input.setVirtual({ x: 0, y: 0, dash: false });
  }

  #start(event) {
    if (event.pointerType !== "touch") return;
    this.pointerActive = true;
    event.preventDefault();
    this.#updateVector(event);
  }

  #move(event) {
    if (!this.pointerActive || event.pointerType !== "touch") return;
    event.preventDefault();
    this.#updateVector(event);
  }

  #end(event) {
    if (event.pointerType && event.pointerType !== "touch") return;
    this.pointerActive = false;
    this.#updateInput({ x: 0, y: 0, dash: this.dashActive });
    if (this.knob) this.knob.style.transform = "translate(0, 0)";
  }

  #setDash(state) {
    this.dashActive = state;
    if (!this.input) return;
    const vector = this.input.getVirtual();
    this.input.setVirtual({ x: vector.x, y: vector.y, dash: state });
  }

  #updateVector(event) {
    const rect = this.root.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = (event.clientX - centerX) / (rect.width / 2);
    const dy = (event.clientY - centerY) / (rect.height / 2);
    const x = clamp(dx, -1, 1);
    const y = clamp(dy, -1, 1);
    if (this.knob) {
      this.knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
    }
    this.#updateInput({ x, y, dash: this.dashActive });
  }

  #updateInput(vector) {
    if (!this.input) return;
    this.input.setVirtual(vector);
  }
}

class ArenaRenderer {
  constructor(parent) {
    this.parent = parent;
    this.domNodes = new Map();
    this.orbNodes = new Map();
    this.camera = { x: 0, y: 0 };
  }

  sync(players, localId) {
    players.forEach((player) => {
      if (!this.domNodes.has(player.id)) {
        const node = document.createElement("div");
        node.className = "player-node";
        node.style.background = player.color;
        const initials = document.createElement("span");
        initials.className = "player-node__initial";
        const badge = document.createElement("span");
        badge.className = "player-node__badge";
        node.append(initials, badge);
        this.parent.appendChild(node);
        this.domNodes.set(player.id, node);
      }
      const el = this.domNodes.get(player.id);
      el.dataset.leader = String(player.isLeader);
      el.dataset.tagState = player.isIt ? "it" : "safe";
      el.dataset.streak = (player.streak ?? 0).toString();
      const initials = el.querySelector(".player-node__initial");
      const badge = el.querySelector(".player-node__badge");
      if (initials) initials.textContent = player.name[0]?.toUpperCase() ?? "?";
      if (badge) badge.textContent = player.score.toString();
      const size = PLAYER_RADIUS * 2 * ARENA_SCALE;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      const tx =
        (player.position.x - PLAYER_RADIUS) * ARENA_SCALE - this.camera.x;
      const ty =
        (player.position.y - PLAYER_RADIUS) * ARENA_SCALE - this.camera.y;
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    });

    [...this.domNodes.keys()].forEach((id) => {
      if (!players.find((player) => player.id === id)) {
        this.domNodes.get(id)?.remove();
        this.domNodes.delete(id);
      }
    });

    this.camera.x = 0;
    this.camera.y = 0;
  }

  resetCamera() {
    this.camera = { x: 0, y: 0 };
  }

  syncOrbs(orbs) {
    if (!this.parent) return;
    orbs.forEach((orb) => {
      if (!this.orbNodes.has(orb.id)) {
        const node = document.createElement("div");
        node.className = "point-orb";
        node.dataset.value = String(orb.value);
        node.textContent = `+${orb.value}`;
        this.parent.appendChild(node);
        this.orbNodes.set(orb.id, node);
      }
      const el = this.orbNodes.get(orb.id);
      const size = orb.radius * 2 * ARENA_SCALE;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      const tx =
        (orb.position.x - orb.radius) * ARENA_SCALE - this.camera.x;
      const ty =
        (orb.position.y - orb.radius) * ARENA_SCALE - this.camera.y;
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    });

    [...this.orbNodes.keys()].forEach((id) => {
      if (!orbs.find((orb) => orb.id === id)) {
        this.orbNodes.get(id)?.remove();
        this.orbNodes.delete(id);
      }
    });
  }
}

// BACKEND: DELETE - SandboxEngine is client-only simulation.
class SandboxEngine {
  constructor(renderer, audio) {
    this.renderer = renderer;
    this.audio = audio;
    this.players = [];
    this.orbs = [];
    this.localId = "local";
    this.timer = MATCH_SECONDS;
    this.loop = null;
    this.botTimer = null;
    this.lobbyTimer = null;
    this.orbTimer = null;
    this.ended = false;
    this.lastFrameTime = 0;
    this.listeners = new Map();
    this.input = new InputController();
    this.input.attach();
    this.botCount = 0;
    this.orbCount = 0;
    this._tickHandle = (timestamp) => this.#tick(timestamp);
  }

  start(name) {
    this.players = [
      this.#newPlayer(this.localId, name, true),
      this.#newPlayer("bot-1", "Rogue", false),
      this.#newPlayer("bot-2", "Helix", false),
      this.#newPlayer("bot-3", "Nyx", false),
    ];
    this.orbs = [];
    this.players[1].isIt = true;
    this.timer = MATCH_SECONDS;
    this.ended = false;
    this.botCount = 3;
    this.orbCount = 0;
    this.lastFrameTime = performance.now();
    this.loop = requestAnimationFrame(this._tickHandle);
    // BACKEND: DELETE - bot movement simulation is client-only.
    this.botTimer = setInterval(() => this.#moveBots(), 600);
    // BACKEND: DELETE - lobby simulation is client-only.
    this.lobbyTimer = setInterval(() => this.#simulateLobby(), 8000);
    // BACKEND: MOVE - orb spawning should be server-controlled.
    this.orbTimer = setInterval(() => this.#spawnOrbs(), ORB_SPAWN_INTERVAL);
    // BACKEND: MOVE - orb spawning should be server-controlled.
    this.#spawnOrbs();
    this.#emit("state", this.#snapshot());
  }

  stop() {
    cancelAnimationFrame(this.loop);
    clearInterval(this.botTimer);
    clearInterval(this.lobbyTimer);
    clearInterval(this.orbTimer);
    this.players = [];
    this.orbs = [];
    this.ended = true;
  }

  on(event, handler) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  emitMove() {
    /* sandbox keeps movement client-side */
  }

  #emit(event, payload) {
    (this.listeners.get(event) ?? []).forEach((fn) => fn(payload));
  }

  #tick(timestamp) {
    syncArenaSize();
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const deltaMs = Math.min(50, Math.max(0, now - this.lastFrameTime));
    const dt = deltaMs / 1000;
    this.lastFrameTime = now;
    this.#stepLocal(dt);
    this.#resolveTags();
    this.#resolveOrbs();
    this.#updateTimer(dt);
    this.#emit("state", this.#snapshot());
    if (!this.ended) this.loop = requestAnimationFrame(this._tickHandle);
  }

  #stepLocal(dt) {
    const player = this.players.find((p) => p.id === this.localId);
    if (!player) return;
    const dir = this.input.vector();
    if (!dir.x && !dir.y) return;
    const mag = Math.hypot(dir.x, dir.y) || 1;
    const dash = dir.dash ? DASH_SCALE : 1;
    const speed = PLAYER_SPEED * dash * dt;
    player.position.x = clamp(
      player.position.x + (dir.x / mag) * speed,
      PLAYER_RADIUS,
      ARENA_SIZE.width - PLAYER_RADIUS
    );
    player.position.y = clamp(
      player.position.y + (dir.y / mag) * speed,
      PLAYER_RADIUS,
      ARENA_SIZE.height - PLAYER_RADIUS
    );
  }

  // BACKEND: DELETE - bot movement logic is client-only.
  #moveBots() {
    this.players
      .filter((p) => p.id.startsWith("bot"))
      .forEach((bot) => {
        bot.position.x = clamp(
          bot.position.x + (Math.random() - 0.5) * 160,
          PLAYER_RADIUS,
          ARENA_SIZE.width - PLAYER_RADIUS
        );
        bot.position.y = clamp(
          bot.position.y + (Math.random() - 0.5) * 160,
          PLAYER_RADIUS,
          ARENA_SIZE.height - PLAYER_RADIUS
        );
      });
  }

  // BACKEND: MOVE - tag resolution must be server authoritative.
  #resolveTags() {
    const itPlayer = this.players.find((p) => p.isIt);
    if (!itPlayer) return;
    this.players.forEach((candidate) => {
      if (candidate.id === itPlayer.id) return;
      const dist = Math.hypot(
        candidate.position.x - itPlayer.position.x,
        candidate.position.y - itPlayer.position.y
      );
      if (dist < 54) {
        const transfer =
          itPlayer.score > candidate.score
            ? Math.min(1, candidate.score)
            : 0;
        itPlayer.isIt = false;
        candidate.isIt = true;
        if (transfer > 0) {
          itPlayer.score += transfer;
          candidate.score -= transfer;
          itPlayer.streak = (itPlayer.streak || 0) + 1;
        } else {
          itPlayer.streak = 0;
        }
        candidate.streak = 0;
        this.audio.blip({ freq: 500 });
        this.#emit("tag", {
          from: itPlayer.name,
          to: candidate.name,
          streak: itPlayer.streak,
          score: itPlayer.score,
        });
      }
    });
  }

  // BACKEND: MOVE - orb collection should be server authoritative.
  #resolveOrbs() {
    if (this.orbs.length === 0) return;
    const remaining = [];
    this.orbs.forEach((orb) => {
      let collected = false;
      for (const player of this.players) {
        const dist = Math.hypot(
          player.position.x - orb.position.x,
          player.position.y - orb.position.y
        );
        if (dist <= PLAYER_RADIUS + orb.radius) {
          player.score += orb.value;
          collected = true;
          break;
        }
      }
      if (!collected) remaining.push(orb);
    });
    this.orbs = remaining;
  }

  #updateTimer(dt) {
    if (this.ended) return;
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer === 0) {
      clearInterval(this.botTimer);
      this.botTimer = null;
      this.ended = true;
      const ranked = [...this.players].sort((a, b) => b.score - a.score);
      this.#emit("match-end", { players: ranked });
    }
  }

  #snapshot() {
    return {
      players: [...this.players],
      orbs: [...this.orbs],
      timer: this.timer,
      localId: this.localId,
    };
  }

  #newPlayer(id, name, leader) {
    const padding = Math.max(PLAYER_RADIUS * 2, 90);
    const minX = padding;
    const maxX = Math.max(padding, ARENA_SIZE.width - padding);
    const minY = padding;
    const maxY = Math.max(padding, ARENA_SIZE.height - padding);
    return {
      id,
      name,
      isLeader: leader,
      isIt: false,
      score: 0,
      streak: 0,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      position: {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
      },
    };
  }

  // BACKEND: MOVE - orb spawn generation should be server authoritative.
  #spawnOrbs() {
    if (this.ended) return;
    const padding = PLAYER_RADIUS + 12;
    const minX = padding;
    const maxX = Math.max(padding, ARENA_SIZE.width - padding);
    const minY = padding;
    const maxY = Math.max(padding, ARENA_SIZE.height - padding);
    for (let i = 0; i < ORB_SPAWN_COUNT; i += 1) {
      const value = ORB_VALUES[Math.floor(Math.random() * ORB_VALUES.length)];
      const radius = orbRadiusForValue(value);
      this.orbCount += 1;
      this.orbs.push({
        id: `orb-${this.orbCount}`,
        value,
        radius,
        position: {
          x: minX + Math.random() * (maxX - minX),
          y: minY + Math.random() * (maxY - minY),
        },
      });
    }
  }

  // BACKEND: DELETE - mock lobby churn is client-only.
  #simulateLobby() {
    if (this.ended || this.players.length === 0) return;
    const shouldJoin = Math.random() > 0.5;
    if (shouldJoin && this.players.length < 6) {
      const bot = this.#spawnBot();
      if (bot) this.#emit("lobby", { type: "join", name: bot.name });
      return;
    }
    const removable = this.players.filter((p) => p.id !== this.localId);
    if (removable.length <= 1) return;
    const leaving = removable[Math.floor(Math.random() * removable.length)];
    this.players = this.players.filter((p) => p.id !== leaving.id);
    if (leaving.isIt && this.players.length) {
      const fallback = this.players[Math.floor(Math.random() * this.players.length)];
      fallback.isIt = true;
    }
    this.#emit("lobby", { type: "leave", name: leaving.name });
  }

  // BACKEND: DELETE - bots are for sandbox testing only.
  #spawnBot() {
    this.botCount += 1;
    const id = `bot-${this.botCount}`;
    const name = this.#uniqueBotName();
    const bot = this.#newPlayer(id, name, false);
    this.players.push(bot);
    return bot;
  }

  // BACKEND: DELETE - bots are for sandbox testing only.
  #uniqueBotName() {
    const pick = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const collisions = this.players.filter((p) => p.name.startsWith(pick)).length;
    return collisions ? `${pick}${collisions + 1}` : pick;
  }
}

class InterfaceController {
  constructor() {
    this.renderer = new ArenaRenderer(arenaFieldEl || arenaEl);
    this.audio = new AudioKit();
    this.sandbox = null;
    this.socket = null;
    this.streak = 0;
    this.activePlayers = [];
    this.timer = MATCH_SECONDS;
    this.status = "idle";
    this.feed = new EventFeed(eventFeedEl);
    this.miniMap = new MiniMapRenderer(miniMapCanvas);
    this.netShim = null;
    this.touchStick = new TouchStick(touchStickEl, touchDashBtn);
    this.prefersCoarse = window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    this.localId = null;
    this.tagTicker = null;
    this.isHost = false;
    this.input = new InputController();
    this.input.attach();
    this.inputLoop = null;
  }

  bootstrap() {
    syncArenaSize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => syncArenaSize());
      observer.observe(arenaEl);
    } else {
      window.addEventListener("resize", () => syncArenaSize());
    }

    joinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.audio.prime();
      syncArenaSize();
      this.#joinRoom();
    });

    devModeBtn.addEventListener("click", () => {
      this.audio.prime();
      syncArenaSize();
      this.#enterSandbox("Echo");
      overlayEl.hidden = true;
      requestAnimationFrame(() => syncArenaSize());
    });

    startMatchBtn.addEventListener("click", () => {
      if (this.sandbox) {
        this.status = "running";
        overlayEl.hidden = true;
        startMatchBtn.disabled = true;
        requestAnimationFrame(() => syncArenaSize());
        return;
      }
      if (!this.socket || !this.isHost) return;
      this.socket.emit("game-action", { action: "start" });
    });

    pauseToggleBtn.addEventListener("click", () => {
      const pressed = pauseToggleBtn.getAttribute("aria-pressed") === "true";
      pauseToggleBtn.setAttribute("aria-pressed", String(!pressed));
      pauseToggleBtn.textContent = pressed ? "Pause" : "Resume";
      if (!this.socket) return;
      const action = pressed ? "resume" : "pause";
      this.socket.emit("game-action", { action });
    });

    resumeBtn?.addEventListener("click", () => {
      if (!this.socket) return;
      this.socket.emit("game-action", { action: "resume" });
    });

    quitMatchBtn?.addEventListener("click", () => {
      if (!this.socket) return;
      this.socket.emit("leave-game");
    });

    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!this.socket) return;
      const pressed = pauseToggleBtn.getAttribute("aria-pressed") === "true";
      const action = pressed ? "resume" : "pause";
      this.socket.emit("game-action", { action });
    });

    resetViewBtn.addEventListener("click", () => this.renderer.resetCamera());
    leaveMatchBtn.addEventListener("click", () => window.location.reload());

    copyRoomBtn?.addEventListener("click", async () => {
      const code = roomInput.value.trim();
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        this.#toast("Room code copied");
      } catch {
        this.#toast("Copy failed");
      }
    });


    // BACKEND: DELETE - latency slider is only for sandbox testing.

    motionToggle?.addEventListener("change", () => {
      document.body.classList.toggle("reduced-motion", motionToggle.checked);
    });

    if (this.prefersCoarse) {
      this.touchStick.enable();
    }
  }

  #connectSocket() {
    if (this.socket) return this.socket;
    if (typeof io === "undefined") {
      this.#toast("Socket.io not available");
      return null;
    }
    this.socket = io();
    this.socket.on("room-joined", (payload) => this.#handleRoomJoined(payload));
    this.socket.on("room-update", (payload) => this.#handleRoomUpdate(payload));
    this.socket.on("game-update", (payload) => this.#handleGameUpdate(payload));
    this.socket.on("tag-event", (payload) => this.#handleSocketTag(payload));
    this.socket.on("game-state", (payload) => this.#handleGameState(payload));
    this.socket.on("game-ended", (payload) => this.#handleGameEnded(payload));
    this.socket.on("system-message", (payload) => {
      if (payload?.message) this.#logEvent(payload.message);
    });
    this.socket.on("left-room", () => {
      window.location.reload();
    });
    return this.socket;
  }

  #joinRoom() {
    const socket = this.#connectSocket();
    if (!socket) return;
    const playerName = playerNameInput.value.trim() || "Pilot";
    const roomCode = roomInput.value.trim() || undefined;
    socket.emit("join-room", { playerName, roomCode }, (err) => {
      if (err?.message) this.#toast(err.message);
    });
  }

  #enterSandbox(name) {
    syncArenaSize();
    startMatchBtn.disabled = false;
    startMatchBtn.textContent = "Start Match (sandbox)";
    // BACKEND: DELETE - sandbox start will be replaced by socket join.
    this.sandbox?.stop();
    this.sandbox = new SandboxEngine(this.renderer, this.audio);
    this.touchStick.setInput(this.sandbox.input);
    // BACKEND: DELETE - sandbox events will be replaced by socket events.
    this.sandbox.on("state", (state) => this.#applyState(state));
    this.sandbox.on("tag", (data) => this.#handleTag(data));
    this.sandbox.on("match-end", ({ players }) => this.#handleMatchEnd(players));
    this.sandbox.on("lobby", (payload) => this.#handleLobbyEvent(payload));
    this.sandbox.start(name);
  }

  #handleRoomJoined({ roomCode, playerId, isHost, arenaSize, players, orbs, state }) {
    this.localId = playerId;
    this.isHost = Boolean(isHost);
    if (arenaSize?.width && arenaSize?.height) {
      ARENA_SIZE = { width: arenaSize.width, height: arenaSize.height };
    }
    syncArenaSize();
    roomInput.value = roomCode || "";
    if (roomDisplay) roomDisplay.textContent = roomCode || "—";
    startMatchBtn.disabled = !this.isHost;
    startMatchBtn.textContent = this.isHost ? "Start Match" : "Waiting for host";
    overlayEl.hidden = state === "playing";
    if (pauseOverlay) pauseOverlay.hidden = true;
    this.touchStick.setInput(this.input);
    this.#startInputLoop();
    this.#applyState({ players: players ?? [], orbs: orbs ?? [], timer: this.timer, localId: this.localId });
    this.#updateLobbyList(players ?? []);
  }

  #handleRoomUpdate({ players, orbs, state }) {
    this.status = state || this.status;
    if (state === "playing") overlayEl.hidden = true;
    this.#applyState({ players: players ?? [], orbs: orbs ?? [], timer: this.timer, localId: this.localId });
    this.#updateLobbyList(players ?? []);
    if (statusLabel) statusLabel.textContent = this.#statusText();
  }

  #handleGameUpdate({ players, orbs, timer, state }) {
    this.status = state || this.status;
    if (state === "playing") overlayEl.hidden = true;
    if (state === "paused") {
      pauseToggleBtn.setAttribute("aria-pressed", "true");
      pauseToggleBtn.textContent = "Resume";
    } else {
      pauseToggleBtn.setAttribute("aria-pressed", "false");
      pauseToggleBtn.textContent = "Pause";
    }
    if (pauseOverlay && state !== "paused") pauseOverlay.hidden = true;
    this.#applyState({ players: players ?? [], orbs: orbs ?? [], timer, localId: this.localId });
    this.#updateLobbyList(players ?? []);
    if (statusLabel) statusLabel.textContent = this.#statusText();
  }

  #handleSocketTag({ taggerId, taggedId, taggerName, taggedName, scores }) {
    const score = scores?.[taggerId] ?? 0;
    this.#updateTagTicker({ from: taggerName, to: taggedName, score });
    this.#logEvent(`${taggerName} → ${taggedName}`);
    this.audio.blip({ freq: 500 + Math.random() * 100 });
  }

  #handleGameState({ state, actionBy }) {
    if (state === "paused") {
      pauseToggleBtn.setAttribute("aria-pressed", "true");
      pauseToggleBtn.textContent = "Resume";
      if (pauseOverlay) {
        pauseOverlay.hidden = false;
        const name = this.#getPlayerName(actionBy);
        if (pausedByLabel) {
          pausedByLabel.textContent = name ? `Paused by ${name}` : "Paused";
        }
        if (resumeBtn) resumeBtn.disabled = false;
      }
    }
    if (state === "playing") {
      pauseToggleBtn.setAttribute("aria-pressed", "false");
      pauseToggleBtn.textContent = "Pause";
      overlayEl.hidden = true;
      if (pauseOverlay) pauseOverlay.hidden = true;
    }
    if (state === "ended") overlayEl.hidden = false;
    if (statusLabel) statusLabel.textContent = this.#statusText(state);
  }

  #handleGameEnded({ winner }) {
    if (winner?.name) this.#toast(`${winner.name} takes the round`);
    overlayEl.hidden = false;
    startMatchBtn.disabled = !this.isHost;
    startMatchBtn.textContent = this.isHost ? "Restart Match" : "Waiting for host";
    if (pauseOverlay) pauseOverlay.hidden = true;
    this.#updateLobbyList(this.activePlayers);
    if (statusLabel) statusLabel.textContent = this.#statusText("ended");
  }

  #statusText(nextState) {
    const state = nextState || this.status;
    if (state === "playing") return "Live";
    if (state === "paused") return "Paused";
    if (state === "ended") return "Ended";
    return "Waiting";
  }

  #getPlayerName(id) {
    if (!id) return "";
    return this.activePlayers.find((player) => player.id === id)?.name || "";
  }

  #updateLobbyList(players) {
    if (!playerList) return;
    playerList.innerHTML = "";
    if (playerCount) playerCount.textContent = `${players.length}/4`;
    players.forEach((player) => {
      const row = document.createElement("li");
      row.textContent = player.name;
      const badge = document.createElement("span");
      badge.textContent = player.isHost ? "Host" : "Player";
      row.appendChild(badge);
      if (player.id === this.localId) row.style.color = "var(--ink-strong)";
      playerList.appendChild(row);
    });
  }

  #startInputLoop() {
    if (this.inputLoop) return;
    const tick = () => {
      if (!this.socket) return;
      const { x, y } = this.input.vector();
      this.socket.emit("player-move", { x, y });
      this.inputLoop = requestAnimationFrame(tick);
    };
    this.inputLoop = requestAnimationFrame(tick);
  }

  #applyState({ players, orbs, timer, localId }) {
    this.localId = localId;
    this.activePlayers = players;
    this.timer = timer;
    this.renderer.sync(players, localId);
    this.renderer.syncOrbs(orbs ?? []);
    this.#updateLeaderboard(players);
    timerLabel.textContent = formatClock(timer);
    this.miniMap.draw(players, localId);
    const localPlayer = players.find((player) => player.id === localId);
    const streakValue = localPlayer?.streak ?? 0;
    this.streak = streakValue;
    if (statusLabel) {
      statusLabel.textContent = this.#statusText();
    }
  }

  #updateLeaderboard(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    leaderboardEl.innerHTML = "";
    sorted.forEach((player) => {
      const item = document.createElement("li");
      item.textContent = `${player.name} — ${player.score}`;
      item.classList.toggle("is-it", player.isIt);
      item.classList.toggle("is-local", player.id === this.localId);
      leaderboardEl.appendChild(item);
    });
  }

  #toast(text) {
    const pill = document.createElement("div");
    pill.className = "tag-toast";
    pill.textContent = text;
    messagesEl.appendChild(pill);
    setTimeout(() => pill.remove(), 2500);
  }

  #handleTag({ from, to, streak, score }) {
    this.#updateTagTicker({ from, to, score });
    const addon = streak > 1 ? ` (${streak} streak)` : "";
    this.#logEvent(`${from} → ${to}${addon}`);
  }

  #handleLobbyEvent({ type, name }) {
    const verb = type === "join" ? "joined" : "left";
    const emoji = type === "join" ? "+" : "−";
    this.#logEvent(`${emoji} ${name} ${verb} the arena`);
  }

  #logEvent(text) {
    this.feed.push(text);
  }

  #ensureTagTicker() {
    if (!messagesEl) return null;
    if (!this.tagTicker) {
      this.tagTicker = document.createElement("div");
      this.tagTicker.className = "tag-ticker";
      messagesEl.prepend(this.tagTicker);
    }
    return this.tagTicker;
  }

  #updateTagTicker({ from, to, score }) {
    const ticker = this.#ensureTagTicker();
    if (!ticker) return;
    const suffix = score && score > 1 ? ` x${score}` : "";
    ticker.textContent = `${from} tagged ${to}${suffix}`;
    ticker.classList.remove("tag-ticker--flash");
    // force reflow to restart animation
    void ticker.offsetWidth;
    ticker.classList.add("tag-ticker--flash");
  }

  #handleMatchEnd(players) {
    this.status = "ended";
    const winner = players[0];
    if (winner) this.#toast(`${winner.name} takes the round`);
    overlayEl.hidden = false;
    startMatchBtn.disabled = false;
    startMatchBtn.textContent = "Restart Match";
  }
}

const controller = new InterfaceController();
controller.bootstrap();
