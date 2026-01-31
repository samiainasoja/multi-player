# Multi-Player Tag — Backend

Node.js + Express + Socket.io backend for a real-time arena tag game (2–4 players, 5-minute rounds).

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
│   ├── Game.js         # Room state, 60 FPS loop, timer
│   ├── Player.js       # Player state, movement, scoring
│   └── Collision.js    # Distance-based tag detection
├── managers/
│   ├── RoomManager.js  # Room codes, create/join, max 4 players
│   └── GameManager.js  # Game loop → Socket.io broadcasts
└── public/             # Static frontend (partner adds files)
```

## Socket.io Events

**Client → Server**

| Event          | Payload                         | Notes                    |
|----------------|----------------------------------|--------------------------|
| `join-room`    | `{ playerName, roomCode? }`      | No code = create (host)  |
| `player-move`  | `{ x, y }`                       | Normalized direction -1..1 |
| `game-action`  | `{ action: 'start'\|'pause'\|'resume'\|'quit' }` | Host only |
| `chat-message` | `{ message }`                    | Broadcast to room        |

**Server → Client**

| Event          | Payload / purpose                          |
|----------------|--------------------------------------------|
| `room-joined`  | `{ roomCode, playerId, isHost, arenaSize, players?, state? }` |
| `room-update`  | `{ players, state, leftPlayerId?, newHostId? }` |
| `game-update`  | `{ players, timer, state }`                |
| `tag-event`    | `{ taggerId, taggedId, taggerName, taggedName, scores }` |
| `game-state`   | `{ state, actionBy }`                      |
| `game-ended`   | `{ winner, finalScores }`                  |
| `chat-message` | `{ playerName, message }`                  |

## Game Rules

- Arena: 800×600 px. Player radius: 25 px.
- Tag = distance &lt; 50 px; 1 s cooldown per tagger.
- 5-minute countdown; highest score wins.

## Environment

| Variable     | Default | Description        |
|-------------|---------|--------------------|
| `PORT`      | `3000`  | Server port        |
| `CORS_ORIGIN` | `*`   | Allowed Socket.io origin |

## Deployment

Set `PORT` (and optionally `CORS_ORIGIN`) and run `npm start`. Works on Render, Railway, etc.
