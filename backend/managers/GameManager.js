/**
 * GameManager - Wires game loop to Socket.io: tick broadcast and game end.
 */

class GameManager {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('./RoomManager')} roomManager
   */
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  /**
   * Attach game callbacks so that game loop broadcasts to the room.
   */
  attachGame(game) {
    const roomId = game.roomId;

    game.onTick = (g) => {
      this.io.to(roomId).emit('game-update', {
        players: g.getPlayersList(),
        orbs: g.getOrbsList(),
        timer: Math.max(0, Math.ceil(g.timerSec)),
        state: g.state
      });
    };

    game.onGameEnd = (g, winner, finalScores) => {
      this.io.to(roomId).emit('game-ended', {
        winner,
        finalScores
      });
    };
  }

  /**
   * Emit room state (player list, game state) to room. Use after join/leave or state change.
   */
  broadcastRoomUpdate(game) {
    const roomId = game.roomId;
    if (game.state === 'playing' || game.state === 'paused') {
      this.io.to(roomId).emit('game-update', {
        players: game.getPlayersList(),
        orbs: game.getOrbsList(),
        timer: Math.max(0, Math.ceil(game.timerSec)),
        state: game.state
      });
    } else {
      this.io.to(roomId).emit('room-update', {
        players: game.getPlayersList(),
        orbs: game.getOrbsList(),
        state: game.state
      });
    }
  }

  /**
   * Emit game-state (e.g. paused/resumed/quit) to room.
   */
  broadcastGameState(game, state, actionBy) {
    const payload = { state, actionBy };
    // Include pausedBy information when game is paused
    if (state === 'paused') {
      payload.pausedBy = game.pausedBy;
    }
    this.io.to(game.roomId).emit('game-state', payload);
  }
}

module.exports = { GameManager };
