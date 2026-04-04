# President

Multiplayer President card game with a Node.js and Socket.IO backend plus a vanilla JavaScript frontend.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

You can also run the entrypoint directly:

```bash
node server.js
```

Open the app at http://localhost:8080 unless you set a custom `PORT`.

## Running On A Custom Port

PowerShell:

```powershell
$env:PORT=8080
npm start
```

If startup fails with `EADDRINUSE`, another process is already using that port. Pick a different `PORT` value or stop the process that owns the port.

## Scripts

```bash
npm start
npm test
```

## Project Structure

- `server.js`: Express and Socket.IO server
- `GameRoom.js`: core room and round state management
- `Validator.js`: play validation and special-card rules
- `RankSystem.js`: card ranking and sorting
- `CPUAI.js`: CPU turn decisions
- `public/index.html`: served HTML shell
- `public/game.js`: served client logic
- `test.js`: smoke and game-rule tests

## Gameplay Rules

- Red 3s are the lowest cards.
- Black 3s beat 2s and can bomb most sets.
- 2s can bomb shorter plays based on how many 2s are played.
- Jack of Diamonds beats every other play.

## Notes For Development

- The server validates that `public/index.html` and `public/game.js` are complete before it starts.
- Static assets are served from `public/`.
- Tests include smoke coverage for the served frontend files so placeholder files do not silently ship again.
