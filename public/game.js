// President Game Client v1.6.179 - Fixed CPU turn race condition
const socket = io();

let roomCode = null;
let viewerId = null;
let myHand = [];
let selectedIndices = [];
let swapMode = false;
let swapData = null;
let currentState = null;
const RECONNECT_TOKEN_PREFIX = 'president.reconnect.';

// State tracking for DOM optimization
let lastRenderedState = {
  currentPlayerName: null,
  currentPlayerId: null,
  lastPlay: null,
  players: null,
  handLength: 0
};

let lastFocusedElement = null;

const optionsButton = document.getElementById('optionsBtn');
const optionsModal = document.getElementById('optionsModal');
const optionsCloseButton = document.getElementById('closeOptionsBtn');

// Options Button
if (optionsButton) {
  optionsButton.addEventListener('click', openOptions);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && optionsModal && optionsModal.classList.contains('active')) {
    closeOptions();
  }
});

function openOptions() {
  if (!optionsModal) {
    return;
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  optionsModal.classList.add('active');

  if (optionsCloseButton) {
    optionsCloseButton.focus();
  }
}

function closeOptions() {
  if (!optionsModal) {
    return;
  }

  optionsModal.classList.remove('active');

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

function reconnectStorageKey(code) {
  return RECONNECT_TOKEN_PREFIX + code;
}

function saveReconnectToken(code, reconnectToken) {
  if (!code || !reconnectToken) {
    return;
  }

  try {
    window.localStorage.setItem(reconnectStorageKey(code), reconnectToken);
  } catch (error) {
    log('⚠️ Could not save reconnect token locally', 'warning');
  }
}

function getReconnectToken(code) {
  if (!code) {
    return '';
  }

  try {
    return window.localStorage.getItem(reconnectStorageKey(code)) || '';
  } catch (error) {
    return '';
  }
}

// Creation Bar Toggle
let creationBarExpanded = true;
const toggleBtn = document.getElementById('toggleCreationBar');
const setupBar = document.querySelector('.setup');
const joinCodeInput = document.getElementById('joinCode');
const roomDisplayButton = document.getElementById('roomDisplay');
const startButton = document.getElementById('startBtn');
const playButton = document.getElementById('playBtn');
const clearButton = document.getElementById('clearBtn');
const passButton = document.getElementById('passBtn');
const containerElement = document.querySelector('.container');
const controlsBar = document.getElementById('controls');

const SETTINGS_STORAGE_KEY = 'president.ui.settings.v1';
let settingsState = null;
let lastViewerTurnState = false;
let audioContextRef = null;
let pendingRoomSettingsSync = false;

const gameplayToggleIds = ['jackOfDiamondsBombToggle', 'tripleSixesBeatJdToggle', 'runsAllowedToggle'];
const gameplaySliderIds = ['minRunLength', 'maxRunLength'];

function setSetupVisibility(isVisible) {
  creationBarExpanded = isVisible;

  if (setupBar) {
    setupBar.classList.toggle('collapsed', !isVisible);
  }

  if (toggleBtn) {
    toggleBtn.textContent = isVisible ? '☰ Create/Join' : '☰ Show';
    toggleBtn.setAttribute('aria-expanded', String(isVisible));
  }
}

function renderTurnStatus(state) {
  const turnDiv = document.getElementById('turn');
  if (!turnDiv || !state) {
    return;
  }

  let statusText = 'Waiting for players';
  if (state.phase === 'waiting') {
    statusText = state.canStart ? 'Ready to start the round' : 'Waiting for players';
  } else if (state.isSpectator && state.currentPlayerName) {
    statusText = 'Spectating: ' + state.currentPlayerName + "'s turn";
  } else if (state.currentPlayerId === viewerId) {
    statusText = 'Your turn';
  } else if (state.currentPlayerName) {
    statusText = state.currentPlayerName + "'s turn";
  } else if (state.phase === 'playing') {
    statusText = 'Round in progress';
  }

  turnDiv.textContent = statusText;
  turnDiv.dataset.phase = state.phase || 'waiting';
  turnDiv.dataset.viewerState = state.currentPlayerId === viewerId ? 'active' : 'idle';
}

function updateActionButtons() {
  if (!playButton || !clearButton || !passButton) {
    return;
  }

  const hasSelection = selectedIndices.length > 0;
  const isPlaying = Boolean(currentState && currentState.phase === 'playing');
  const isViewerTurn = Boolean(isPlaying && !currentState.isSpectator && currentState.currentPlayerId === viewerId);
  const canPass = Boolean(
    isViewerTurn &&
    currentState &&
    currentState.lastPlay &&
    currentState.lastPlay.type !== 'none' &&
    !swapMode
  );

  playButton.disabled = !(isViewerTurn && hasSelection && !swapMode);
  clearButton.disabled = !hasSelection;
  passButton.disabled = !canPass;
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    setSetupVisibility(!creationBarExpanded);
  });

  setSetupVisibility(true);
}

