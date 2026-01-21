// President Game Client v1.6.175 - Fixed 2s bombing
const socket = io();

let roomCode = null;
let myHand = [];
let selectedIndices = [];
let swapMode = false;
let swapData = null;

// Options Button
document.getElementById('optionsBtn').addEventListener('click', () => {
  document.getElementById('optionsModal').classList.add('active');
});

function closeOptions() {
  document.getElementById('optionsModal').classList.remove('active');
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
});

socket.on('game-started', () => {
  document.getElementById('startBtn').style.display = 'none';
  log('🎮 Game started!');
});

socket.on('game-state-update', (state) => {
  // Update turn display
  const turnDiv = document.getElementById('turn');
  if (state.currentPlayerName) {
    turnDiv.textContent = state.currentPlayerName + "'s turn";
  } else {
    turnDiv.textContent = 'Waiting...';
  }

  // Update players
  renderPlayers(state.players, state.currentPlayerId);

  // Update table (last play)
  renderTable(state.lastPlay);

  // Update my hand
  const me = state.players.find(p => p.id === socket.id);
  if (me && me.hand) {
    myHand = me.hand;
    renderHand();
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
    playersDiv.innerHTML = '';
    return;
  }

  playersDiv.innerHTML = players.map(p => {
    const isActive = p.id === currentId;
    const cpuIcon = p.isCPU ? ' 🤖' : '';
    const finishedIcon = p.finished ? ' ✓' : '';
    return `
      <div class="player ${isActive ? 'active-turn' : ''}">
        <div>${p.name}${cpuIcon}</div>
        <div style="font-size: 0.8em;">${p.handSize} cards${finishedIcon}</div>
      </div>
    `;
  }).join('');
}

function renderTable(lastPlay) {
  const tableDiv = document.getElementById('table');

  if (!lastPlay || !lastPlay.cards || lastPlay.cards.length === 0) {
    tableDiv.innerHTML = 'Table (empty)';
    return;
  }

  tableDiv.innerHTML = lastPlay.cards.map(card => {
    const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
    return `<div class="card ${color}">${cardText(card)}</div>`;
  }).join('');
}

function renderHand() {
  const wrapper = document.getElementById('cards-wrapper');
  const title = document.getElementById('hand-title');

  title.textContent = 'Your Hand (' + myHand.length + ')';

  if (myHand.length === 0) {
    wrapper.innerHTML = '<div style="color: #888;">No cards</div>';
    return;
  }

  wrapper.innerHTML = myHand.map((card, index) => {
    const color = (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
    const selected = selectedIndices.includes(index) ? 'selected' : '';
    return `
      <div class="card-item ${color} ${selected}" onclick="toggleCard(${index})">
        ${cardText(card)}
      </div>
    `;
  }).join('');
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
