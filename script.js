let wordPool = [];
let wordSet = new Set();
let wordBuckets = new Map();
let missionLetters = [];
let dataLoaded = false;

let currentScore = 0;
let currentMission = "";
let usedWords = new Set();
let lastWord = "";
let timeLeft = 10;
let timerInterval = null;
let turnStartTime = 0;
let isPlayerTurn = true;
let gameActive = false;
let botTurnToken = 0;

let gameMode = "solo";
let peer = null;
let connection = null;
let onlineRole = null;
let currentTurnRole = "host";
let onlineScores = { host: 0, guest: 0 };
let currentRoomCode = "";

const TURN_SECONDS = 10;
const BOT_MAX_WORD_LENGTH = 10;
const ROOM_PREFIX = "siwon-word-chain-";

const scoreDisplay = document.getElementById("score-display");
const timeDisplay = document.getElementById("time-display");
const missionDisplay = document.getElementById("mission-display");
const startBtn = document.getElementById("start-btn");
const chatWindow = document.getElementById("chat-window");
const wordInput = document.getElementById("word-input");
const sendBtn = document.getElementById("send-btn");
const soloModeBtn = document.getElementById("solo-mode-btn");
const onlineModeBtn = document.getElementById("online-mode-btn");
const onlinePanel = document.getElementById("online-panel");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const roomCodeInput = document.getElementById("room-code-input");
const inviteLinkInput = document.getElementById("invite-link-input");
const copyLinkBtn = document.getElementById("copy-link-btn");
const onlineStatus = document.getElementById("online-status");
const connectionPill = document.getElementById("connection-pill");

async function fetchTxtFile(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) return [];
        const text = await response.text();
        const words = text
            .split(/[\/\r\n]+/)
            .map(word => word.replace(/^\uFEFF/, "").trim())
            .filter(word => word.length >= 2 && !word.includes("?"));

        return removeDuplicateWords(words);
    } catch (error) {
        console.error(`${filePath} 파일을 불러오는데 실패했습니다:`, error);
        return [];
    }
}

function removeDuplicateWords(words) {
    const uniqueWords = [];
    const seenWords = new Set();

    for (const word of words) {
        if (seenWords.has(word)) continue;
        seenWords.add(word);
        uniqueWords.push(word);
    }

    return uniqueWords;
}

function buildWordBuckets(words) {
    const buckets = new Map();

    for (const word of words) {
        const firstChar = word.charAt(0);
        if (!buckets.has(firstChar)) {
            buckets.set(firstChar, []);
        }
        buckets.get(firstChar).push(word);
    }

    return buckets;
}

async function loadGameData() {
    if (dataLoaded) return;

    wordPool = await fetchTxtFile("words/words.txt");
    wordSet = new Set(wordPool);
    wordBuckets = buildWordBuckets(wordPool);

    try {
        const response = await fetch("data/missions.json");
        missionLetters = response.ok ? await response.json() : [];
    } catch (error) {
        console.error("missions.json 로드 실패:", error);
        missionLetters = [];
    }

    if (missionLetters.length === 0) {
        missionLetters = ["가", "나", "다", "라", "마"];
    }

    dataLoaded = true;
}

function setMode(mode) {
    if (gameMode === mode) return;

    finishGame("모드가 바뀌었습니다.");
    gameMode = mode;
    soloModeBtn.classList.toggle("active", mode === "solo");
    onlineModeBtn.classList.toggle("active", mode === "online");
    onlinePanel.hidden = mode !== "online";
    connectionPill.textContent = mode === "online" ? "친구" : "혼자";
    startBtn.textContent = mode === "online" ? "친구 대전 시작" : "게임 시작";
    updateStartButtonState();
    addSystemMessage(mode === "online" ? "친구 모드입니다. 방을 만들거나 참가하세요." : "혼자 모드입니다.");
}

function updateStartButtonState() {
    if (gameMode === "solo") {
        startBtn.disabled = false;
        return;
    }

    startBtn.disabled = !(onlineRole === "host" && connection && connection.open);
}

function setOnlineStatus(message) {
    onlineStatus.textContent = message;
}

function resetOnlineConnection() {
    if (connection) {
        connection.close();
        connection = null;
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }

    onlineRole = null;
    currentRoomCode = "";
    inviteLinkInput.value = "";
    updateStartButtonState();
}