if (optionsModal) {
  optionsModal.addEventListener('click', (event) => {
    if (event.target === optionsModal) {
      closeOptions();
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
  logFlex: { var: '--log-flex', suffix: '' },
  minRunLength: { var: '--min-run-length', suffix: '' },
  maxRunLength: { var: '--max-run-length', suffix: '' }
};

// Sound volume slider
const soundVolumeInput = document.getElementById('soundVolume');
const soundVolumeVal = document.getElementById('soundVolumeVal');

// CPU speed slider
const cpuSpeedInput = document.getElementById('cpuSpeed');
const cpuSpeedVal = document.getElementById('cpuSpeedVal');

const toggleIds = ['soundToggle', 'turnNotificationToggle', 'stickyButtonsToggle', 'jackOfDiamondsBombToggle', 'tripleSixesBeatJdToggle', 'runsAllowedToggle', 'autoScaleToggle', 'autoCardSizeToggle'];

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function createDefaultSettings() {
  const sliderDefaults = {};
  Object.keys(sliders).forEach((id) => {
    const input = document.getElementById(id);
    sliderDefaults[id] = input ? String(input.value) : '0';
  });

  sliderDefaults.soundVolume = soundVolumeInput ? String(soundVolumeInput.value) : '50';
  sliderDefaults.cpuSpeed = cpuSpeedInput ? String(cpuSpeedInput.value) : '1.0';

  const toggleDefaults = {};
  toggleIds.forEach((id) => {
    const toggle = document.getElementById(id);
    toggleDefaults[id] = Boolean(toggle && toggle.classList.contains('active'));
  });

  return {
    sliders: sliderDefaults,
    toggles: toggleDefaults
  };
}

function readStoredSettings() {
  const defaults = createDefaultSettings();

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    return {
      sliders: Object.assign({}, defaults.sliders, parsed && parsed.sliders ? parsed.sliders : {}),
      toggles: Object.assign({}, defaults.toggles, parsed && parsed.toggles ? parsed.toggles : {})
    };
  } catch (error) {
    return defaults;
  }
}

function persistSettings() {
  if (!settingsState) {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsState));
  } catch (error) {
    log('⚠️ Could not save settings locally', 'warning');
  }
}

function formatSliderValue(id, value) {
  if (id === 'soundVolume') {
    return value + '%';
  }

  if (id === 'cpuSpeed') {
    return Number(value).toFixed(1) + 'x';
  }

  const config = sliders[id];
  return config ? value + config.suffix : value;
}

function applyStickyControls() {
  const stickyEnabled = Boolean(settingsState && settingsState.toggles.stickyButtonsToggle);

  if (controlsBar) {
    controlsBar.classList.toggle('sticky', stickyEnabled);
  }

  if (containerElement) {
    containerElement.classList.toggle('has-sticky-controls', stickyEnabled);
  }
}

function canControlGameplaySettings() {
  if (!roomCode) {
    return true;
  }

  if (!currentState || currentState.phase !== 'waiting') {
    return false;
  }

  if (currentState.isHost) {
    return true;
  }

  return Boolean(
    currentState.isSpectator &&
    Array.isArray(currentState.players) &&
    currentState.players.length > 0 &&
    currentState.players.every(player => player && player.isCPU)
  );
}

function getGameplayRulesFromSettings() {
  const minRunLength = Math.round(clampNumber(settingsState?.sliders?.minRunLength, 3, 11, 3));
  const maxRunLength = Math.max(minRunLength, Math.round(clampNumber(settingsState?.sliders?.maxRunLength, 3, 11, 5)));

  return {
    jackOfDiamondsBomb: Boolean(settingsState && settingsState.toggles.jackOfDiamondsBombToggle),
    tripleSixesBeatJd: Boolean(settingsState && settingsState.toggles.tripleSixesBeatJdToggle),
    runsAllowed: Boolean(settingsState && settingsState.toggles.runsAllowedToggle),
    minRunLength: minRunLength,
    maxRunLength: maxRunLength
  };
}

