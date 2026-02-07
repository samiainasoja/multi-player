# Flux Tag Arena

A real-time multiplayer tag game built with Node.js, Express, and Socket.io.

## Overview

Flux Tag Arena is a browser-based multiplayer arena game where players compete in fast-paced rounds of tag. One player starts as "it" and must tag others while being chased by teammates. Players earn points by collecting orbs scattered across the arena.

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
- **Frontend**: Vanilla JavaScript, HTML5 Canvas
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
│   ├── public/               # Static files (served from backend)
│   ├── server.js            # Express & Socket.io setup
│   └── package.json
├── public/                   # Frontend assets (symlink or copy)
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
   - Avoid being tagged by the player who is "it"
   - Collect orbs for points
   - Last player standing or highest score wins
4. **Scoring**: Collect orbs worth 1, 3, 5, or 10 points

## Game Constants

- **Arena Size**: 1200×720 pixels
- **Match Duration**: 5 minutes
- **Max Players**: 4 per room
- **Server Tick Rate**: 60 FPS
- **Player Speed**: 4 pixels/tick
- **Tag Cooldown**: 1 second

## Development

For debugging and development, the server logs connection events and game state changes to the console.

## License

MIT
