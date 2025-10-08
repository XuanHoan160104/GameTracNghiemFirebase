// --- Firebase ---
//const db = firebase.database();

// --- Biến toàn cục ---
let roomId = null;
let playerName = null;
let isHost = false;
let currentQuestionIndex = null;
let myAnswered = false;
let myChoice = null;
let myReview = [];
let localTimerInterval = null;
let questionStartTime = 0;

const QUESTION_TIME = 20;
let QUESTIONS = [];




// --- DOM elements ---
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const menu = document.getElementById("menu");
const lobby = document.getElementById("lobby");
const gameArea = document.getElementById("game");
const roomCodeLabel = document.getElementById("roomCode");
const playersDiv = document.getElementById("players");
const hostControls = document.getElementById("hostControls");
const startGameBtn = document.getElementById("startGameBtn");
const hostLabel = document.getElementById("hostLabel");
const roomTitle = document.getElementById("roomTitle");
const questionText = document.getElementById("questionText");
const optionsDiv = document.getElementById("options");
const timerSpan = document.getElementById("timeLeft");
const afterAnswer = document.getElementById("afterAnswer");
const nextBtn = document.getElementById("nextBtn");
const leaderboardDiv = document.getElementById("leaderboard");
const reviewDiv = document.getElementById("reviewAnswers");
const reviewList = document.getElementById("reviewList");
const backToLeaderboard = document.getElementById("backToLeaderboard");
const backToMenu = document.getElementById("backToMenu");

// --- Sự kiện ---
createBtn.onclick = createRoom;
joinBtn.onclick = joinRoom;
backToMenu.onclick = () => location.reload();
backToLeaderboard.onclick = () => {
  reviewDiv.style.display = "none";
  leaderboardDiv.style.display = "block";
};
nextBtn.onclick = () => { if (isHost) evaluateAnswersThenProceed(); };

// --- Lưu & khôi phục session ---
function savePlayerState(playerName, roomId, isHost) {
  localStorage.setItem("quizSession", JSON.stringify({ playerName, roomId, isHost }));
}

// --- Load câu hỏi từ Firebase ---
function loadQuestionsFromDB() {
  return db.ref("questions").once("value").then(snap => {
    const data = snap.val() || [];
    QUESTIONS = data
      .filter(q => q && q.text && q.options && typeof q.correct === "number")
      .map(q => ({
        q: q.text,
        options: q.options,
        correct: q.correct
      }));
    console.log(`✅ Đã tải ${QUESTIONS.length} câu hỏi từ Firebase`);
  });
}

// --- Tạo mã phòng ---
function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// --- Tạo phòng ---
async function createRoom() {
  playerName = (nameInput.value || ("Host-" + Math.floor(Math.random() * 1000))).trim();
  isHost = true;
  roomId = generateRoomCode();

  const players = {};
 // 🕒 Thêm joinedAt cho host
 players[playerName] = { score: 0, totalTime: 0, joinedAt: Date.now() };

  await loadQuestionsFromDB();

  await db.ref("rooms/" + roomId).set({
    host: playerName,
    players,
    started: false,
    questions: QUESTIONS
  });

  savePlayerState(playerName, roomId, isHost);
  enterLobby();
  renderQRCode(roomId);
}

// --- Hiển thị mã QR ---
function renderQRCode(code) {
  const qrContainer = document.getElementById("qrCode");
  const roomCodeText = document.getElementById("roomCodeText");

  if (!qrContainer) return;

  qrContainer.innerHTML = "";
  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
  new QRCode(qrContainer, { text: joinUrl, width: 180, height: 180 });

  if (roomCodeText) roomCodeText.textContent = code;
}