function applyLayoutSettings() {
  if (!settingsState) {
    return;
  }

  const rootStyle = document.documentElement.style;
  const autoScaleEnabled = Boolean(settingsState.toggles.autoScaleToggle);
  const autoCardSizeEnabled = Boolean(settingsState.toggles.autoCardSizeToggle);
  const tableFlexValue = clampNumber(settingsState.sliders.tableFlex, 50, 800, 223);
  const handFlexValue = clampNumber(settingsState.sliders.handFlex, 100, 1000, 480);
  const logFlexValue = clampNumber(settingsState.sliders.logFlex, 40, 400, 99);
  const totalFlex = tableFlexValue + handFlexValue + logFlexValue;

  document.body.dataset.autoScale = autoScaleEnabled ? 'true' : 'false';
  document.body.dataset.autoCardSize = autoCardSizeEnabled ? 'true' : 'false';

  rootStyle.setProperty('--table-track', Math.max(0.8, (tableFlexValue / totalFlex) * 5).toFixed(2) + 'fr');
  rootStyle.setProperty('--hand-track', Math.max(1.2, (handFlexValue / totalFlex) * 5).toFixed(2) + 'fr');
  rootStyle.setProperty('--log-track', Math.max(0.6, (logFlexValue / totalFlex) * 5).toFixed(2) + 'fr');
  rootStyle.setProperty('--log-column-track', Math.max(0.75, logFlexValue / 150).toFixed(2) + 'fr');
}

function canControlCpuSpeed() {
  if (!roomCode || !currentState) {
    return false;
  }

  if (currentState.isHost) {
    return true;
  }

  return Boolean(
    currentState.isSpectator &&
    Array.isArray(currentState.players) &&
    currentState.players.length > 0 &&
    currentState.players.every(player => player && player.isCPU)
  );
}

function updateSettingsAvailability() {
  if (!cpuSpeedInput) {
    return;
  }

  if (!roomCode) {
    cpuSpeedInput.disabled = false;
    cpuSpeedInput.title = '';

    gameplayToggleIds.forEach((id) => {
      const toggle = document.getElementById(id);
      if (toggle) {
        toggle.disabled = false;
        toggle.title = '';
      }
    });

    gameplaySliderIds.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.disabled = false;
        input.title = '';
      }
    });

    return;
  }

  const cpuSpeedAvailable = canControlCpuSpeed();
  cpuSpeedInput.disabled = !cpuSpeedAvailable;
  cpuSpeedInput.title = cpuSpeedAvailable ? '' : 'Only the host can change CPU speed';

  const gameplayAvailable = canControlGameplaySettings();
  const gameplayTitle = gameplayAvailable ? '' : 'Gameplay variants are fixed after the room is created';

  gameplayToggleIds.forEach((id) => {
    const toggle = document.getElementById(id);
    if (!toggle) {
      return;
    }

    toggle.disabled = !gameplayAvailable;
    toggle.title = gameplayTitle;
  });

  gameplaySliderIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) {
      return;
    }

    input.disabled = !gameplayAvailable;
    input.title = gameplayTitle;
  });
}

function syncRoomSettings() {
  if (!roomCode || !settingsState || !canControlCpuSpeed()) {
    return;
  }

  const payload = {
    roomCode,
    cpuSpeed: clampNumber(settingsState.sliders.cpuSpeed, 0.3, 2.0, 1.0),
    gameplayRules: getGameplayRulesFromSettings()
  };

  socket.emit('update-room-settings', {
    ...payload
  });
}

