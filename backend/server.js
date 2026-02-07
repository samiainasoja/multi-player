/**
 * Multi-Player Tag Game - Backend
 * Express + Socket.io, room-based real-time arena tag.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./managers/RoomManager');
const { GameManager } = require('./managers/GameManager');
const { Game } = require('./game/Game');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);

// Socket.io with CORS for deployment (frontend may be on different origin)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 2000,
  pingTimeout: 5000
});

// Static files for frontend (partner will add files to public/)
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const roomManager = new RoomManager();
const gameManager = new GameManager(io, roomManager);

// --- Socket connection & events ---

io.on('connection', (socket) => {
  socket.on('join-room', (payload, callback) => {
    const { playerName, roomCode } = payload || {};
    const sid = socket.id;

    // Join existing room with code
    if (roomCode) {
      const result = roomManager.joinRoom(sid, playerName, roomCode);
      if (result.error) {
        const msg = {
          invalid_room_code: 'Invalid room code.',
          room_not_found: 'Room not found.',
          room_full: 'Room is full (max 4 players).',
          invalid_name: 'Please enter a name.',
          duplicate_name: 'Someone in this room already has that name.'
        }[result.error] || result.error;
        return callback ? callback({ error: result.error, message: msg }) : null;
      }
      const { game, player } = result;
      socket.join(game.roomId);
      gameManager.attachGame(game);
      socket.emit('room-joined', {
        roomCode: game.roomId,
        playerId: sid,
        isHost: player.isHost,
        arenaSize: game.arenaSize,
        players: game.getPlayersList(),
        orbs: game.getOrbsList(),
        state: game.state
      });
      gameManager.broadcastRoomUpdate(game);
      return callback ? callback(null, { roomCode: game.roomId, isHost: player.isHost }) : null;
    }

    // Create new room (host)
    const created = roomManager.createRoom(sid, playerName || 'Host');
    if (!created) {
      return callback ? callback({ error: 'create_failed', message: 'Could not create room.' }) : null;
    }
    const { roomCode: newRoomCode, game: newGame } = created;
    socket.join(newRoomCode);
    gameManager.attachGame(newGame);
    socket.emit('room-joined', {
      roomCode: newRoomCode,
      playerId: sid,
      isHost: true,
      arenaSize: newGame.arenaSize,
      players: newGame.getPlayersList(),
      orbs: newGame.getOrbsList(),
      state: newGame.state
    });
    callback ? callback(null, { roomCode: newRoomCode, isHost: true }) : null;
  });

  socket.on('player-move', (payload) => {
    const { x, y } = payload || {};
    const game = roomManager.getGameForSocket(socket.id);
    if (!game) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const nx = typeof x === 'number' ? x : 0;
    const ny = typeof y === 'number' ? y : 0;
    player.setVelocity(nx, ny);
  });

  socket.on('game-action', (payload) => {
    const { action } = payload || {};
    const game = roomManager.getGameForSocket(socket.id);
    if (!game) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;

    switch (action) {
      case 'start':
        if (!player.isHost) return;
        if (game.start()) gameManager.broadcastRoomUpdate(game);
        break;
      case 'pause':
        if (game.pause()) gameManager.broadcastGameState(game, 'paused', socket.id);
        break;
      case 'resume':
        if (game.resume()) gameManager.broadcastGameState(game, 'playing', socket.id);
        break;
      case 'quit':
        if (!player.isHost) return;
        game.quit();
        gameManager.broadcastGameState(game, 'ended', socket.id);
        break;
      default:
        break;
    }
  });

  socket.on('leave-game', () => {
    const game = roomManager.getGameForSocket(socket.id);
    if (!game) return;
    const player = game.getPlayer(socket.id);
    const left = roomManager.leaveRoom(socket.id);
    if (!left) return;
    socket.leave(game.roomId);
    socket.emit('left-room');
    if (player) {
      socket.to(game.roomId).emit('system-message', {
        message: `${player.name} left the match.`
      });
    }
    socket.to(game.roomId).emit('room-update', {
      players: game.getPlayersList(),
      orbs: game.getOrbsList(),
      state: game.state,
      leftPlayerId: socket.id,
      newHostId: left.newHostId
    });
    if (game.getPlayerCount() < 2 && game.state === 'playing') {
      game.quit();
    }
  });

  socket.on('chat-message', (payload) => {
    const { message } = payload || {};
    const game = roomManager.getGameForSocket(socket.id);
    if (!game) return;
    const player = game.getPlayer(socket.id);
    if (!player || !message || typeof message !== 'string') return;
    const text = String(message).slice(0, 200).trim();
    if (!text) return;
    io.to(game.roomId).emit('chat-message', { playerName: player.name, message: text });
  });

  socket.on('disconnect', (reason) => {
    const left = roomManager.leaveRoom(socket.id);
    if (!left) return;
    const { game, wasHost } = left;
    socket.to(game.roomId).emit('room-update', {
      players: game.getPlayersList(),
      state: game.state,
      leftPlayerId: socket.id,
      newHostId: left.newHostId
    });
    if (game.getPlayerCount() < 2 && game.state === 'playing') {
      game.quit();
    }
  });
});

// --- Start server ---

server.listen(PORT, () => {
  console.log(`Multi-Player Tag backend running on port ${PORT}`);
  console.log(`Static files from: ${PUBLIC_DIR}`);
});
