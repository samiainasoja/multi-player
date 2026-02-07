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
const messagesEl = $("#arenaMessages");
const eventFeedEl = $("#eventFeed");
const miniMapCanvas = $("#miniMap");
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
const createLobbyBtn = $("#createLobby");
const winOverlay = $("#winOverlay");
const winTitle = $("#winTitle");
const winSubtitle = $("#winSubtitle");
const winScoresList = $("#winScoresList");
const winBackBtn = $("#winBackBtn");

let ARENA_SIZE = { width: 1100, height: 640 };
let VIEWPORT_SIZE = { width: 0, height: 0 };
let ARENA_SCALE = 1;
let ARENA_OFFSET = { x: 0, y: 0 };
const MATCH_SECONDS = 2 * 60;
const PLAYER_RADIUS = 27;

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
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
        if (orb.type === "obstacle") {
          node.className = "point-orb point-orb--obstacle";
          node.textContent = `${orb.value}`;
        } else if (orb.type === "golden") {
          node.className = "point-orb point-orb--golden";
          node.textContent = `+${orb.value}`;
        } else {
          node.className = "point-orb";
          node.textContent = `+${orb.value}`;
        }
        node.dataset.value = String(Math.abs(orb.value));
        node.dataset.type = orb.type || "point";
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

class InterfaceController {
  constructor() {
    this.renderer = new ArenaRenderer(arenaFieldEl || arenaEl);
    this.audio = new AudioKit();
    this.socket = null;
    this.activePlayers = [];
    this.timer = MATCH_SECONDS;
    this.status = "idle";
    this.feed = new EventFeed(eventFeedEl);
    this.miniMap = new MiniMapRenderer(miniMapCanvas);
    this.touchStick = new TouchStick(touchStickEl, touchDashBtn);
    this.prefersCoarse = window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    this.localId = null;
    this.isHost = false;
    this.pausedBy = null; // Track who paused the game
    this.input = new InputController();
    this.input.attach();
    this.inputLoop = null;
    this.stateBuffer = [];
    this.renderLoop = null;
    this.interpolationDelay = 50;
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

    createLobbyBtn.addEventListener("click", () => {
      this.audio.prime();
      syncArenaSize();
      this.#createLobby();
    });

    startMatchBtn.addEventListener("click", () => {
      if (!this.socket || !this.isHost) return;
      this.socket.emit("game-action", { action: "start" });
    });

    pauseToggleBtn.addEventListener("click", () => {
      const pressed = pauseToggleBtn.getAttribute("aria-pressed") === "true";
      if (!this.socket) return;
      
      // If trying to resume, check permissions
      if (pressed) {
        // Can resume if you're the host or the player who paused
        if (!this.isHost && this.localId !== this.pausedBy) {
          this.#toast("Only the host or who paused can resume");
          return;
        }
      }
      
      pauseToggleBtn.setAttribute("aria-pressed", String(!pressed));
      pauseToggleBtn.textContent = pressed ? "Pause" : "Resume";
      const action = pressed ? "resume" : "pause";
      this.socket.emit("game-action", { action });
    });

    resumeBtn?.addEventListener("click", () => {
      if (!this.socket) return;
      // Check permissions before attempting to resume
      if (!this.isHost && this.localId !== this.pausedBy) {
        this.#toast("Only the host or who paused can resume");
        return;
      }
      this.socket.emit("game-action", { action: "resume" });
    });

    quitMatchBtn?.addEventListener("click", () => {
      if (!this.socket) return;
      this.socket.emit("game-action", { action: "quit" });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!this.socket) return;
      const pressed = pauseToggleBtn.getAttribute("aria-pressed") === "true";
      const action = pressed ? "resume" : "pause";
      this.socket.emit("game-action", { action });
    });

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

