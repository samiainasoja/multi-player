/**
 * Game - One arena instance: room state, players, timer, and game loop.
 */

const { Player } = require('./Player');
const { checkCollisions, distance } = require('./Collision');

const ARENA_SIZE = { width: 1200, height: 720 };
const GAME_DURATION_SEC = 300; // 5 minutes
const TICK_MS = 1000 / 60; // ~60 FPS
const ORB_SPAWN_INTERVAL_MS = 4000;
const ORB_SPAWN_COUNT = 4;
const ORB_VALUES = [1, 3, 5, 10];
const orbRadiusForValue = (value) => 6 + value * 1.2;

class Game {
  /**
   * @param {string} roomId - Room code
   * @param {string} hostId - Socket ID of host
   * @param {string} hostName
   */
  constructor(roomId, hostId, hostName) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.players = new Map(); // socketId -> Player
    this.state = 'waiting'; // 'waiting' | 'playing' | 'paused' | 'ended'
    this.arenaSize = { ...ARENA_SIZE };
    this.timerSec = GAME_DURATION_SEC;
    this.gameLoopInterval = null;
    this.onTick = null; // (game) => void - set by GameManager to broadcast
    this.onTag = null;   // (game, taggerId, taggedId) => void
    this.onGameEnd = null; // (game, winner, finalScores) => void
    this.orbs = [];
    this.orbCount = 0;
    this.lastOrbSpawnAt = 0;

    // Add host as first player
    const host = new Player(hostId, hostName, true, this.arenaSize, 0);
    this.players.set(hostId, host);
  }

  static get ARENA_SIZE() {
    return { ...ARENA_SIZE };
  }

  static get GAME_DURATION_SEC() {
    return GAME_DURATION_SEC;
  }

  static get TICK_MS() {
    return TICK_MS;
  }

  getPlayerCount() {
    return this.players.size;
  }

  hasPlayer(socketId) {
    return this.players.has(socketId);
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  /**
   * Add player (when joining room). Returns the new Player or null if full/duplicate name.
   */
  addPlayer(socketId, name) {
    if (this.players.size >= 4) return null;
    const names = [...this.players.values()].map(p => p.name.toLowerCase());
    if (names.includes(name.trim().toLowerCase())) return null;
    const colorIndex = this.players.size;
    const player = new Player(socketId, name.trim(), false, this.arenaSize, colorIndex);
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    this.players.delete(socketId);
    if (player && player.isHost && this.players.size > 0) {
      // Assign new host to first remaining player
      const next = this.players.values().next().value;
      if (next) next.isHost = true;
    }
    return player;
  }

  getPlayersList() {
    return [...this.players.values()].map(p => p.toClient());
  }

  canStart() {
    return this.state === 'waiting' && this.players.size >= 2;
  }

  start() {
    if (this.state !== 'waiting' || !this.canStart()) return false;
    this.state = 'playing';
    this.timerSec = GAME_DURATION_SEC;
    this.orbs = [];
    this.orbCount = 0;
    this.lastOrbSpawnAt = Date.now();
    this.spawnOrbs();
    this.startGameLoop();
    return true;
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    this.stopGameLoop();
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this.startGameLoop();
    return true;
  }

  quit() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.stopGameLoop();
    const { winner, finalScores } = this.getFinalResult();
    if (this.onGameEnd) this.onGameEnd(this, winner, finalScores);
  }

  getFinalResult() {
    let winner = null;
    let maxScore = -1;
    const finalScores = {};
    for (const [id, p] of this.players) {
      finalScores[id] = { name: p.name, score: p.score };
      if (p.score > maxScore) {
        maxScore = p.score;
        winner = { id: p.id, name: p.name, score: p.score };
      }
    }
    return { winner, finalScores };
  }

  startGameLoop() {
    if (this.gameLoopInterval) return;
    this.gameLoopInterval = setInterval(() => this.tick(), TICK_MS);
  }

  stopGameLoop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
  }

  tick() {
    if (this.state !== 'playing') return;

    const now = Date.now();
    const arenaSize = this.arenaSize;
    const playerList = [...this.players.values()];

    // 0. Spawn orbs on interval
    if (now - this.lastOrbSpawnAt >= ORB_SPAWN_INTERVAL_MS) {
      this.spawnOrbs();
      this.lastOrbSpawnAt = now;
    }

    // 1. Update positions
    for (const p of playerList) {
      p.updatePosition(arenaSize);
    }

    // 2. Collisions / tags
    const tagEvents = checkCollisions(playerList, now);
    for (const { taggerId, taggedId } of tagEvents) {
      const tagger = this.players.get(taggerId);
      const tagged = this.players.get(taggedId);
      if (tagger && tagged) {
        tagger.recordTag(now);
        if (tagger.score > tagged.score) {
          const transfer = Math.min(1, tagged.score);
          if (transfer > 0) {
            tagger.addScore(transfer);
            tagged.addScore(-transfer);
          }
        }
        if (this.onTag) this.onTag(this, taggerId, taggedId);
      }
    }

    // 2.5 Orb collection
    this.resolveOrbCollisions(playerList);

    // 3. Timer
    this.timerSec -= TICK_MS / 1000;
    if (this.timerSec <= 0) {
      this.timerSec = 0;
      this.quit();
      return;
    }

    if (this.onTick) this.onTick(this);
  }

  destroy() {
    this.stopGameLoop();
    this.players.clear();
    this.orbs = [];
    this.onTick = null;
    this.onTag = null;
    this.onGameEnd = null;
  }

  getOrbsList() {
    return this.orbs.map(orb => ({
      id: orb.id,
      value: orb.value,
      radius: orb.radius,
      position: { ...orb.position }
    }));
  }

  spawnOrbs() {
    const padding = Player.PLAYER_RADIUS + 12;
    for (let i = 0; i < ORB_SPAWN_COUNT; i++) {
      const value = ORB_VALUES[Math.floor(Math.random() * ORB_VALUES.length)];
      const radius = orbRadiusForValue(value);
      const minX = padding + radius;
      const maxX = Math.max(minX, this.arenaSize.width - padding - radius);
      const minY = padding + radius;
      const maxY = Math.max(minY, this.arenaSize.height - padding - radius);
      this.orbCount += 1;
      this.orbs.push({
        id: `orb-${this.orbCount}`,
        value,
        radius,
        position: {
          x: minX + Math.random() * (maxX - minX),
          y: minY + Math.random() * (maxY - minY)
        }
      });
    }
  }

  resolveOrbCollisions(playerList) {
    if (!this.orbs.length) return;
    const remaining = [];
    for (const orb of this.orbs) {
      let collected = false;
      for (const player of playerList) {
        const dist = distance(player.position.x, player.position.y, orb.position.x, orb.position.y);
        if (dist <= Player.PLAYER_RADIUS + orb.radius) {
          player.addScore(orb.value);
          collected = true;
          break;
        }
      }
      if (!collected) remaining.push(orb);
    }
    this.orbs = remaining;
  }
}

module.exports = { Game, ARENA_SIZE, GAME_DURATION_SEC, TICK_MS };
