/**
 * GameManager - Wires game loop to Socket.io: tick broadcast, tag events, game end.
 */

const { Game } = require('../game/Game');

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

    game.onTag = (g, taggerId, taggedId) => {
      const tagger = g.getPlayer(taggerId);
      const tagged = g.getPlayer(taggedId);
      const scores = {};
      for (const [id, p] of g.players) scores[id] = p.score;
      this.io.to(roomId).emit('tag-event', {
        taggerId,
        taggedId,
        taggerName: tagger ? tagger.name : '',
        taggedName: tagged ? tagged.name : '',
        scores
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