// --- Tham gia phòng (phiên bản SweetAlert2) ---
function joinRoom() {
  playerName = (nameInput.value || "").trim();
  const code = roomInput.value.trim().toUpperCase();

  if (!code) {
    Swal.fire({
      icon: "warning",
      title: "Thiếu mã phòng",
      text: "Vui lòng nhập mã phòng để tham gia!",
      confirmButtonText: "OK",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  if (!playerName) {
    Swal.fire({
      icon: "warning",
      title: "Thiếu tên người chơi",
      text: "Vui lòng nhập tên của bạn trước khi tham gia!",
      confirmButtonText: "OK",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  roomId = code;
  isHost = false;

  db.ref(`rooms/${roomId}`).once("value").then(snapshot => {
    const roomData = snapshot.val();

    // ⚠️ Phòng không tồn tại
    if (!roomData) {
      Swal.fire({
        icon: "error",
        title: "Phòng không tồn tại!",
        text: "Hãy kiểm tra lại mã phòng hoặc tạo phòng mới.",
        confirmButtonText: "Quay lại",
        confirmButtonColor: "#2563eb"
      }).then(() => {
        lobby.style.display = "none";
        menu.style.display = "flex";
        roomInput.value = "";
      });
      return Promise.reject("Room not found");
    }

    // 🚫 Nếu phòng đã kết thúc thì không cho join
    if (roomData.status === "ended" || roomData.finished === true) {
      Swal.fire({
        icon: "info",
        title: "Phòng đã kết thúc!",
        text: "Hãy tạo phòng mới để chơi lại nhé 🎮",
        confirmButtonText: "OK",
        confirmButtonColor: "#2563eb"
      });
      throw new Error("Room ended");
    }

    // ✅ Nếu phòng tồn tại
    if (roomData.questions) QUESTIONS = roomData.questions;

    const existingPlayers = roomData.players ? Object.keys(roomData.players) : [];

    // 🚫 Kiểm tra trùng tên
    if (existingPlayers.includes(playerName)) {
      Swal.fire({
        icon: "warning",
        title: "Tên đã tồn tại!",
        html: `Người chơi có tên <b style="color:#2563eb;">"${playerName}"</b> đã ở trong phòng.<br>Vui lòng chọn tên khác.`,
        confirmButtonText: "Đổi tên",
        confirmButtonColor: "#2563eb"
      });
      throw new Error("Duplicate name");
    }

    savePlayerState(playerName, roomId, isHost);

    const playerRef = db.ref(`rooms/${roomId}/players/${playerName}`);

    // 🕒 Lưu thông tin người chơi mới
    playerRef.set({
      score: 0,
      totalTime: 0,
      joinedAt: Date.now()
    });

    // 🧹 Xóa người chơi khi thoát / reload
    playerRef.onDisconnect().remove();

    return playerRef;
  })
  .then(() => {
    // ✅ Vào sảnh nếu join thành công
    enterLobby();
    Swal.fire({
      icon: "success",
      title: "Tham gia thành công 🎉",
      text: `Chào mừng ${playerName} vào phòng ${roomId}!`,
      timer: 1500,
      showConfirmButton: false
    });
  })
  .catch(err => {
    if (err.message !== "Duplicate name") console.log("Join failed:", err);
  });
}




// --- Vào sảnh ---
function enterLobby() {
  menu.style.display = "none";
  lobby.style.display = "block";
  roomCodeLabel.innerText = "Mã phòng: " + roomId;

  // ✅ Hiển thị mã QR nếu là Host
  renderQRCode(roomId);
  // --- Hiển thị tên người chơi hiện tại và số người trong phòng ---
let infoLobby = document.getElementById("playerInfoLobby");
if (!infoLobby) {
  infoLobby = document.createElement("p");
  infoLobby.id = "playerInfoLobby";
  lobby.insertBefore(infoLobby, document.getElementById("players"));
}

db.ref(`rooms/${roomId}/players`).on("value", snap => {
  const players = snap.val() || {};
  const total = Object.keys(players).length;
  // Cập nhật thông tin
const oldText = infoLobby.innerHTML;
const newText = `👤 Bạn: <b>${playerName}</b> | 👥 Người trong phòng: <b>${total}</b>`;

if (oldText !== newText) {
  infoLobby.innerHTML = newText;

  // Hiệu ứng nhấp sáng khi thay đổi số lượng
  infoLobby.classList.add("pulse-change");
  setTimeout(() => infoLobby.classList.remove("pulse-change"), 500);
}

});

  // --- Lấy thông tin Host ---
  db.ref(`rooms/${roomId}/host`).once("value", s => {
    const h = s.val();
    hostLabel.innerText = "Host: " + (h || "(chưa xác định)");
    if (isHost && h !== playerName) isHost = (h === playerName);
    if (isHost) hostControls.style.display = "block";
  });

  // ✅ Thêm dòng hiển thị tên người chơi hiện tại & tổng số người
  let infoEl = document.getElementById("playerInfoLobby");
  if (!infoEl) {
    infoEl = document.createElement("p");
    infoEl.id = "playerInfoLobby";
    infoEl.style.margin = "8px 0 10px";
    infoEl.style.fontWeight = "500";
    infoEl.style.color = "#333";
    infoEl.style.fontSize = "16px";
    lobby.insertBefore(infoEl, document.getElementById("players"));
  }

  // --- Lấy danh sách người chơi và hiển thị ---
  db.ref(`rooms/${roomId}/players`).on("value", snap => {
    const data = snap.val() || {};

    // 🔹 Sắp xếp theo thời gian vào (joinedAt)
    const sortedPlayers = Object.entries(data)
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));

    // 🔹 Sinh HTML cho danh sách người chơi
    const list = sortedPlayers.map(([name, info], i) => {
      const isHostPlayer = (name === hostLabel.innerText.replace("Host: ", ""));
      return `
        <div class="player-card ${isHostPlayer ? "host-player" : ""}">
          <span class="player-rank">${i + 1}</span>
          <span class="player-name">${name}</span>
          <span class="player-score">${info.score || 0} điểm</span>
        </div>
      `;
    }).join("");

    // 🔹 Gán vào DOM
    playersDiv.innerHTML = `
      <h3 style="margin-bottom:10px;">👥 Người chơi (${sortedPlayers.length})</h3>
      <div class="player-list">${list}</div>
    `;

    // 🔹 Cập nhật thông tin tên + tổng số người
    infoEl.textContent = `👤 Bạn: ${playerName} | 👥 Tổng: ${sortedPlayers.length} người`;
  });

  // --- Khi host bấm bắt đầu ---
  db.ref(`rooms/${roomId}/started`).on("value", snap => {
    const started = snap.val();
    if (started) {
      lobby.style.display = "none";
      gameArea.style.display = "block";
      roomTitle.innerText = `Phòng ${roomId}${isHost ? " (Host)" : ""}`;

    // 🎵 Khi game bắt đầu: phát nhạc nền cho tất cả
try {
  if (!window.backgroundMusic) {
    window.backgroundMusic = new Audio("music/background.mp3"); // đúng tên file của bạn
    window.backgroundMusic.loop = true;
    window.backgroundMusic.volume = 0.9;
  }
  window.backgroundMusic.play().catch(function(err) {
    console.log("⚠️ Không thể phát nhạc nền ngay (chưa có tương tác):", err);
  });
} catch (e) {
  console.log("Lỗi khi phát nhạc nền:", e);
}

      // --- Hiển thị tên người chơi và số lượng người đang trong phòng ---
const playerInfo = document.getElementById("playerInfo");
db.ref(`rooms/${roomId}/players`).on("value", snap => {
  const players = snap.val() || {};
  const totalPlayers = Object.keys(players).length;
  playerInfo.innerHTML = `👤 Bạn: <b>${playerName}</b> | 👥 Đang chơi: <b>${totalPlayers}</b>`;
});

      listenToQuestion();
      listenToTimer();
      listenToFinish();
    }
  });
}



// --- Host bắt đầu game ---
startGameBtn.onclick = async () => {
  if (!isHost) return;
  startGameBtn.disabled = true; // tránh bấm nhiều lần

  // 🎬 Hiệu ứng đếm ngược trước khi bắt đầu
  const countdown = document.getElementById("countdownOverlay");
  const numberEl = document.getElementById("countdownNumber");
  countdown.style.display = "flex";

  let counter = 3;

  function showNumber(n) {
    numberEl.textContent = n;
    numberEl.style.animation = "none";
    void numberEl.offsetWidth; // reset animation
    numberEl.style.animation = "zoomInOut 1s ease forwards";

    // 🔔 Âm thanh beep nhỏ cho mỗi số (nếu có)
    try {
      const beep = new Audio("music/beep.mp3");
      beep.volume = 0.5;
      beep.play().catch(() => {});
    } catch (e) {}
  }

  showNumber(counter);

  const interval = setInterval(async () => {
    counter--;
    if (counter > 0) {
      showNumber(counter);
    } else {
      clearInterval(interval);
      countdown.style.display = "none";

      // 🟢 Bắt đầu phát nhạc nền sau khi đếm xong
      try {
        if (window.backgroundMusic) {
          window.backgroundMusic.currentTime = 0;
          window.backgroundMusic.play().catch(err => console.log("Autoplay blocked:", err));
        }
      } catch (e) {
        console.log("Không thể phát nhạc nền:", e);
      }

      // 🚀 Kiểm tra câu hỏi
      if (QUESTIONS.length === 0) {
        alert("⚠️ Không tìm thấy câu hỏi trong Firebase.\nHãy kiểm tra mục 'questions'!");
        return;
      }

      // 🔥 Cập nhật trạng thái để tất cả client cùng bắt đầu
      await db.ref(`rooms/${roomId}`).update({
        started: true,
        currentIndex: 0,
        music: "background" // để client biết phát nhạc nền
      });

      // 🧠 Bắt đầu câu hỏi đầu tiên
      await setQuestion(0);
      startTimer(QUESTION_TIME);
    }
  }, 1000);
};


// --- Đặt câu hỏi ---
function setQuestion(index) {
  const q = QUESTIONS[index];
  if (!q) return finishGame();
  return db.ref(`rooms/${roomId}/question`).set({
    text: q.q,
    options: q.options,
    correct: q.correct
  }).then(() => db.ref(`rooms/${roomId}/answers`).remove());
}

// --- Lắng nghe câu hỏi ---
function listenToQuestion() {
  db.ref(`rooms/${roomId}/question`).on("value", snap => {
    const q = snap.val();
    if (!q) return;
    questionStartTime = Date.now();
    renderQuestion(q);
  });
}

// --- Hiển thị câu hỏi ---
function renderQuestion(q) {
  myAnswered = false;
  myChoice = null;
  afterAnswer.style.display = "none";
  nextBtn.style.display = isHost ? "block" : "none";
  questionText.innerText = q.text;
  optionsDiv.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.innerText = String.fromCharCode(65 + i) + ". " + opt;
    btn.className = "option-btn";
    btn.onclick = () => selectOption(btn, i, q.correct);
    optionsDiv.appendChild(btn);
  });
}

// --- Khi chọn đáp án ---
function selectOption(btn, index, correct) {
  myChoice = index;

  // Xóa class "selected" khỏi các nút khác
  const buttons = optionsDiv.querySelectorAll("button");
  buttons.forEach(b => b.classList.remove("selected"));

  // Đánh dấu nút hiện tại
  btn.classList.add("selected");

  // Ghi lại lựa chọn mới vào database
  const timeTaken = Date.now() - questionStartTime;
  db.ref(`rooms/${roomId}/answers/${playerName}`).set({ choice: index, time: timeTaken });

  // Lưu lại để hiển thị review sau này
  const existing = myReview.find(r => r.question === questionText.innerText);
  if (existing) {
    existing.chosen = index;
  } else {
    myReview.push({
      question: questionText.innerText,
      options: Array.from(buttons).map(b => b.innerText),
      correct,
      chosen: index
    });
  }
}


// --- Host đếm ngược ---
function startTimer(seconds) {
  if (!isHost) return;
  db.ref(`rooms/${roomId}/timer`).set(seconds);
  let s = seconds;
  clearInterval(localTimerInterval);
  localTimerInterval = setInterval(() => {
    s--;
    db.ref(`rooms/${roomId}/timer`).set(s);
    if (s <= 0) {
      clearInterval(localTimerInterval);
      evaluateAnswersThenProceed();
    }
  }, 1000);
}

// --- Người chơi xem timer ---
function listenToTimer() {
  db.ref(`rooms/${roomId}/timer`).on("value", snap => {
    const t = snap.val();
    timerSpan.innerText = t ?? "--";
  });
}

// --- Chấm điểm ---
function evaluateAnswersThenProceed() {
  const roomRef = db.ref(`rooms/${roomId}`);
  roomRef.once("value").then(snap => {
    const data = snap.val();
    if (!data) return;
    const question = data.question;
    const correctIndex = question.correct;
    const answers = data.answers || {};
    const players = data.players || {};
    const updates = {};

    Object.keys(players).forEach(p => {
      const ans = answers[p];
      let score = players[p].score || 0;
      let totalTime = players[p].totalTime || 0;
      if (ans) {
        totalTime += ans.time || 0;
        if (ans.choice === correctIndex) score++;
      }
      updates[`rooms/${roomId}/players/${p}/score`] = score;
      updates[`rooms/${roomId}/players/${p}/totalTime`] = totalTime;
    });

    updates[`rooms/${roomId}/answers`] = null;

    db.ref().update(updates).then(() => {
      db.ref(`rooms/${roomId}/currentIndex`).once("value").then(snap2 => {
        let idx = snap2.val() || 0;
        idx++;
        if (idx >= QUESTIONS.length) {
          db.ref(`rooms/${roomId}/finished`).set(true);
          // 🔒 Đánh dấu phòng đã kết thúc để chặn người khác join
          db.ref(`rooms/${roomId}/status`).set("ended");
        } else {
          db.ref(`rooms/${roomId}/currentIndex`).set(idx);
          setQuestion(idx);
          startTimer(QUESTION_TIME);
        }
        
      });
    });
  });
}


// --- Lắng nghe khi game kết thúc ---
function listenToFinish() {
  db.ref(`rooms/${roomId}/finished`).on("value", snap => {
    const finished = snap.val();
    if (!finished) return;

    // 🛑 Dừng nhạc nền khi trò chơi kết thúc
    if (window.backgroundMusic) {
      window.backgroundMusic.pause();
      window.backgroundMusic.currentTime = 0;
    }

    // 🎬 Hiệu ứng đếm ngược trước khi hiển thị bảng xếp hạng
    const countdown = document.getElementById("countdownOverlay");
    const numberEl = document.getElementById("countdownNumber");
    countdown.style.display = "flex";

    let counter = 3;

    // 🔁 Hiển thị số đếm ngược
    function showNumber(n) {
      numberEl.textContent = n;
      numberEl.style.animation = "none";
      void numberEl.offsetWidth; // ép reflow để reset animation
      numberEl.style.animation = "zoomInOut 1s ease forwards";
    }

    showNumber(counter);

    // Đảm bảo không tạo nhiều interval nếu gọi lại
    if (numberEl._countdownInterval) {
      clearInterval(numberEl._countdownInterval);
      numberEl._countdownInterval = null;
    }

    numberEl._countdownInterval = setInterval(() => {
      counter--;
      if (counter > 0) {
        showNumber(counter);
      } else {
        clearInterval(numberEl._countdownInterval);
        numberEl._countdownInterval = null;

        // 🔊 Phát nhạc chiến thắng
        try {
          const victorySound = new Audio("music/victory.mp3"); // đúng tên file của bạn
          victorySound.volume = 0.8;
          victorySound.play().catch(err => console.log("Không phát được âm thanh:", err));
        } catch (e) {
          console.log("Lỗi âm thanh:", e);
        }

        // 🎆 Hiệu ứng pháo hoa Confetti
        launchConfetti();

        // Hiển thị bảng xếp hạng
        setTimeout(() => {
          countdown.style.display = "none";
          showLeaderboard();
        }, 1000);
      }
    }, 1000);
  });
}


// --- 🎇 Hàm bắn pháo hoa confetti ---
function launchConfetti() {
  // Thêm thư viện confetti từ CDN nếu chưa có
  if (typeof confetti === "undefined") {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.onload = () => fireConfettiEffect();
    document.body.appendChild(script);
  } else {
    fireConfettiEffect();
  }
}

function fireConfettiEffect() {
  const duration = 4000; // thời gian hiệu ứng 4s
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 5,
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      origin: {
        x: Math.random(),
        y: Math.random() - 0.2
      }
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}



// --- Bảng xếp hạng ---
function showLeaderboard() {
// 🔊 Phát nhạc chiến thắng khi hiển thị bảng xếp hạng
  try {
    const victorySound = new Audio("music/victory.mp3");
    victorySound.volume = 0.7;
    victorySound.play().catch(err => console.log("Không thể phát nhạc:", err));
  } catch (e) {
    console.log("Không phát được âm thanh chiến thắng:", e);
  }
  // Ẩn phần câu hỏi cũ
  questionText.innerHTML = "";
  optionsDiv.innerHTML = "";
  nextBtn.style.display = "none";
  afterAnswer.style.display = "none";

  leaderboardDiv.style.display = "block";
  leaderboardDiv.innerHTML = `<h3>Đang tải bảng xếp hạng...</h3>`;

  db.ref(`rooms/${roomId}/players`).once("value").then(snapshot => {
    const players = snapshot.val() || {};
    const sorted = Object.entries(players)
      .map(([name, p]) => ({
        name,
        score: p.score || 0,
        totalTime: p.totalTime ? (p.totalTime / 1000).toFixed(1) : "0.0"
      }))
      .sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);

    // 💎 HTML đẹp hơn
    leaderboardDiv.innerHTML = `
      <h2 style="font-size:28px; margin-bottom:20px;">🏁 Bảng Xếp Hạng</h2>
      <div id="board" class="leaderboard-board">
        ${sorted.map((p, i) => `
          <div class="leaderboard-item top${i + 1}">
            <span class="medal">${
              i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏅"
            }</span>
            <strong>${i + 1}. ${p.name}</strong> — 
            ${p.score} điểm 
            <small>(${p.totalTime}s)</small>
          </div>
        `).join("")}
      </div>
      <div style="margin-top:24px;">
        <button id="reviewBtn" class="btn">📖 Xem lại đáp án</button>
        <button id="backBtn" class="btn">🔄 Quay lại menu</button>
      </div>
    `;

    document.getElementById("reviewBtn").onclick = showReview;
    document.getElementById("backBtn").onclick = () => location.reload();
  });
}


// --- Xem lại đáp án ---
function showReview() {
  leaderboardDiv.style.display = "none";
  reviewDiv.style.display = "block";

  // 🔹 Nếu người chơi có dữ liệu myReview thì hợp nhất với toàn bộ câu hỏi
  if (myReview.length > 0) {
    const merged = QUESTIONS.map((q, i) => {
      const existing = myReview[i];
      return existing
        ? existing
        : { question: q.q, options: q.options, correct: q.correct, chosen: null };
    });
    renderReview(merged);
  } else {
    // 🔹 Nếu người chơi chưa trả lời câu nào vẫn hiển thị tất cả câu hỏi
    const fallback = QUESTIONS.map(q => ({
      question: q.q,
      options: q.options,
      correct: q.correct,
      chosen: null
    }));
    renderReview(fallback);
  }
}

function renderReview(list) {
  reviewList.innerHTML = list.map((r, i) => `
    <div class="review-item">
      <h3>Câu ${i + 1}: ${r.question}</h3>
      ${r.options.map((opt, j) => {
        let cls = "";
        if (j === r.correct) cls = "correct";
        else if (r.chosen === j) cls = "wrong";
        else if (r.chosen === null && j === r.correct) cls = "correct";
        return `<p class="${cls}">${opt}</p>`;
      }).join("")}
      ${r.chosen === null ? `<p style="color:#991b1b; font-style:italic;">❌ Bạn chưa chọn đáp án</p>` : ""}
    </div>
  `).join("");
}


// --- Tự điền mã phòng nếu có ?room=CODE ---
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get("room");
  if (roomCode) {
    const roomInput = document.getElementById("roomInput");
    if (roomInput) roomInput.value = roomCode.toUpperCase();
  }
});
