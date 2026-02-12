// President Game Client v1.6.179 - Fixed CPU turn race condition
const socket = io();

let roomCode = null;
let myHand = [];
let selectedIndices = [];
let swapMode = false;
let swapData = null;

// State tracking for DOM optimization
let lastRenderedState = {
  currentPlayerName: null,
  currentPlayerId: null,
  lastPlay: null,
  players: null,
  handLength: 0
};

// Options Button
document.getElementById('optionsBtn').addEventListener('click', () => {
  document.getElementById('optionsModal').classList.add('active');
});

function closeOptions() {
  document.getElementById('optionsModal').classList.remove('active');
}

// Creation Bar Toggle
let creationBarExpanded = true;
const toggleBtn = document.getElementById('toggleCreationBar');
const setupBar = document.querySelector('.setup');

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    creationBarExpanded = !creationBarExpanded;
    const container = document.querySelector('.container');
    let setupBar = document.querySelector('.setup');
    if (creationBarExpanded) {
      // Restore bar if removed
      if (!setupBar) {
        const setupHTML = `
          <div class="setup">
            <input type="text" id="playerName" placeholder="Name" value="Player" style="width: 60px;">
            <select id="numPlayers" style="width: 60px;">
              <option value="2">2P</option>
              <option value="3">3P</option>
              <option value="4" selected>4P</option>
              <option value="5">5P</option>
              <option value="6">6P</option>
              <option value="7">7P</option>
              <option value="8">8P</option>
            </select>
            <select id="numCPU" style="width: 55px;">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
            </select>
            <button onclick="createGame()" style="width: 55px;">CREATE</button>
            <button onclick="createCPUOnlyGame()" style="width: 55px; background: #ff6b6b;">CPU GAME</button>
            <button class="room-btn" id="roomDisplay" style="display:none; width: 65px;" title="Click to copy room link" onclick="copyRoomURL()">📋</button>
            <input type="text" id="joinCode" placeholder="Code" value="" style="width: 160px;">
            <button onclick="joinGame()" style="width: 45px;">JOIN</button>
            <button onclick="startGame()" id="startBtn" style="display:none; width: 50px;">▶️</button>
          </div>
        `;
        container.insertAdjacentHTML('afterbegin', setupHTML);
      }
      toggleBtn.textContent = '☰ Create/Join';
    } else {
      // Remove bar from DOM
      if (setupBar) setupBar.remove();
      toggleBtn.textContent = '☰ Show';
    }
  });
}

// Settings Sliders - Update CSS variables
const sliders = {
  handSize: { var: '--hand-size', suffix: 'x' },
  tableSize: { var: '--table-size', suffix: 'x' },
  playersSize: { var: '--players-size', suffix: 'x' },
  logSize: { var: '--log-size', suffix: 'x' },
  buttonSize: { var: '--button-size', suffix: 'x' },
  cardRadius: { var: '--card-radius', suffix: 'px' },
  tableFlex: { var: '--table-flex', suffix: '' },
  handFlex: { var: '--hand-flex', suffix: '' },
  logFlex: { var: '--log-flex', suffix: '' }
};

Object.keys(sliders).forEach(id => {
  const input = document.getElementById(id);
  const valueSpan = document.getElementById(id + 'Val');
  const config = sliders[id];

  if (input && valueSpan) {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      valueSpan.textContent = val + config.suffix;
      document.documentElement.style.setProperty(config.var, val);
    });
  }
});

// Sound volume slider
const soundVolumeInput = document.getElementById('soundVolume');
const soundVolumeVal = document.getElementById('soundVolumeVal');
if (soundVolumeInput && soundVolumeVal) {
  soundVolumeInput.addEventListener('input', (e) => {
    soundVolumeVal.textContent = e.target.value + '%';
  });
}

// CPU speed slider
const cpuSpeedInput = document.getElementById('cpuSpeed');
const cpuSpeedVal = document.getElementById('cpuSpeedVal');
if (cpuSpeedInput && cpuSpeedVal) {
  cpuSpeedInput.addEventListener('input', (e) => {
    cpuSpeedVal.textContent = e.target.value + 'x';
  });
}