function updateSliderSetting(id, rawValue, options = {}) {
  const persist = options.persist !== false;
  const skipRoomSync = options.skipRoomSync === true;
  let normalizedValue = String(rawValue);

  if (
    (id === 'tableFlex' || id === 'handFlex' || id === 'logFlex') &&
    settingsState &&
    settingsState.toggles.autoScaleToggle === false &&
    options.enableAutoScale !== false
  ) {
    setToggleState('autoScaleToggle', true, { persist: true, preview: false });
  }

  if (id === 'soundVolume') {
    normalizedValue = String(Math.round(clampNumber(rawValue, 0, 100, 50)));
  } else if (id === 'cpuSpeed') {
    normalizedValue = clampNumber(rawValue, 0.3, 2.0, 1.0).toFixed(1);
  } else if (Object.prototype.hasOwnProperty.call(sliders, id)) {
    const input = document.getElementById(id);
    normalizedValue = input ? String(rawValue) : normalizedValue;
  }

  if (Object.prototype.hasOwnProperty.call(sliders, id)) {
    const input = document.getElementById(id);
    const valueSpan = document.getElementById(id + 'Val');
    const config = sliders[id];

    if (input) {
      input.value = normalizedValue;
    }

    if (valueSpan) {
      valueSpan.textContent = formatSliderValue(id, normalizedValue);
    }

    document.documentElement.style.setProperty(config.var, normalizedValue);
  } else if (id === 'soundVolume') {
    if (soundVolumeInput) {
      soundVolumeInput.value = normalizedValue;
    }
    if (soundVolumeVal) {
      soundVolumeVal.textContent = formatSliderValue(id, normalizedValue);
    }
  } else if (id === 'cpuSpeed') {
    if (cpuSpeedInput) {
      cpuSpeedInput.value = normalizedValue;
    }
    if (cpuSpeedVal) {
      cpuSpeedVal.textContent = formatSliderValue(id, normalizedValue);
    }
  }

  settingsState.sliders[id] = normalizedValue;

  if (id === 'tableFlex' || id === 'handFlex' || id === 'logFlex') {
    applyLayoutSettings();
  }

  if (id === 'cpuSpeed' && !skipRoomSync) {
    syncRoomSettings();
  } else if ((id === 'minRunLength' || id === 'maxRunLength') && !skipRoomSync) {
    syncRoomSettings();
  }

  if (persist) {
    persistSettings();
  }
}

function setToggleState(id, isActive, options = {}) {
  const persist = options.persist !== false;
  const skipRoomSync = options.skipRoomSync === true;
  const toggle = document.getElementById(id);
  const active = Boolean(isActive);

  if (!toggle || !settingsState) {
    return;
  }

  toggle.classList.toggle('active', active);
  toggle.setAttribute('aria-pressed', String(active));
  settingsState.toggles[id] = active;

  if (id === 'stickyButtonsToggle') {
    applyStickyControls();
  } else if (id === 'autoScaleToggle' || id === 'autoCardSizeToggle') {
    applyLayoutSettings();
  }

  if (!skipRoomSync && (id === 'jackOfDiamondsBombToggle' || id === 'tripleSixesBeatJdToggle' || id === 'runsAllowedToggle')) {
    syncRoomSettings();
  }

  if (id === 'soundToggle' && active && options.preview !== false) {
    playUISound('success');
  }

  if (persist) {
    persistSettings();
  }
}

function restoreSettingsFromStorage() {
  settingsState = readStoredSettings();

  Object.keys(sliders).forEach((id) => {
    updateSliderSetting(id, settingsState.sliders[id], { persist: false, skipRoomSync: true });
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', (event) => {
        updateSliderSetting(id, event.target.value);
      });
    }
  });

  updateSliderSetting('soundVolume', settingsState.sliders.soundVolume, { persist: false, skipRoomSync: true });
  if (soundVolumeInput) {
    soundVolumeInput.addEventListener('input', (event) => {
      updateSliderSetting('soundVolume', event.target.value);
    });
  }

  updateSliderSetting('cpuSpeed', settingsState.sliders.cpuSpeed, { persist: false, skipRoomSync: true });
  if (cpuSpeedInput) {
    cpuSpeedInput.addEventListener('input', (event) => {
      updateSliderSetting('cpuSpeed', event.target.value);
    });
  }

  toggleIds.forEach((id) => {
    setToggleState(id, settingsState.toggles[id], { persist: false, preview: false });

    const toggle = document.getElementById(id);
    if (toggle) {
      toggle.addEventListener('click', () => {
        setToggleState(id, !toggle.classList.contains('active'));
      });
    }
  });

  applyLayoutSettings();
  applyStickyControls();
  updateSettingsAvailability();
}

function getAudioContext() {
  if (typeof window.AudioContext !== 'function' && typeof window.webkitAudioContext !== 'function') {
    return null;
  }

  if (!audioContextRef) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContextRef = new AudioCtor();
  }

  if (audioContextRef.state === 'suspended') {
    audioContextRef.resume().catch(() => {});
  }

  return audioContextRef;
}

