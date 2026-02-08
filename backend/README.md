# Flux Arena — Backend

Node.js + Express + Socket.io backend for a real-time arena game (2-4 players, 2-minute rounds).

## Setup

```bash
cd backend
npm install
npm start
```

Runs on `http://localhost:3000` (or `PORT` from env).

## Structure

```
backend/
├── server.js           # Express + Socket.io, event handlers
├── game/
│   ├── Game.js         # Room state, 60 FPS loop, timer, orb spawning
│   ├── Player.js       # Player state, movement, scoring
│   └── Collision.js    # Distance-based collision detection
├── managers/
│   ├── RoomManager.js  # Room codes, create/join, max 4 players
│   └── GameManager.js  # Game loop → Socket.io broadcasts
```

## Socket.io Events

**Client → Server**

| Event          | Payload                         | Notes                    |
|----------------|----------------------------------|--------------------------|
| `join-room`    | `{ playerName, roomCode? }`      | No code = create (host)  |
| `player-move`  | `{ x, y, dash }`                | Normalized direction -1..1 |
| `game-action`  | `{ action: 'start'\|'pause'\|'resume'\|'quit' }` | start = host only; pause/quit = any player |
| `leave-game`   | —                                | Player leaves the room   |
| `chat-message` | `{ message }`                    | Broadcast to room        |

**Server → Client**

| Event          | Payload / purpose                          |
|----------------|--------------------------------------------|
| `room-joined`  | `{ roomCode, playerId, isHost, arenaSize, players, orbs, state }` |
| `room-update`  | `{ players, orbs, state, leftPlayerId?, newHostId? }` |
| `game-update`  | `{ players, orbs, timer, state }`          |
| `game-state`   | `{ state, actionBy, pausedBy? }`           |
| `game-ended`   | `{ winner, finalScores }`                  |
| `system-message` | `{ message }`                            |
| `chat-message` | `{ playerName, message }`                  |

## Game Rules

- Arena: 1200x720 px. Player radius: 25 px.
- Collect blue orbs (+1, +3, +5, +10), avoid red obstacles (-3, -5, -8), chase golden orbs (+50).
- 2-minute countdown; highest score wins.
- Orbs spawn every 4 seconds (4 point orbs, 2 obstacles, 20% chance of golden orb).

## Environment

| Variable     | Default | Description        |
|-------------|---------|--------------------|
| `PORT`      | `3000`  | Server port        |
| `CORS_ORIGIN` | `*`   | Allowed Socket.io origin |

## Deployment

Set `PORT` (and optionally `CORS_ORIGIN`) and run `npm start`. Works on Render, Railway, etc. A `render.yaml` blueprint is included in the project root.