    winBackBtn?.addEventListener("click", () => {
      if (winOverlay) winOverlay.hidden = true;
      overlayEl.hidden = false;
      startMatchBtn.disabled = !this.isHost;
      startMatchBtn.textContent = this.isHost ? "Restart Match" : "Waiting for host";
      this.#updateLobbyList(this.activePlayers);
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

  #createLobby() {
    const socket = this.#connectSocket();
    if (!socket) return;
    const playerName = playerNameInput.value.trim() || "Pilot";
    socket.emit("join-room", { playerName, roomCode: undefined }, (err) => {
      if (err?.message) this.#toast(err.message);
    });
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
    if (winOverlay) winOverlay.hidden = true;
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
    if (state === "playing") {
      overlayEl.hidden = true;
      if (winOverlay) winOverlay.hidden = true;
    }
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

  #handleGameState({ state, actionBy, pausedBy }) {
    if (state === "paused") {
      // Use pausedBy from payload, or fallback to actionBy (the one who triggered pause)
      this.pausedBy = pausedBy ?? actionBy;
      pauseToggleBtn.setAttribute("aria-pressed", "true");
      pauseToggleBtn.textContent = "Resume";
      if (pauseOverlay) {
        pauseOverlay.hidden = false;
        const name = this.#getPlayerName(actionBy);
        if (pausedByLabel) {
          pausedByLabel.textContent = name ? `Paused by ${name}` : "Paused";
        }
        // Only enable resume button for host or player who paused
        if (resumeBtn) {
          const canResume = this.isHost || this.localId === this.pausedBy;
          resumeBtn.disabled = !canResume;
          resumeBtn.textContent = canResume ? "Resume Match" : "Waiting for host or pauser";
        }
      }
    }
    if (state === "playing") {
      this.pausedBy = null; // Clear pausedBy when game resumes
      pauseToggleBtn.setAttribute("aria-pressed", "false");
      pauseToggleBtn.textContent = "Pause";
      overlayEl.hidden = true;
      if (pauseOverlay) pauseOverlay.hidden = true;
      if (winOverlay) winOverlay.hidden = true;
    }
    if (state === "ended") overlayEl.hidden = true;
    if (statusLabel) statusLabel.textContent = this.#statusText(state);
  }

  #handleGameEnded({ winner, finalScores }) {
    if (pauseOverlay) pauseOverlay.hidden = true;
    overlayEl.hidden = true;
    if (statusLabel) statusLabel.textContent = this.#statusText("ended");

    // Show win screen
    if (winOverlay) {
      winOverlay.hidden = false;
      const isLocalWinner = winner && winner.id === this.localId;
      if (winTitle) {
        winTitle.textContent = isLocalWinner ? "You Win!" : `${winner?.name || "Nobody"} Wins!`;
      }
      if (winSubtitle) {
        winSubtitle.textContent = isLocalWinner
          ? `Congratulations! You scored ${winner?.score ?? 0} points.`
          : `They scored ${winner?.score ?? 0} points.`;
      }
      if (winScoresList && finalScores) {
        winScoresList.innerHTML = "";
        const sorted = Object.entries(finalScores)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.score - a.score);
        sorted.forEach((entry, idx) => {
          const row = document.createElement("li");
          const rank = idx === 0 ? "1st" : idx === 1 ? "2nd" : idx === 2 ? "3rd" : `${idx + 1}th`;
          row.innerHTML = `<span class="win-rank">${rank}</span> <span class="win-name">${entry.name}</span> <span class="win-score">${entry.score} pts</span>`;
          if (entry.id === this.localId) row.classList.add("is-local");
          if (idx === 0) row.classList.add("is-winner");
          winScoresList.appendChild(row);
        });
      }
    }
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
      const labels = [];
      if (player.isHost) labels.push("Host");
      if (!labels.length) labels.push("Player");
      badge.textContent = labels.join(" • ");
      row.appendChild(badge);
      if (player.id === this.localId) row.style.color = "var(--ink-strong)";
      playerList.appendChild(row);
    });
  }

  #startInputLoop() {
    if (this.inputLoop) return;
    const tick = () => {
      if (!this.socket) return;
      const { x, y, dash } = this.input.vector();
      this.socket.emit("player-move", { x, y, dash });
      this.inputLoop = requestAnimationFrame(tick);
    };
    this.inputLoop = requestAnimationFrame(tick);
  }

  #applyState({ players, orbs, timer, localId }) {
    this.localId = localId;
    this.activePlayers = players;
    this.timer = timer;
    this.#updateLeaderboard(players);
    timerLabel.textContent = formatClock(timer);
    this.#pushSnapshot({ players, orbs, localId });
    if (statusLabel) {
      statusLabel.textContent = this.#statusText();
    }
  }

  #pushSnapshot({ players, orbs, localId }) {
    const timestamp = performance.now();
    this.stateBuffer.push({
      time: timestamp,
      players: players ?? [],
      orbs: orbs ?? [],
      localId,
    });
    if (this.stateBuffer.length > 20) {
      this.stateBuffer.splice(0, this.stateBuffer.length - 20);
    }
    this.#startRenderLoop();
  }

  #startRenderLoop() {
    if (this.renderLoop) return;
    const render = (now) => {
      this.#renderFrame(now);
      this.renderLoop = requestAnimationFrame(render);
    };
    this.renderLoop = requestAnimationFrame(render);
  }

  #renderFrame(now) {
    if (!this.stateBuffer.length) return;
    syncArenaSize();
    const renderTime = now - this.interpolationDelay;
    const { older, newer, alpha } = this.#getSnapshots(renderTime);
    const interpolatedPlayers = this.#interpolatePlayers(
      older.players,
      newer.players,
      alpha
    );
    const activeLocalId = newer.localId ?? older.localId;
    this.renderer.sync(interpolatedPlayers, activeLocalId);
    this.renderer.syncOrbs(newer.orbs ?? older.orbs ?? []);
    this.miniMap.draw(interpolatedPlayers, activeLocalId);
  }

  #getSnapshots(renderTime) {
    const buffer = this.stateBuffer;
    if (buffer.length === 1) {
      return { older: buffer[0], newer: buffer[0], alpha: 0 };
    }
    let older = buffer[0];
    let newer = buffer[buffer.length - 1];
    for (let i = 0; i < buffer.length - 1; i += 1) {
      const current = buffer[i];
      const next = buffer[i + 1];
      if (renderTime >= current.time && renderTime <= next.time) {
        older = current;
        newer = next;
        break;
      }
      if (renderTime > next.time) {
        older = next;
        newer = next;
      }
    }
    const span = Math.max(1, newer.time - older.time);
    const alpha = clamp((renderTime - older.time) / span, 0, 1);
    return { older, newer, alpha };
  }

  #interpolatePlayers(older, newer, alpha) {
    const olderMap = new Map(older.map((player) => [player.id, player]));
    return newer.map((player) => {
      const prev = olderMap.get(player.id);
      if (!prev) return player;
      return {
        ...player,
        position: {
          x: lerp(prev.position.x, player.position.x, alpha),
          y: lerp(prev.position.y, player.position.y, alpha),
        },
      };
    });
  }

  #updateLeaderboard(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    leaderboardEl.innerHTML = "";
    sorted.forEach((player) => {
      const item = document.createElement("li");
      item.textContent = `${player.name} — ${player.score}`;
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

  #logEvent(text) {
    this.feed.push(text);
  }

}

const controller = new InterfaceController();
controller.bootstrap();