function playUISound(kind) {
  if (!settingsState || !settingsState.toggles.soundToggle) {
    return;
  }

  if (settingsState.toggles.turnNotificationToggle && kind !== 'turn') {
    return;
  }

  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  const volume = clampNumber(settingsState.sliders.soundVolume, 0, 100, 50) / 100;
  const gainNode = audioContext.createGain();
  const oscillator = audioContext.createOscillator();
  const now = audioContext.currentTime;

  const presets = {
    turn: { frequency: 880, duration: 0.14, type: 'sine' },
    success: { frequency: 660, duration: 0.1, type: 'triangle' },
    error: { frequency: 240, duration: 0.18, type: 'square' }
  };
  const preset = presets[kind] || presets.success;

  oscillator.type = preset.type;
  oscillator.frequency.setValueAtTime(preset.frequency, now);
  gainNode.gain.setValueAtTime(Math.max(0.0001, volume * 0.18), now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + preset.duration);
}

restoreSettingsFromStorage();

// Create Game
function createGame() {
  const name = document.getElementById('playerName').value.trim();
  const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
  const numCPU = parseInt(document.getElementById('numCPU').value, 10);

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
      numCPU: numCPU,
      cpuSpeedMultiplier: clampNumber(settingsState?.sliders?.cpuSpeed, 0.3, 2.0, 1.0),
      gameplayRules: getGameplayRulesFromSettings()
    }
  });

  pendingRoomSettingsSync = true;
  log('Creating game...');
}

// Watch CPU Game
function createCPUOnlyGame() {
  const name = document.getElementById('playerName').value.trim() || 'Spectator';
  const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);

  if (numPlayers < 2 || numPlayers > 8) {
    log('⚠️ Players must be between 2-8', 'warning');
    return;
  }

  socket.emit('create-cpu-game', {
    spectatorName: name,
    options: {
      num_players: numPlayers,
      cpuSpeedMultiplier: clampNumber(settingsState?.sliders?.cpuSpeed, 0.3, 2.0, 1.0),
      gameplayRules: getGameplayRulesFromSettings()
    }
  });

  pendingRoomSettingsSync = true;
  log('Creating CPU-only game...');
}

// Join Game
function joinGame() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const reconnectToken = getReconnectToken(code);

  if (!code || (!name && !reconnectToken)) {
    log('⚠️ Enter a room code and player name, or rejoin from the same browser', 'warning');
    return;
  }

  socket.emit('join-game', {
    playerName: name,
    roomCode: code,
    reconnectToken: reconnectToken
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
  updateActionButtons();
}

// Clear Selection
function clearSelection() {
  selectedIndices = [];
  renderHand();
  updateActionButtons();
}

// Pass Turn
function passTurn() {
  socket.emit('pass-turn', { roomCode });
  selectedIndices = [];
  updateActionButtons();
}

// Copy Room URL
function copyRoomURL() {
  if (roomCode) {
    const url = window.location.href.split('?')[0] + '?room=' + roomCode;
    navigator.clipboard.writeText(url).then(() => {
      log('📋 Room link copied!');
    }).catch(() => {
      log('⚠️ Clipboard access is not available in this browser', 'warning');
    });
  }
}

// Socket Events
socket.on('game-created', (data) => {
  roomCode = data.roomCode;
  if (data.reconnectToken) {
    saveReconnectToken(data.roomCode, data.reconnectToken);
  }

  if (joinCodeInput) {
    joinCodeInput.value = data.roomCode;
  }

  if (roomDisplayButton) {
    roomDisplayButton.textContent = data.roomCode;
    roomDisplayButton.hidden = false;
  }

  if (startButton) {
    startButton.hidden = true;
  }

  log('✅ Room created: ' + data.roomCode);

  setSetupVisibility(true);
  updateActionButtons();
  updateSettingsAvailability();
  playUISound('success');
});

socket.on('cpu-game-created', (data) => {
  roomCode = data.roomCode;
  viewerId = null;

  if (joinCodeInput) {
    joinCodeInput.value = data.roomCode;
  }

  if (roomDisplayButton) {
    roomDisplayButton.textContent = data.roomCode;
    roomDisplayButton.hidden = false;
  }

  if (startButton) {
    startButton.hidden = true;
  }

  log('🤖 CPU game created: ' + data.roomCode);

  setSetupVisibility(true);
  updateActionButtons();
  updateSettingsAvailability();
  syncRoomSettings();
  playUISound('success');
});

socket.on('game-started', () => {
  if (startButton) {
    startButton.hidden = true;
  }

  setSetupVisibility(false);

  log('🎮 Game started!');
  updateActionButtons();
  playUISound('success');
});

socket.on('game-state-update', (state) => {
  currentState = state;

  if (Object.prototype.hasOwnProperty.call(state, 'viewerId')) {
    viewerId = state.viewerId;
  }

  if (state.settings && typeof state.settings.cpuSpeedMultiplier === 'number') {
    updateSliderSetting('cpuSpeed', state.settings.cpuSpeedMultiplier, { persist: false, skipRoomSync: true });
  }

  if (startButton) {
    startButton.hidden = !state.canStart;
  }

  if (state.phase === 'waiting') {
    setSetupVisibility(true);
  } else if (state.phase === 'playing') {
    setSetupVisibility(false);
  }

  renderTurnStatus(state);
  const isViewerTurn = Boolean(
    state.phase === 'playing' &&
    !state.isSpectator &&
    state.currentPlayerId === viewerId
  );

  if (pendingRoomSettingsSync && canControlCpuSpeed()) {
    pendingRoomSettingsSync = false;
    syncRoomSettings();
  }

  if (isViewerTurn && !lastViewerTurnState) {
    playUISound('turn');
  }

  lastViewerTurnState = isViewerTurn;
  lastRenderedState.currentPlayerName = state.currentPlayerName;

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
    const me = state.players.find(p => p && p.id === viewerId);
    if (me && me.hand && Array.isArray(me.hand)) {
      const newHandLength = me.hand.length;
      if (newHandLength !== lastRenderedState.handLength ||
          JSON.stringify(me.hand) !== JSON.stringify(myHand)) {
        myHand = me.hand;
        renderHand();
        lastRenderedState.handLength = newHandLength;
      }
    } else if (state.isSpectator && myHand.length > 0) {
      myHand = [];
      lastRenderedState.handLength = 0;
      renderHand();
    }
  }

  updateActionButtons();
  updateSettingsAvailability();
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
  updateActionButtons();
  playUISound('turn');
});

