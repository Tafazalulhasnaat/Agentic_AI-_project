// --- PARTICLE BACKGROUND ---
function createParticles() {
  const particlesContainer = document.getElementById('particles');
  const particleCount = 30;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');

    const size = Math.random() * 5 + 1;
    const posX = Math.random() * 100;
    const posY = Math.random() * 100;
    const delay = Math.random() * 15;
    const duration = 10 + Math.random() * 20;
    const opacity = Math.random() * 0.5 + 0.1;
    const colors = ['rgba(110, 69, 226, 0.7)', 'rgba(0, 212, 255, 0.7)', 'rgba(255, 255, 255, 0.5)'];

    Object.assign(particle.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${posX}%`,
      top: `${posY}%`,
      opacity,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      background: colors[Math.floor(Math.random() * colors.length)]
    });

    particlesContainer.appendChild(particle);
  }
}
createParticles();

// --- CONFETTI EFFECT ---
function createConfetti() {
  particleEffect.innerHTML = '';
  const colors = ['#6e45e2', '#00d4ff', '#ffffff', '#8d6eff'];

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.classList.add('confetti');
    const size = Math.random() * 10 + 5;
    const posX = Math.random() * 100;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const rotation = Math.random() * 360;
    const duration = 1 + Math.random() * 2;
    const delay = Math.random() * 0.5;

    Object.assign(confetti.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${posX}%`,
      top: '-10px',
      background: color,
      transform: `rotate(${rotation}deg)`,
      borderRadius: Math.random() > 0.5 ? '50%' : '0',
      animation: `confettiFall ${duration}s ease-in ${delay}s forwards`
    });

    particleEffect.appendChild(confetti);
  }

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes confettiFall {
      to {
        transform: translateY(100vh) rotate(${Math.random() * 360}deg);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// --- ELEMENT SELECTORS ---
const recordBtn = document.getElementById('record-btn');
const sendBtn = document.getElementById('send-btn');
const textInput = document.getElementById('text-input');
const statusText = document.getElementById('status');
const chatBox = document.getElementById('chat-box');
const particleEffect = document.getElementById('particle-effect');

let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let chatHistory = [];

// --- VOICE RECORDING ---
recordBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

      isRecording = true;
      mediaRecorder.start();
      recordBtn.classList.add("recording");
      recordBtn.querySelector('i').classList.replace('fa-microphone', 'fa-stop');
      updateStatus("🎤 Recording... Speak now", true);
    } catch (err) {
      handleError("Microphone access denied.", err);
    }
  } else {
    const onStopPromise = new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        updateStatus("🔄 Processing voice input...", true);
        showTypingIndicator();

        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        try {
          const res = await fetch('http://localhost:8000/voice-chat', {
            method: 'POST',
            body: formData
          });

          const data = await res.json();
          removeTypingIndicator();

          if (data.history) {
            updateMessages(data.history);
            updateStatus("✅ Voice reply received", false);
            createConfetti();
          }
        } catch (err) {
          handleError("Voice processing failed.", err);
        }

        resolve();
      };
    });

    isRecording = false;
    mediaRecorder.stop();
    recordBtn.classList.remove("recording");
    recordBtn.querySelector('i').classList.replace('fa-stop', 'fa-microphone');
    mediaRecorder.stream.getTracks().forEach(track => track.stop());

    await onStopPromise;
  }
});

// --- TEXT INPUT ---
sendBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  handleTextSubmit();
});

textInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    handleTextSubmit();
  }
});

async function handleTextSubmit() {
  const text = textInput.value.trim();
  if (!text) return;

  textInput.value = '';
  updateStatus("💬 Processing text input...", true);
  showTypingIndicator();

  addMessage(text, 'user');
  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch("https://agentic-ai-project-tqw8.onrender.com/ask", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text })
    });

    const data = await res.json();
    removeTypingIndicator();

    if (data.history) {
      updateMessages(data.history);
      updateStatus("✅ Text reply received", false);
      createConfetti();
    }
  } catch (err) {
    handleError("Text processing failed.", err);
  }
}

// --- MESSAGE UI ---
function updateMessages(newHistory) {
  const seen = new Set(chatHistory.map(msg => msg.content));
  const newMessages = newHistory.filter(msg => !seen.has(msg.content));

  newMessages.forEach(msg => {
    const audioMatch = msg.content.match(/<source src="([^"]+)"/);
    const audioUrl = audioMatch ? audioMatch[1] : null;
    addMessage(msg.content, msg.role, audioUrl);
    chatHistory.push(msg);
  });
}

function addMessage(text, role, audioUrl = null) {
  const msg = document.createElement('div');
  msg.classList.add('message', role === 'user' ? 'user' : 'ai');

  const avatar = document.createElement('div');
  avatar.classList.add('avatar');
  avatar.innerHTML = role === 'user'
    ? '<i class="fas fa-user-astronaut"></i>'
    : '<i class="fas fa-robot"></i>';

  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  bubble.innerHTML = text;

  if (audioUrl) {
    const audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.controls = true;
    bubble.appendChild(document.createElement('br'));
    bubble.appendChild(audio);
  }

  const time = document.createElement('div');
  time.classList.add('message-time');
  time.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  }).toUpperCase();
  bubble.appendChild(time);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- TYPING INDICATOR ---
function showTypingIndicator() {
  removeTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.id = 'typing-indicator';
  typingDiv.classList.add('message', 'ai');

  const avatar = document.createElement('div');
  avatar.classList.add('avatar');
  avatar.innerHTML = '<i class="fas fa-robot"></i>';

  const bubble = document.createElement('div');
  bubble.classList.add('bubble', 'typing-indicator');
  const typingText = document.createElement('div');
  typingText.classList.add('typing-text');
  typingText.textContent = 'AI is responding...';
  bubble.appendChild(typingText);

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.classList.add('typing-dot');
    bubble.appendChild(dot);
  }

  typingDiv.appendChild(avatar);
  typingDiv.appendChild(bubble);
  chatBox.appendChild(typingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// --- STATUS & ERROR ---
function updateStatus(text, isActive, isError = false) {
  statusText.innerHTML = text;
  statusText.classList.toggle('active', isActive);
  statusText.classList.toggle('error', isError);
}

function handleError(msg, err) {
  removeTypingIndicator();
  addMessage(`❌ ${msg}`, 'ai');
  updateStatus("⚠️ Error occurred", true, true);
  console.error(err);
}
