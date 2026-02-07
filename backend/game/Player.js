/**
 * Player - Represents a player in the game arena.
 * Server-authoritative: position and velocity are managed by the server.
 */

const PLAYER_RADIUS = 25;
const MOVE_SPEED = 4;
const DASH_SCALE = 1.55;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

class Player {
  /**
   * @param {string} id - Socket ID
   * @param {string} name - Display name
   * @param {boolean} isHost
   * @param {{ width: number, height: number }} arenaSize
   * @param {number} colorIndex - Index into PLAYER_COLORS (0-3)
   */
  constructor(id, name, isHost, arenaSize, colorIndex = 0) {
    this.id = id;
    this.name = name;
    this.isHost = isHost;
    this.color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    this.score = 0;
    this.dash = false; // Whether player is currently dashing

    // Spawn in center-ish, spread slightly to avoid overlap
    const centerX = arenaSize.width / 2;
    const centerY = arenaSize.height / 2;
    const offset = (colorIndex + 1) * 60;
    this.position = {
      x: Math.max(PLAYER_RADIUS, Math.min(arenaSize.width - PLAYER_RADIUS, centerX - 80 + (colorIndex % 2) * offset)),
      y: Math.max(PLAYER_RADIUS, Math.min(arenaSize.height - PLAYER_RADIUS, centerY - 60 + Math.floor(colorIndex / 2) * offset))
    };
    this.velocity = { x: 0, y: 0 };
  }

  static get PLAYER_RADIUS() {
    return PLAYER_RADIUS;
  }

  static get MOVE_SPEED() {
    return MOVE_SPEED;
  }

  static get PLAYER_COLORS() {
    return [...PLAYER_COLORS];
  }

  /**
   * Set movement direction (normalized -1 to 1). Server applies speed.
   */
  setVelocity(x, y, dash = false) {
    let len = Math.sqrt(x * x + y * y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const speed = dash ? MOVE_SPEED * DASH_SCALE : MOVE_SPEED;
    this.velocity.x = x * speed;
    this.velocity.y = y * speed;
    this.dash = dash;
  }

  /**
   * Update position for one tick. Call from game loop.
   */
  updatePosition(arenaSize) {
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.clampToArena(arenaSize);
  }

  clampToArena(arenaSize) {
    const r = PLAYER_RADIUS;
    this.position.x = Math.max(r, Math.min(arenaSize.width - r, this.position.x));
    this.position.y = Math.max(r, Math.min(arenaSize.height - r, this.position.y));
  }

  /**
   * Add score (can be negative for obstacles).
   */
  addScore(delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    this.score += delta;
    if (this.score < 0) this.score = 0;
  }

  /**
   * Serialize for client (minimal payload).
   */
  toClient() {
    return {
      id: this.id,
      name: this.name,
      isHost: this.isHost,
      position: { ...this.position },
      velocity: { ...this.velocity },
      color: this.color,
      score: this.score
    };
  }
}

module.exports = { Player };