socket.on('error', (data) => {
  log('❌ ' + data.message, 'error');
  updateActionButtons();
  playUISound('error');
});

socket.on('invalid-play', (data) => {
  log('❌ Invalid: ' + data.reason, 'error');
  selectedIndices = [];
  renderHand();
  updateActionButtons();
  playUISound('error');
});

socket.on('reconnected', () => {
  log('🔄 Reconnected to game');
  updateActionButtons();
  updateSettingsAvailability();
  playUISound('success');
});

// Render Functions
function formatCardCount(count) {
  return count + ' card' + (count === 1 ? '' : 's');
}

function cardColorClass(card) {
  return card && (card.suit === 'H' || card.suit === 'D') ? 'red' : 'black';
}

function cardAriaLabel(card) {
  if (!card || !card.rank || !card.suit) {
    return 'Unknown card';
  }

  const suitNames = {
    'H': 'hearts',
    'D': 'diamonds',
    'C': 'clubs',
    'S': 'spades'
  };
  const rankNames = {
    'A': 'Ace',
    'K': 'King',
    'Q': 'Queen',
    'J': 'Jack'
  };

  return (rankNames[card.rank] || card.rank) + ' of ' + (suitNames[card.suit] || card.suit);
}

function renderBadge(label, modifier) {
  return '<span class="player-badge player-badge--' + modifier + '">' + escapeHtml(label) + '</span>';
}

function buildPlayerBadges(player, currentId) {
  const badges = [];

  if (player.id === viewerId) {
    badges.push(renderBadge('You', 'you'));
  }

  if (player.id === currentId) {
    badges.push(renderBadge('Turn', 'turn'));
  }

  if (player.isCPU) {
    badges.push(renderBadge('CPU', 'cpu'));
  }

  if (player.finished) {
    badges.push(renderBadge('Finished', 'finished'));
  }

  if (player.connected === false) {
    badges.push(renderBadge('Offline', 'offline'));
  }

  return badges.join('');
}