// Toggle switches
const toggles = ['soundToggle', 'turnNotificationToggle', 'stickyButtonsToggle', 'autoScaleToggle', 'autoCardSizeToggle'];
toggles.forEach(id => {
  const toggle = document.getElementById(id);
  if (toggle) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');

      // Sticky buttons implementation
      if (id === 'stickyButtonsToggle') {
        const controls = document.getElementById('controls');
        if (toggle.classList.contains('active')) {
          controls.classList.add('sticky');
        } else {
          controls.classList.remove('sticky');
        }
      }
    });
  }
});

// Create Game
function createGame() {
  const name = document.getElementById('playerName').value.trim();
  const numPlayers = parseInt(document.getElementById('numPlayers').value);
  const numCPU = parseInt(document.getElementById('numCPU').value);

  if (!name) {
    log('⚠️ Please enter your name', 'warning');
    return;
  }

  if (numCPU >= numPlayers) {
    log('❌ CPUs must be less than total players', 'error');
    return;
  }

  socket.emit('create-game', {
    playerName: name,
    options: {
      num_players: numPlayers,
      numCPU: numCPU
    }
  });

  log('Creating game...');
}

// Watch CPU Game
function createCPUOnlyGame() {
  const name = document.getElementById('playerName').value.trim() || 'Spectator';
  const numPlayers = parseInt(document.getElementById('numPlayers').value);

  if (numPlayers < 2 || numPlayers > 8) {
    log('⚠️ Players must be between 2-8', 'warning');
    return;
  }

  socket.emit('create-cpu-game', {
    spectatorName: name,
    options: {
      num_players: numPlayers
    }
  });

  log('Creating CPU-only game...');
}

// Join Game
function joinGame() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();

  if (!name || !code) {
    log('⚠️ Enter name and room code', 'warning');
    return;
  }

  socket.emit('join-game', {
    playerName: name,
    roomCode: code
  });

  log('Joining room ' + code + '...');
}

// Start Game
function startGame() {
  if (roomCode) {
    socket.emit('start-game', { roomCode });
    log('Starting game...');
  }
}

// Play Cards
function playCards() {
  if (selectedIndices.length === 0) {
    log('⚠️ No cards selected', 'warning');
    return;
  }

  socket.emit('play-cards', {
    roomCode,
    cardIndices: selectedIndices
  });

  selectedIndices = [];
}

// Clear Selection
function clearSelection() {
  selectedIndices = [];
  renderHand();
}

// Pass Turn
function passTurn() {
  socket.emit('pass-turn', { roomCode });
  selectedIndices = [];
}

// Copy Room URL
function copyRoomURL() {
  if (roomCode) {
    const url = window.location.href.split('?')[0] + '?room=' + roomCode;
    navigator.clipboard.writeText(url).then(() => {
      log('📋 Room link copied!');
    });
  }
}

// Socket Events
socket.on('game-created', (data) => {
  roomCode = data.roomCode;
  document.getElementById('joinCode').value = data.roomCode;
  document.getElementById('roomDisplay').textContent = data.roomCode;
  document.getElementById('roomDisplay').style.display = 'inline-block';
  document.getElementById('startBtn').style.display = 'inline-block';
  log('✅ Room created: ' + data.roomCode);
  
  // Auto-collapse creation bar after game creation
  if (toggleBtn && setupBar) {
    creationBarExpanded = false;
    setupBar.classList.add('collapsed');
    toggleBtn.textContent = '☰ Show';
  }
});

socket.on('cpu-game-created', (data) => {
  roomCode = data.roomCode;
  document.getElementById('joinCode').value = data.roomCode;
  document.getElementById('roomDisplay').textContent = data.roomCode;
  document.getElementById('roomDisplay').style.display = 'inline-block';
  log('🤖 CPU game created: ' + data.roomCode);
  
  // Auto-collapse creation bar after game creation
  if (toggleBtn && setupBar) {
    creationBarExpanded = false;
    setupBar.classList.add('collapsed');
    toggleBtn.textContent = '☰ Show';
  }
});

socket.on('game-started', () => {
  document.getElementById('startBtn').style.display = 'none';
  log('🎮 Game started!');
});