function generateRoomCode() {
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `${ROOM_PREFIX}${randomPart}`;
}

function extractRoomCode(value) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return "";

    try {
        const url = new URL(trimmedValue);
        return url.searchParams.get("room") || "";
    } catch {
        return trimmedValue.startsWith(ROOM_PREFIX) ? trimmedValue : "";
    }
}

function extractRoomName(value) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return "";

    try {
        const url = new URL(trimmedValue);
        return url.searchParams.get("name") || "";
    } catch {
        return trimmedValue;
    }
}

function cleanRoomName(value) {
    return value
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "")
        .slice(0, 40);
}

function encodeRoomNameToId(roomName) {
    const bytes = new TextEncoder().encode(roomName);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return `${ROOM_PREFIX}name-${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function getRoomCodeFromInput(value, allowRandomRoom) {
    const directRoomCode = extractRoomCode(value);
    if (directRoomCode) return directRoomCode;

    const cleanedName = cleanRoomName(extractRoomName(value));
    if (cleanedName) return encodeRoomNameToId(cleanedName);

    return allowRandomRoom ? generateRoomCode() : "";
}

function getRoomNameFromInput(value) {
    const directRoomCode = extractRoomCode(value);
    if (directRoomCode) return "";

    return cleanRoomName(extractRoomName(value));
}

function getInviteLink(roomCode, roomName) {
    const url = new URL(window.location.href);
    url.search = "";

    if (roomName) {
        return `${url.origin}${url.pathname}?name=${roomName}`;
    }

    url.searchParams.set("room", roomCode);
    return url.toString();
}

function createOnlineRoom() {
    if (typeof Peer === "undefined") {
        setOnlineStatus("온라인 연결 파일을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.");
        return;
    }

    resetOnlineConnection();
    onlineRole = "host";
    const roomName = getRoomNameFromInput(roomCodeInput.value);
    currentRoomCode = getRoomCodeFromInput(roomCodeInput.value, true);
    roomCodeInput.value = roomName || currentRoomCode;
    inviteLinkInput.value = getInviteLink(currentRoomCode, roomName);
    setOnlineStatus("방을 여는 중입니다...");

    peer = new Peer(currentRoomCode);

    peer.on("open", () => {
        setOnlineStatus("방이 열렸습니다. 초대 링크를 친구에게 보내세요.");
        addSystemMessage("친구가 들어오면 게임을 시작할 수 있습니다.");
    });

    peer.on("connection", conn => {
        if (connection && connection.open) {
            conn.close();
            return;
        }

        setupConnection(conn);
    });

    peer.on("error", error => {
        console.error(error);
        const isTaken = error && error.type === "unavailable-id";
        setOnlineStatus(isTaken ? "이미 사용 중인 방 이름입니다. 다른 이름으로 다시 만들어 주세요." : "방 만들기에 실패했습니다. 다시 시도해 주세요.");
    });
}

function joinOnlineRoom() {
    if (typeof Peer === "undefined") {
        setOnlineStatus("온라인 연결 파일을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.");
        return;
    }

    const roomCode = getRoomCodeFromInput(roomCodeInput.value, false);
    if (!roomCode) {
        setOnlineStatus("방 코드나 초대 링크를 입력해 주세요.");
        return;
    }

    resetOnlineConnection();
    onlineRole = "guest";
    currentRoomCode = roomCode;
    roomCodeInput.value = roomCode;
    setOnlineStatus("방에 참가하는 중입니다...");

    peer = new Peer();

    peer.on("open", () => {
        const conn = peer.connect(roomCode, { reliable: true });
        setupConnection(conn);
    });

    peer.on("error", error => {
        console.error(error);
        setOnlineStatus("방 참가에 실패했습니다. 방 코드가 맞는지 확인해 주세요.");
    });
}

function setupConnection(conn) {
    connection = conn;

    conn.on("open", () => {
        setOnlineStatus(onlineRole === "host" ? "친구가 연결되었습니다. 게임을 시작하세요." : "방에 연결되었습니다. 방장이 시작할 때까지 기다리세요.");
        connectionPill.textContent = "연결됨";
        updateStartButtonState();
        addSystemMessage(onlineRole === "host" ? "친구가 들어왔습니다." : "방에 참가했습니다.");
    });

    conn.on("data", data => {
        void handleOnlineData(data);
    });

    conn.on("close", () => {
        finishGame("친구와 연결이 끊겼습니다.");
        setOnlineStatus("연결이 끊겼습니다. 새 방을 만들거나 다시 참가하세요.");
        connection = null;
        connectionPill.textContent = "친구";
        updateStartButtonState();
    });

    conn.on("error", error => {
        console.error(error);
        setOnlineStatus("친구와 연결 중 문제가 생겼습니다.");
    });
}

function sendOnlineMessage(data) {
    if (connection && connection.open) {
        connection.send(data);
    }
}

async function copyInviteLink() {
    if (!inviteLinkInput.value) {
        setOnlineStatus("먼저 방을 만들어 주세요.");
        return;
    }

    try {
        await navigator.clipboard.writeText(inviteLinkInput.value);
        setOnlineStatus("초대 링크를 복사했습니다.");
    } catch {
        inviteLinkInput.select();
        setOnlineStatus("링크 칸을 선택했습니다. Ctrl+C로 복사하세요.");
    }
}

async function startGame() {
    if (gameMode === "online") {
        await startOnlineGame();
        return;
    }

    await startSoloGame();
}

async function startSoloGame() {
    await loadGameData();
    resetSharedGameState();
    currentScore = 0;
    gameActive = true;
    isPlayerTurn = true;
    updateScoreDisplay();
    chatWindow.innerHTML = "";
    addSystemMessage(`게임이 시작되었습니다. 단어장 ${wordPool.length.toLocaleString("ko-KR")}개를 사용합니다.`);
    startNewSoloTurn();
}

async function startOnlineGame() {
    if (onlineRole !== "host" || !connection || !connection.open) {
        addSystemMessage("방을 만들고 친구가 연결된 뒤 시작할 수 있습니다.");
        return;
    }

    await loadGameData();
    resetSharedGameState();
    onlineScores = { host: 0, guest: 0 };
    currentTurnRole = "host";
    currentMission = pickMissionLetter();
    gameActive = true;
    chatWindow.innerHTML = "";
    updateScoreDisplay();
    updateMissionDisplay();
    addSystemMessage(`친구 대전이 시작되었습니다. 단어장 ${wordPool.length.toLocaleString("ko-KR")}개를 사용합니다.`);
    sendOnlineMessage({
        type: "game-start",
        state: {
            mission: currentMission,
            turnRole: currentTurnRole,
            scores: onlineScores,
            usedWords: [],
            lastWord: ""
        }
    });
    startOnlineTurn();
}

function resetSharedGameState() {
    clearInterval(timerInterval);
    botTurnToken++;
    usedWords.clear();
    lastWord = "";
    currentMission = "";
    timeLeft = TURN_SECONDS;
    timeDisplay.textContent = timeLeft;
    missionDisplay.textContent = "-";
    wordInput.value = "";
    setInputEnabled(false);
}

function startNewSoloTurn() {
    if (!gameActive) return;

    resetTimer();
    currentMission = pickMissionLetter();
    updateMissionDisplay();
    turnStartTime = Date.now();

    if (isPlayerTurn) {
        setInputEnabled(true);
        wordInput.focus();
    } else {
        setInputEnabled(false);
        botTurn();
    }
}

function startOnlineTurn() {
    if (!gameActive) return;

    resetTimer();
    turnStartTime = Date.now();

    if (isMyOnlineTurn()) {
        setInputEnabled(true);
        wordInput.focus();
        addSystemMessage("내 차례입니다.");
    } else {
        setInputEnabled(false);
        addSystemMessage("친구 차례입니다.");
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = TURN_SECONDS;
    timeDisplay.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timeDisplay.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimerExpired();
        }
    }, 1000);
}

function handleTimerExpired() {
    if (!gameActive) return;

    if (gameMode === "online") {
        if (isMyOnlineTurn()) {
            sendOnlineMessage({
                type: "game-over",
                message: "친구가 시간 초과로 패배했습니다. 당신의 승리!"
            });
            finishGame("시간 초과로 패배했습니다.");
        }
        return;
    }

    finishGame(isPlayerTurn ? "시간 초과로 패배했습니다!" : "봇이 시간 초과로 패배했습니다! 당신의 승리!");
}

function pickMissionLetter() {
    if (missionLetters.length === 0) return "-";
    const randomIndex = Math.floor(Math.random() * missionLetters.length);
    return missionLetters[randomIndex];
}

function updateMissionDisplay() {
    missionDisplay.textContent = currentMission ? `"${currentMission}"` : "-";
}

function getInvalidReason(word) {
    if (word.length < 2) {
        return "단어는 최소 2글자 이상이어야 합니다.";
    }

    if (!wordSet.has(word)) {
        return `'${word}'은(는) 단어장에 없는 단어입니다.`;
    }

    if (usedWords.has(word)) {
        return `'${word}'은(는) 이미 사용된 단어입니다.`;
    }

    if (lastWord !== "") {
        const requiredChar = lastWord.charAt(lastWord.length - 1);
        if (word.charAt(0) !== requiredChar) {
            return `'${requiredChar}'로 시작하는 단어여야 합니다.`;
        }
    }

    return "";
}

function calculateTurnScore(word) {
    const elapsedTime = (Date.now() - turnStartTime) / 1000;
    let turnScore = 8;

    if (elapsedTime <= 0.5) turnScore += 10;
    else if (elapsedTime <= 1.0) turnScore += 8;
    else if (elapsedTime <= 2.0) turnScore += 6;
    else if (elapsedTime <= 3.0) turnScore += 4;
    else if (elapsedTime <= 5.0) turnScore += 2;

    const missionHit = currentMission !== "-" && word.includes(currentMission);
    if (missionHit) {
        turnScore += 5;
    }

    return { turnScore, missionHit };
}

function selectBotWord() {
    const requiredChar = lastWord.charAt(lastWord.length - 1);
    const candidateWords = wordBuckets.get(requiredChar) || [];
    const availableWords = candidateWords.filter(word => word.length <= BOT_MAX_WORD_LENGTH && !usedWords.has(word));

    if (availableWords.length === 0) return null;

    availableWords.sort((a, b) => a.length - b.length || a.localeCompare(b, "ko"));
    return availableWords[0];
}

function getBotDelay() {
    return (Math.random() * 2 + 2) * 1000;
}

function handlePlayerInput() {
    if (gameMode === "online") {
        handleOnlineInput();
        return;
    }

    handleSoloInput();
}

function handleSoloInput() {
    const word = wordInput.value.trim();
    wordInput.value = "";

    const invalidReason = getInvalidReason(word);
    if (invalidReason) {
        addSystemMessage(`${invalidReason} 패배입니다.`);
        finishGame("규칙에 맞지 않는 단어를 입력했습니다.");
        return;
    }

    addChatMessage(word, "player");
    usedWords.add(word);
    lastWord = word;

    const result = calculateTurnScore(word);
    currentScore += result.turnScore;
    if (result.missionHit) {
        addSystemMessage(`미션 성공 보너스! (+5점)`);
    }
    updateScoreDisplay();

    isPlayerTurn = false;
    startNewSoloTurn();
}

function handleOnlineInput() {
    if (!connection || !connection.open) {
        addSystemMessage("친구와 연결된 뒤 입력할 수 있습니다.");
        return;
    }

    if (!isMyOnlineTurn()) {
        addSystemMessage("아직 내 차례가 아닙니다.");
        return;
    }

    const word = wordInput.value.trim();
    wordInput.value = "";

    const invalidReason = getInvalidReason(word);
    if (invalidReason) {
        addSystemMessage(`${invalidReason} 패배입니다.`);
        sendOnlineMessage({
            type: "game-over",
            message: `친구가 규칙 위반으로 패배했습니다. 당신의 승리! (${invalidReason})`
        });
        finishGame("규칙에 맞지 않는 단어를 입력했습니다.");
        return;
    }

    addChatMessage(word, "player");
    usedWords.add(word);
    lastWord = word;

    const result = calculateTurnScore(word);
    onlineScores[onlineRole] += result.turnScore;
    if (result.missionHit) {
        addSystemMessage(`미션 성공 보너스! (+5점)`);
    }

    currentMission = pickMissionLetter();
    currentTurnRole = getOtherRole(onlineRole);
    updateScoreDisplay();
    updateMissionDisplay();

    sendOnlineMessage({
        type: "word-played",
        word,
        role: onlineRole,
        score: result.turnScore,
        missionHit: result.missionHit,
        nextMission: currentMission,
        nextTurnRole: currentTurnRole,
        scores: onlineScores
    });

    startOnlineTurn();
}

function botTurn() {
    const activeToken = ++botTurnToken;
    const delay = getBotDelay();

    setTimeout(() => {
        if (!gameActive || activeToken !== botTurnToken) return;

        const botWord = selectBotWord();

        if (!botWord) {
            finishGame("봇이 더 이상 이어갈 단어를 찾지 못했습니다. 플레이어 승리!");
            return;
        }

        addChatMessage(botWord, "bot");
        usedWords.add(botWord);
        lastWord = botWord;
        isPlayerTurn = true;
        startNewSoloTurn();
    }, delay);
}

async function handleOnlineData(data) {
    if (!data || typeof data !== "object") return;

    if (data.type === "game-start") {
        await loadGameData();
        resetSharedGameState();
        onlineScores = data.state.scores || { host: 0, guest: 0 };
        currentMission = data.state.mission || pickMissionLetter();
        currentTurnRole = data.state.turnRole || "host";
        usedWords = new Set(data.state.usedWords || []);
        lastWord = data.state.lastWord || "";
        gameActive = true;
        chatWindow.innerHTML = "";
        updateScoreDisplay();
        updateMissionDisplay();
        addSystemMessage(`친구 대전이 시작되었습니다. 단어장 ${wordPool.length.toLocaleString("ko-KR")}개를 사용합니다.`);
        startOnlineTurn();
        return;
    }

    if (data.type === "word-played") {
        addChatMessage(data.word, "remote");
        usedWords.add(data.word);
        lastWord = data.word;
        onlineScores = data.scores || onlineScores;
        currentMission = data.nextMission || pickMissionLetter();
        currentTurnRole = data.nextTurnRole || onlineRole;
        updateScoreDisplay();
        updateMissionDisplay();

        if (data.missionHit) {
            addSystemMessage("친구가 미션 보너스를 받았습니다.");
        }

        startOnlineTurn();
        return;
    }

    if (data.type === "game-over") {
        finishGame(data.message || "친구 대전이 종료되었습니다.");
    }
}

function addChatMessage(text, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");

    if (sender === "player") {
        messageDiv.classList.add("player-message");
        messageDiv.innerText = `나\n${text}`;
    } else if (sender === "remote") {
        messageDiv.classList.add("remote-message");
        messageDiv.innerText = `친구\n${text}`;
    } else {
        messageDiv.classList.add("bot-message");
        messageDiv.innerText = `봇\n${text}`;
    }

    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addSystemMessage(text) {
    const systemDiv = document.createElement("div");
    systemDiv.classList.add("system-message");
    systemDiv.textContent = text;
    chatWindow.appendChild(systemDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function finishGame(message) {
    clearInterval(timerInterval);
    botTurnToken++;
    gameActive = false;
    setInputEnabled(false);

    if (message) {
        addSystemMessage(`게임 종료: ${message}`);
    }
}

function setInputEnabled(enabled) {
    wordInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
}

function updateScoreDisplay() {
    if (gameMode === "online") {
        const myRole = onlineRole || "host";
        const otherRole = getOtherRole(myRole);
        scoreDisplay.textContent = `나 ${onlineScores[myRole] || 0} / 친구 ${onlineScores[otherRole] || 0}`;
        return;
    }

    scoreDisplay.textContent = currentScore;
}

function getOtherRole(role) {
    return role === "host" ? "guest" : "host";
}

function isMyOnlineTurn() {
    return gameMode === "online" && onlineRole && currentTurnRole === onlineRole;
}

function applyInviteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("room");

    if (!roomCode) return;

    gameMode = "solo";
    setMode("online");
    roomCodeInput.value = roomCode;
    setOnlineStatus("초대 링크가 감지되었습니다. 참가 버튼을 눌러 들어가세요.");
}

soloModeBtn.addEventListener("click", () => setMode("solo"));
onlineModeBtn.addEventListener("click", () => setMode("online"));
createRoomBtn.addEventListener("click", createOnlineRoom);
joinRoomBtn.addEventListener("click", joinOnlineRoom);
copyLinkBtn.addEventListener("click", copyInviteLink);
startBtn.addEventListener("click", startGame);
sendBtn.addEventListener("click", handlePlayerInput);
wordInput.addEventListener("keypress", event => {
    if (event.key === "Enter") handlePlayerInput();
});

window.addEventListener("beforeunload", () => {
    if (connection) connection.close();
    if (peer) peer.destroy();
});

applyInviteFromUrl();
updateStartButtonState();