function renderPlayerCard(player, currentId, showCards = false) {
  const isActive = player.id === currentId;
  const playerName = escapeHtml(player.name || 'Unknown Player');
  const handSize = Array.isArray(player.hand)
    ? player.hand.length
    : (typeof player.handSize === 'number' ? player.handSize : 0);
  const badges = buildPlayerBadges(player, currentId);
  const handDisplay = showCards && Array.isArray(player.hand) && player.hand.length > 0
    ? '<div class="mini-hand">' + player.hand.map(card => {
      if (!card || !card.rank || !card.suit) {
        return '';
      }

      return '<div class="mini-card ' + cardColorClass(card) + '">' + escapeHtml(cardText(card)) + '</div>';
    }).join('') + '</div>'
    : '';
  const badgesMarkup = badges ? '<div class="player-badges">' + badges + '</div>' : '';
  const metaClass = showCards ? 'player-meta player-meta-compact' : 'player-meta';
  const spectatorClass = showCards ? ' spectator-player' : '';

  return `
    <div class="player ${isActive ? 'active-turn' : ''}${spectatorClass}">
      <div class="player-header">
        <div class="player-name-row">
          <span class="player-name">${playerName}</span>
          ${badgesMarkup}
        </div>
        <div class="${metaClass}">${formatCardCount(handSize)}</div>
      </div>
      ${handDisplay}
    </div>
  `;
}

function renderPlayers(players, currentId) {
  const playersDiv = document.getElementById('players');
  if (!players || players.length === 0) {
    if (playersDiv) {
      playersDiv.innerHTML = '';
    }
    return;
  }

  const newHTML = players
    .filter(p => p && p.id)
    .map(player => renderPlayerCard(player, currentId))
    .join('');

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

  const newHTML = state.players
    .filter(p => p && p.id)
    .map(player => renderPlayerCard(player, state.currentPlayerId, true))
    .join('');

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
    return `<div class="card ${color}">${escapeHtml(cardText(card))}</div>`;
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
    if (wrapper.innerHTML !== '<div class="empty-hand">No cards</div>') {
      wrapper.innerHTML = '<div class="empty-hand">No cards</div>';
    }
    return;
  }

  const newHTML = myHand.map((card, index) => {
    if (!card || !card.rank || !card.suit) {
      return '';
    }

    const isSelected = selectedIndices.includes(index);
    const selectedClass = isSelected ? ' selected' : '';
    return `
      <button
        type="button"
        class="card-item ${cardColorClass(card)}${selectedClass}"
        aria-pressed="${String(isSelected)}"
        aria-label="${escapeHtml(cardAriaLabel(card))}"
        onclick="toggleCard(${index})"
      >
        ${escapeHtml(cardText(card))}
      </button>
    `;
  }).join('');

  if (wrapper.innerHTML !== newHTML) {
    wrapper.innerHTML = newHTML;
  }
}

function renderSwapCards() {
  const swapCardsDiv = document.getElementById('swapCards');
  const swapSelectedDiv = document.getElementById('swapSelected');
  const submitBtn = document.getElementById('submitBtn');

  if (!swapCardsDiv || !swapSelectedDiv || !submitBtn || !swapData) {
    return;
  }

  swapCardsDiv.innerHTML = myHand.map((card, index) => {
    if (!card || !card.rank || !card.suit) {
      return '';
    }

    const isSelected = selectedIndices.includes(index);
    const selectedClass = isSelected ? ' selected' : '';
    return `
      <button
        type="button"
        class="swap-card ${cardColorClass(card)}${selectedClass}"
        aria-pressed="${String(isSelected)}"
        aria-label="${escapeHtml(cardAriaLabel(card))}"
        onclick="toggleSwapCard(${index})"
      >
        ${escapeHtml(cardText(card))}
      </button>
    `;
  }).join('');

  swapSelectedDiv.textContent =
    'Selected: ' + selectedIndices.length + '/' + swapData.count;

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
  updateActionButtons();
}

function toggleSwapCard(index) {
  if (!swapData || index < 0 || index >= myHand.length) return;

  const idx = selectedIndices.indexOf(index);
  if (idx === -1) {
    if (selectedIndices.length < swapData.count) {
      selectedIndices.push(index);
    }
  } else {
    selectedIndices.splice(idx, 1);
  }
  renderSwapCards();
  updateActionButtons();
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
    updateActionButtons();
  }
}

// Helper Functions
function cardText(card) {
  if (!card || !card.rank || !card.suit) return '??';
  const suits = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
  return card.rank + (suits[card.suit] || card.suit);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  if (room && joinCodeInput) {
    joinCodeInput.value = room;
    log('📨 Room code from URL: ' + room);
  }
});

log('🎮 President client loaded');
log('🔐 Reconnect-safe multiplayer ready');
