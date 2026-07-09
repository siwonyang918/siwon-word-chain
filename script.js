// ==========================================
// 게임 상태 관리 변수 리스트
// ==========================================
let wordPool = [];
let missionLetters = [];

let currentScore = 0;
let currentMission = "";
let usedWords = new Set();
let lastWord = "";

let timeLeft = 10;
let timerInterval = null;
let turnStartTime = 0;
let isPlayerTurn = true;

// DOM 요소 연결
const scoreDisplay = document.getElementById("score-display");
const timeDisplay = document.getElementById("time-display");
const missionDisplay = document.getElementById("mission-display");
const startBtn = document.getElementById("start-btn");
const chatWindow = document.getElementById("chat-window");
const wordInput = document.getElementById("word-input");
const sendBtn = document.getElementById("send-btn");

// ==========================================
// 1. 데이터 파일 로드 함수들
// ==========================================

// 텍스트 파일을 한 줄씩 읽어 배열로 반환하는 함수
async function fetchTxtFile(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) return [];
        const text = await response.text();
        // 줄바꿈 문자로 분리하고 공백 및 빈 줄 제거 후 배열 반환
        return text.split(/\r?\n/).map(word => word.trim()).filter(word => word.length > 0);
    } catch (error) {
        console.error(`${filePath} 파일을 불러오는데 실패했습니다:`, error);
        return [];
    }
}

// 모든 단어 데이터 및 미션 데이터를 설정 파일에서 로드하는 함수
async function loadGameData() {
    wordPool = await fetchTxtFile("words/words.txt");

    // 미션 글자 JSON 로드
    try {
        const response = await fetch("data/missions.json");
        if (response.ok) {
            missionLetters = await response.json();
        }
    } catch (error) {
        console.error("missions.json 로드 실패:", error);
        missionLetters = ["가", "나", "다", "라", "마"]; // 로드 실패 시 기본값 보호
    }
}

// ==========================================
// 2. 게임 핵심 흐름 제어 함수들
// ==========================================

// 게임을 초기 상태로 리셋하고 새로 시작하는 함수
async function startGame() {
    clearInterval(timerInterval);
    chatWindow.innerHTML = "";
    usedWords.clear();
    lastWord = "";
    currentScore = 0;
    scoreDisplay.textContent = currentScore;
    
    addSystemMessage("게임이 시작되었습니다!");
    
    // 데이터 불러오기 완료 확인 후 턴 시작
    await loadGameData();
    
    isPlayerTurn = true;
    startNewTurn();
}

// 매 턴이 바뀔 때마다 시간, 미션을 갱신하고 입력창 상태를 제어하는 함수
function startNewTurn() {
    resetTimer();
    changeMissionLetter();
    turnStartTime = Date.now();

    if (isPlayerTurn) {
        wordInput.disabled = false;
        sendBtn.disabled = false;
        wordInput.focus();
    } else {
        wordInput.disabled = true;
        sendBtn.disabled = true;
        botTurn();
    }
}

// ==========================================
// 3. 타이머 및 미션 관리 함수들
// ==========================================

// 10초 제한시간 타이머를 리셋하고 시작하는 함수
function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = 10;
    timeDisplay.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timeDisplay.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            endGame(isPlayerTurn ? "시간 초과로 패배했습니다!" : "봇이 시간 초과로 패배했습니다! 당신의 승리!");
        }
    }, 1000);
}

// 새로운 랜덤 미션 글자를 지정하는 함수
function changeMissionLetter() {
    if (missionLetters.length > 0) {
        const randomIndex = Math.floor(Math.random() * missionLetters.length);
        currentMission = missionLetters[randomIndex];
        missionDisplay.textContent = `★ "${currentMission}"`;
    }
}

// ==========================================
// 4. 검사 및 규칙(AI) 함수들
// ==========================================

// 입력받은 단어가 규칙(끝말 잇기, 중복 검사 등)에 맞는지 검사하는 함수
function validateWord(word) {
    if (word.length < 2) {
        addSystemMessage("단어는 최소 2글자 이상이어야 합니다.");
        return false;
    }
    if (usedWords.has(word)) {
        addSystemMessage(`'${word}'은(는) 이미 사용된 단어입니다! (패배)`);
        endGame("이미 사용한 단어를 입력하여 패배했습니다.");
        return false;
    }
    if (lastWord !== "") {
        const requiredChar = lastWord.charAt(lastWord.length - 1);
        if (word.charAt(0) !== requiredChar) {
            addSystemMessage(`'${requiredChar}'로 시작하는 단어여야 합니다! (패배)`);
            endGame("틀린 단어를 입력하여 패배했습니다.");
            return false;
        }
    }
    return true;
}

