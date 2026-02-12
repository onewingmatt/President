# President Card Game - Agent Development Guide

This is a multiplayer President card game built with Node.js/Express backend and vanilla JavaScript frontend. The game supports real-time gameplay via Socket.IO with both human and CPU players.

## Development Commands

### Running the Application
```bash
# Start the development server
npm start

# Run with custom port
PORT=3000 npm start
```

### Testing
```bash
# Run comprehensive test suite
node test.js

# Run tests for specific modules (edit test.js as needed)
node -e "
import { RankSystem } from './RankSystem.js';
import { Validator } from './Validator.js';
import { Card } from './Card.js';

// Example: Test specific card ranking
const black3 = new Card('3', 'C');
console.log('Black 3 rank:', RankSystem.rankValue(black3));
"
```

### Build & Deployment
- No build step required - this is a vanilla JavaScript application
- Static files served directly from the root directory
- Ready for deployment to any Node.js hosting service

## Code Style Guidelines

### Import Style
- Use ES6 import/export syntax consistently
- Import external modules first, then local modules
- Use named exports for modules (export class MyClass)
- Import with destructuring: `import { Class } from './module.js'`

### File Naming & Structure
- Use PascalCase for class files: `GameRoom.js`, `Card.js`
- Use camelCase for utility files: `server.js`, `game.js`
- Keep one main class/export per file
- All files use `.js` extension (ES modules)

### Class & Variable Naming
- Classes: PascalCase (`GameRoom`, `Card`, `RankSystem`)
- Functions/Methods: camelCase (`addPlayer`, `validatePlay`)
- Constants: UPPER_SNAKE_CASE (`MAX_PLAYERS`, `DEFAULT_TIMEOUT`)
- Variables: camelCase with descriptive names (`roomCode`, `currentPlayerIndex`)

### Error Handling
- Use try-catch blocks around all socket event handlers
- Return structured error objects: `{ success: false, error: "message" }`
- Log errors with context: `console.error('Create error:', err)`
- Validate user input before processing

### Code Organization
```javascript
// Import external dependencies
import express from 'express';

// Import local modules
import { GameRoom } from './GameRoom.js';
import { Validator } from './Validator.js';

// Class definition
export class MyClass {
  constructor() {
    // Initialize properties
  }

  // Public methods first
  publicMethod() {}

  // Private methods last (indicated by comments)
  _privateMethod() {}
}
```

### Socket.IO Event Patterns
```javascript
// Client -> Server events: kebab-case
socket.emit('create-game', data);
socket.emit('join-game', data);
socket.emit('play-cards', data);

// Server -> Client events: kebab-case
socket.emit('game-created', data);
socket.emit('game-state-update', state);
socket.emit('invalid-play', data);
```

### State Management
- Game state is centralized in `GameRoom.gameState`
- Use immutable patterns when updating state
- Emit state updates to all relevant players
- Keep public state separate from private data

### Card & Game Logic
- Cards use rank ('A', '2', '3'...) and suit ('H', 'D', 'C', 'S')
- Special cards: Red 3s (rank 0), Black 3s (rank 14), 2s (rank 13), J♦ (rank 15)
- Black 3s can bomb any play except J♦
- J♦ beats everything
- Use `Validator` class for all game rule validation

### Frontend Patterns
- Use vanilla JavaScript with DOM manipulation
- CSS custom properties for theming via `:root`
- Event listeners with named functions, not anonymous
- Template literals for HTML generation
- Consistent error logging with `log()` function

### Testing Patterns
- Use the custom test framework in `test.js`
- Test both success and failure cases
- Include descriptive test names
- Use `assert()` for validations
- Group related tests with console headers

### Security Considerations
- Validate all user input
- Sanitize room codes (uppercase, trim)
- Don't expose internal game state to clients
- Rate limit socket events if needed
- No sensitive data in client-side code

### Performance Guidelines
- Minimize socket emissions
- Use efficient card comparison via rank system
- Limit game log entries (max 100)
- CPU AI delays should be reasonable (800ms)
- Debounce UI updates where applicable

## Key Modules Overview

- `server.js` - Express server, Socket.IO handlers
- `GameRoom.js` - Main game logic and state management
- `GameRules.js` - Game configuration and rule defaults
- `Card.js` - Card class with basic properties
- `Deck.js` - Card deck creation and shuffling
- `Validator.js` - Game rule validation and play checking
- `RankSystem.js` - Card ranking and comparison logic
- `CPUAI.js` - Computer player decision making
- `game.js` - Frontend game client
- `test.js` - Comprehensive test suite

## Game Flow
1. Players create/join rooms with 6-character codes
2. Game starts when host clicks "Start Game"
3. Players take turns playing cards or passing
4. Special rules: Black 3s bomb plays, J♦ is unbeatable
5. Game ends when all but one player finish
6. Role exchange happens between rounds

Remember to run tests after any changes to game logic, and always validate user input before processing.