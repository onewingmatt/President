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

// ...existing code from game.js...
