# Flux Arena

A real-time multiplayer arena game built with Node.js, Express, and Socket.io.

## Overview

Flux Arena is a browser-based multiplayer arena game where 2-4 players compete in real-time to collect orbs scattered across the arena. Collect blue orbs for points, avoid red obstacles that subtract points, and chase the rare golden orb worth 50 points. The player with the highest score when the timer runs out wins.

## Features

- **Real-time Multiplayer**: Up to 4 players per room using Socket.io
- **Server-Authoritative**: All game logic runs on the server for fair play
- **Smooth Rendering**: Client-side interpolation with RAF render loop for fluid visuals
- **Room System**: Create or join games with simple room codes
- **Responsive Design**: Works on desktop and mobile devices
- **Touch Controls**: Virtual stick and dash button for mobile players
- **Leaderboard**: Live score tracking and player stats

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Game Loop**: 60 FPS server tick + client-side interpolation

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm

### Installation

```bash
# Install dependencies
cd backend
npm install
```

### Running the Server

```bash
cd backend
npm start
# or
node server.js
```

The server will start on `http://localhost:3000`

## Project Structure

```
├── backend/
│   ├── game/                 # Game logic
│   │   ├── Game.js          # Arena instance & game state
│   │   ├── Player.js        # Player entity
│   │   └── Collision.js     # Collision detection
│   ├── managers/             # Room & game management
│   │   ├── RoomManager.js   # Room creation & joining
│   │   └── GameManager.js   # Game loop & broadcasting
│   ├── server.js            # Express & Socket.io setup
│   └── package.json
├── public/                   # Frontend assets (served by Express)
│   ├── index.html
│   ├── scripts/
│   │   └── main.js          # Client logic & rendering
│   └── styles/
│       └── main.css
└── README.md
```

## How to Play

1. **Join a Room**: Enter your name and create a new room or join an existing one with a code
2. **Wait for Match**: The host can start the game once players are ready
3. **Gameplay**: 
   - Move with WASD or Arrow keys
   - Dash with Shift
   - Collect blue orbs for points (+1, +3, +5, +10)
   - Avoid red obstacles (-3, -5, -8)
   - Chase the rare golden orb for +50 points
   - Highest score when the timer runs out wins
4. **Scoring**: Blue orbs give points, red obstacles subtract points, golden orbs are rare and worth 50 points

## Game Constants

- **Arena Size**: 1200×720 pixels
- **Match Duration**: 2 minutes
- **Max Players**: 4 per room
- **Min Players**: 2 per room
- **Server Tick Rate**: 60 FPS
- **Player Speed**: 4 pixels/tick
- **Dash Speed**: 6.2 pixels/tick (1.55x multiplier)

## Development

For debugging and development, the server logs connection events and game state changes to the console.

## License

MIT