// 플레이어의 입력 속도 및 미션 성공 여부를 계산하여 점수를 더해주는 함수
function calculateScore(word) {
    const elapsedTime = (Date.now() - turnStartTime) / 1000;
    let turnScore = 8; // 기본 점수

    // 속도 보너스 계산
    if (elapsedTime <= 0.5) turnScore += 10;
    else if (elapsedTime <= 1.0) turnScore += 8;
    else if (elapsedTime <= 2.0) turnScore += 6;
    else if (elapsedTime <= 3.0) turnScore += 4;
    else if (elapsedTime <= 5.0) turnScore += 2;

    // 미션 보너스 계산 (단어 내에 미션 글자가 포함되어 있으면)
    if (word.includes(currentMission)) {
        turnScore += 5;
        addSystemMessage(`✨ 미션 성공 보너스! (+5점)`);
    }

    currentScore += turnScore;
    scoreDisplay.textContent = currentScore;
}

// 봇이 규칙에 맞는 단어를 우선순위(길이 등)에 따라 선택하는 AI 함수
function selectBotWord() {
    const requiredChar = lastWord.charAt(lastWord.length - 1);
    
    // 조건 1 & 2: 시작 글자가 맞고 아직 사용하지 않은 단어들만 필터링
    let availableWords = wordPool.filter(word => word.charAt(0) === requiredChar && !usedWords.has(word));

    if (availableWords.length === 0) return null;

    // 가끔(20% 확률로) 일부러 짧은 단어 선택, 그 외엔 긴 단어 우선 정렬
    if (Math.random() > 0.2) {
        availableWords.sort((a, b) => b.length - a.length); // 긴 단어 우선
    } else {
        availableWords.sort((a, b) => a.length - b.length); // 짧은 단어 우선
    }

    return availableWords[0];
}

// 봇의 생각하는 시간(딜레이)을 계산하여 반환하는 함수
function getBotDelay() {
    const min = 2;
    const max = 4;
    return (Math.random() * (max - min) + min) * 1000;
}

// ==========================================
// 5. 턴 진행 및 UI 연동 함수들
// ==========================================

// 플레이어가 단어를 전송했을 때 실행되는 핸들러 함수
function handlePlayerInput() {
    const word = wordInput.value.trim();
    wordInput.value = "";

    if (!validateWord(word)) return;

    addChatMessage(word, "player");
    usedWords.add(word);
    lastWord = word;

    calculateScore(word);
    
    // 봇의 턴으로 전환
    isPlayerTurn = false;
    startNewTurn();
}

// 봇이 생각한 뒤 단어를 말하게 하는 턴 처리 함수
function botTurn() {
    const delay = getBotDelay();

    setTimeout(() => {
        const botWord = selectBotWord();

        // 사용할 수 있는 단어가 없는 경우 봇 패배
        if (!botWord) {
            endGame("봇이 더 이상 이어갈 단어를 찾지 못했습니다. 플레이어 승리!");
            return;
        }

        addChatMessage(botWord, "bot");
        usedWords.add(botWord);
        lastWord = botWord;

        // 플레이어의 턴으로 전환
        isPlayerTurn = true;
        startNewTurn();
    }, delay);
}

// 채팅 화면에 말풍선을 추가하고 아래로 자동 스크롤하는 함수
function addChatMessage(text, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");
    messageDiv.classList.add(sender === "player" ? "player-message" : "bot-message");
    
    // 이모지와 텍스트를 함께 노출
    const profile = sender === "player" ? "😀 플레이어\n" : "🤖 봇\n";
    messageDiv.innerText = profile + text;
    
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight; // 스크롤 하단 고정
}

// 중앙에 시스템 공지 메시지를 띄워주는 함수
function addSystemMessage(text) {
    const systemDiv = document.createElement("div");
    systemDiv.classList.add("system-message");
    systemDiv.textContent = text;
    chatWindow.appendChild(systemDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// 게임이 끝났을 때 결과 창을 띄우고 입력을 막는 함수
function endGame(message) {
    clearInterval(timerInterval);
    addSystemMessage(`🎮 게임 종료: ${message}`);
    wordInput.disabled = true;
    sendBtn.disabled = true;
}

// ==========================================
// 6. 이벤트 리스너 등록
// ==========================================
startBtn.addEventListener("click", startGame);
sendBtn.addEventListener("click", handlePlayerInput);
wordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handlePlayerInput();
});