socket.on('game-state-update', (state) => {
  // Update turn display only if it changed
  if (state.currentPlayerName !== lastRenderedState.currentPlayerName) {
    const turnDiv = document.getElementById('turn');
    turnDiv.textContent = state.currentPlayerName ? 
      state.currentPlayerName + "'s turn" : 'Waiting...';
    lastRenderedState.currentPlayerName = state.currentPlayerName;
  }

  // Update players only if they changed
  if (JSON.stringify(state.players) !== JSON.stringify(lastRenderedState.players) ||
      state.currentPlayerId !== lastRenderedState.currentPlayerId) {
    if (state.isSpectator) {
      renderSpectatorView(state);
    } else {
      renderPlayers(state.players, state.currentPlayerId);
    }
    lastRenderedState.players = JSON.parse(JSON.stringify(state.players));
    lastRenderedState.currentPlayerId = state.currentPlayerId;
  }

  // Update table only if last play changed
  if (JSON.stringify(state.lastPlay) !== JSON.stringify(lastRenderedState.lastPlay)) {
    renderTable(state.lastPlay);
    lastRenderedState.lastPlay = JSON.parse(JSON.stringify(state.lastPlay));
  }

  // Update my hand only if it changed
  if (state && state.players && Array.isArray(state.players)) {
    const me = state.players.find(p => p && p.id === socket.id);
    if (me && me.hand && Array.isArray(me.hand)) {
      const newHandLength = me.hand.length;
      if (newHandLength !== lastRenderedState.handLength || 
          JSON.stringify(me.hand) !== JSON.stringify(myHand)) {
        myHand = me.hand;
        renderHand();
        lastRenderedState.handLength = newHandLength;
      }
    }
  }
});

socket.on('swap-required', (swap) => {
  swapMode = true;
  swapData = swap;
  selectedIndices = [];

  document.getElementById('swapRole').textContent = swap.role;
  document.getElementById('swapInstruction').textContent = 
    'Select ' + swap.count + ' card(s) to give away';
  document.getElementById('swapSelected').textContent = 
    'Selected: 0/' + swap.count;

  renderSwapCards();
  document.getElementById('swapScreen').classList.add('active');

  log('🎭 Card exchange: Select ' + swap.count + ' cards');
});

socket.on('error', (data) => {
  log('❌ ' + data.message, 'error');
});

socket.on('invalid-play', (data) => {
  log('❌ Invalid: ' + data.reason, 'error');
  selectedIndices = [];
  renderHand();
});

socket.on('reconnected', () => {
  log('🔄 Reconnected to game');
});

// Render Functions
function renderPlayers(players, currentId) {
  const playersDiv = document.getElementById('players');
  if (!players || players.length === 0) {
    if (playersDiv) {
      playersDiv.innerHTML = '';
    }
    return;
  }

  const newHTML = players.filter(p => p && p.id).map(p => {
    const isActive = p.id === currentId;
    const cpuIcon = p.isCPU ? ' 🤖' : '';
    const finishedIcon = p.finished ? ' ✓' : '';
    const playerName = p.name || 'Unknown Player';
    const handSize = typeof p.handSize === 'number' ? p.handSize : 0;
    return `
      <div class="player ${isActive ? 'active-turn' : ''}">
        <div>${playerName}${cpuIcon}</div>
        <div style="font-size: 0.8em;">${handSize} cards${finishedIcon}</div>
      </div>
    `;
  }).join('');

  if (playersDiv && playersDiv.innerHTML !== newHTML) {
    playersDiv.innerHTML = newHTML;
  }
}

function renderSpectatorView(state) {
  const playersDiv = document.getElementById('players');
  if (!state.players || state.players.length === 0) {
    if (playersDiv) {
      playersDiv.innerHTML = '';
    }
    return;
  }

  const newHTML = state.players.filter(p => p && p.id).map(p => {
    const isActive = p.id === state.currentPlayerId;
    const cpuIcon = p.isCPU ? ' 🤖' : '';
    const finishedIcon = p.finished ? ' ✓' : '';
    const playerName = p.name || 'Unknown Player';
    const handSize = p.hand ? p.hand.length : 0;
    
    // Show cards for spectator view
    const handDisplay = p.hand && p.hand.length > 0 ? 
      p.hand.map(card => {
        const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
        return `<div class="mini-card ${color}">${cardText(card)}</div>`;
      }).join('') : '';

    return `
      <div class="player ${isActive ? 'active-turn' : ''} spectator-player">
        <div>${playerName}${cpuIcon}${finishedIcon}</div>
        <div style="font-size: 0.7em; margin: 2px 0;">${handSize} cards</div>
        <div class="mini-hand">${handDisplay}</div>
      </div>
    `;
  }).join('');

  if (playersDiv && playersDiv.innerHTML !== newHTML) {
    playersDiv.innerHTML = newHTML;
  }
}

