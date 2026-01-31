/**
 * RoomManager - Unique room codes, create/join, max 4 players, unique names per room.
 */

const { Game } = require('../game/Game');

const ROOM_CODE_LENGTH = 6;
const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return code;
}

class RoomManager {
  constructor() {
    /** @type {Map<string, Game>} roomCode -> Game */
    this.rooms = new Map();
    /** @type {Map<string, string>} socketId -> roomCode */
    this.socketToRoom = new Map();
  }

  /**
   * Create a new room. Host is the first player.
   * @returns {{ roomCode: string, game: Game } | null} null if failed
   */
  createRoom(hostId, hostName) {
    let roomCode = generateRoomCode();
    let attempts = 0;
    while (this.rooms.has(roomCode) && attempts < 20) {
      roomCode = generateRoomCode();
      attempts++;
    }
    if (this.rooms.has(roomCode)) return null;

    const game = new Game(roomCode, hostId, hostName);
    this.rooms.set(roomCode, game);
    this.socketToRoom.set(hostId, roomCode);
    return { roomCode, game };
  }

  /**
   * Join existing room by code.
   * @returns {{ game: Game, player: import('../game/Player').Player } | { error: string }}
   */
  joinRoom(socketId, playerName, roomCode) {
    const code = (roomCode || '').trim().toUpperCase();
    if (!code || code.length !== ROOM_CODE_LENGTH) {
      return { error: 'invalid_room_code' };
    }

    const game = this.rooms.get(code);
    if (!game) {
      return { error: 'room_not_found' };
    }
    if (game.getPlayerCount() >= 4) {
      return { error: 'room_full' };
    }

    const name = (playerName || '').trim();
    if (!name || name.length < 1) {
      return { error: 'invalid_name' };
    }

    const player = game.addPlayer(socketId, name);
    if (!player) {
      return { error: 'duplicate_name' };
    }

    this.socketToRoom.set(socketId, code);
    return { game, player };
  }

  /**
   * Get room code for a socket (if in a room).
   */
  getRoomForSocket(socketId) {
    return this.socketToRoom.get(socketId) || null;
  }

  /**
   * Get game for socket (if in a room).
   */
  getGameForSocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  /**
   * Remove socket from its room. If room becomes empty, delete room.
   * @returns {{ game: Game, wasHost: boolean, newHostId?: string } | null}
   */
  leaveRoom(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    const game = this.rooms.get(roomCode);
    if (!game) {
      this.socketToRoom.delete(socketId);
      return null;
    }

    const player = game.getPlayer(socketId);
    const wasHost = player ? player.isHost : false;
    game.removePlayer(socketId);
    this.socketToRoom.delete(socketId);

    if (game.getPlayerCount() === 0) {
      game.destroy();
      this.rooms.delete(roomCode);
      return { game, wasHost };
    }

    const newHost = [...game.players.values()].find(p => p.isHost);
    return { game, wasHost, newHostId: newHost ? newHost.id : undefined };
  }

  getRoomCodeLength() {
    return ROOM_CODE_LENGTH;
  }
}

module.exports = { RoomManager, generateRoomCode };