function renderTable(lastPlay) {
  const tableDiv = document.getElementById('table');
  if (!tableDiv) return;

  if (!lastPlay || !lastPlay.cards || !Array.isArray(lastPlay.cards) || lastPlay.cards.length === 0) {
    if (tableDiv.textContent !== 'Table (empty)') {
      tableDiv.textContent = 'Table (empty)';
    }
    return;
  }

  const newHTML = lastPlay.cards.filter(card => card && card.rank && card.suit).map(card => {
    const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
    return `<div class="card ${color}">${cardText(card)}</div>`;
  }).join('');

  if (tableDiv.innerHTML !== newHTML) {
    tableDiv.innerHTML = newHTML;
  }
}

function renderHand() {
  const wrapper = document.getElementById('cards-wrapper');
  const title = document.getElementById('hand-title');
  
  if (!wrapper || !title) return;

  const titleText = 'Your Hand (' + (myHand ? myHand.length : 0) + ')';
  if (title.textContent !== titleText) {
    title.textContent = titleText;
  }

  if (!myHand || myHand.length === 0) {
    if (wrapper.innerHTML !== '<div style="color: #888;">No cards</div>') {
      wrapper.innerHTML = '<div style="color: #888;">No cards</div>';
    }
    return;
  }

  const newHTML = myHand.filter(card => card && card.rank && card.suit).map((card, index) => {
    const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
    const selected = selectedIndices.includes(index) ? 'selected' : '';
    return `
      <div class="card-item ${color} ${selected}" onclick="toggleCard(${index})">
        ${cardText(card)}
      </div>
    `;
  }).join('');

  if (wrapper.innerHTML !== newHTML) {
    wrapper.innerHTML = newHTML;
  }
}

function renderSwapCards() {
  const swapCardsDiv = document.getElementById('swapCards');

  swapCardsDiv.innerHTML = myHand.map((card, index) => {
    const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
    const selected = selectedIndices.includes(index) ? 'selected' : '';
    return `
      <div class="swap-card ${color} ${selected}" onclick="toggleSwapCard(${index})">
        ${cardText(card)}
      </div>
    `;
  }).join('');

  document.getElementById('swapSelected').textContent = 
    'Selected: ' + selectedIndices.length + '/' + swapData.count;

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = selectedIndices.length !== swapData.count;
}

// Toggle Card Selection
function toggleCard(index) {
  if (!myHand || index < 0 || index >= myHand.length) return;
  
  const idx = selectedIndices.indexOf(index);
  if (idx === -1) {
    selectedIndices.push(index);
  } else {
    selectedIndices.splice(idx, 1);
  }
  renderHand();
}

function toggleSwapCard(index) {
  const idx = selectedIndices.indexOf(index);
  if (idx === -1) {
    if (selectedIndices.length < swapData.count) {
      selectedIndices.push(index);
    }
  } else {
    selectedIndices.splice(idx, 1);
  }
  renderSwapCards();
}

// Submit Card Exchange
function submitCardExchange() {
  if (selectedIndices.length === swapData.count) {
    socket.emit('submit-swap', {
      roomCode,
      cardIndices: selectedIndices
    });

    document.getElementById('swapScreen').classList.remove('active');
    selectedIndices = [];
    swapMode = false;
    log('✅ Cards submitted for exchange');
  }
}

// Helper Functions
function cardText(card) {
  if (!card || !card.rank || !card.suit) return '??';
  const suits = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
  return card.rank + (suits[card.suit] || card.suit);
}

function log(msg, type = '') {
  const logDiv = document.getElementById('log');
  const line = document.createElement('div');
  line.className = 'log-line' + (type ? ' ' + type : '');
  const time = new Date().toLocaleTimeString();
  line.textContent = '[' + time + '] ' + msg;
  logDiv.appendChild(line);
  logDiv.scrollTop = logDiv.scrollHeight;
}

// Auto-join from URL parameter
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    document.getElementById('joinCode').value = room;
    log('📨 Room code from URL: ' + room);
  }
});

log('🎮 President v1.6.175 loaded');
log('💡 2s bombing FIXED! Pairs of 2s now work!');
