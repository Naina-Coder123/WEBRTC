// DOM Elements
const joinScreen = document.getElementById("join-screen");
const meetingScreen = document.getElementById("meeting-screen");
const joinBtn = document.getElementById("join-btn");
const roomInput = document.getElementById("room-id-input");
const shareLinkBtn = document.getElementById("share-link-btn");
const toggleThemeBtn = document.getElementById("toggle-theme");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const toggleVideoBtn = document.getElementById("toggle-video");
const toggleAudioBtn = document.getElementById("toggle-audio");
const recordBtn = document.getElementById("toggle-record");
const pauseRecordBtn = document.getElementById("pause-record");
const endCallBtn = document.getElementById("end-call");
const timerSpan = document.getElementById("timer");
const connStatus = document.getElementById("conn-status");

const joinSound = document.getElementById("join-sound");
const leaveSound = document.getElementById("leave-sound");

let localStream, pc, ws, roomId;
let recorder, recordedChunks = [], recording = false, paused = false;
let secondsElapsed = 0, timerInterval;
let darkMode = true;

// Notifications
function showNotification(msg){
  const n = document.createElement('div');
  n.className='notification';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => document.body.removeChild(n), 4000);
}

// Timer
function startTimer() {
  secondsElapsed = 0;
  timerInterval = setInterval(() => {
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const secs = String(secondsElapsed % 60).padStart(2, '0');
    timerSpan.textContent = `${mins}:${secs}`;
    secondsElapsed++;
  }, 1000);
}
function stopTimer(){ clearInterval(timerInterval); }

// Get local media
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch(err) {
    alert("Error accessing camera/microphone: " + err.message);
    console.error(err);
  }
}

// Recording
recordBtn.addEventListener("click", () => {
  if (!localStream) return showNotification("Local stream not ready");
  if (!recording) {
    recorder = new MediaRecorder(localStream);
    recordedChunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recording.webm";
      a.click();
      stopTimer(); paused = false; pauseRecordBtn.textContent = "⏸";
    };
    recorder.start(1000);
    recording = true; recordBtn.textContent = "⏹ Stop";
    startTimer();
  } else {
    recorder.stop();
    recording = false; recordBtn.textContent = "⏺ Record";
  }
});
pauseRecordBtn.addEventListener("click", () => {
  if (!recorder) return;
  if (!paused) { recorder.pause(); paused = true; pauseRecordBtn.textContent = "▶️ Resume"; }
  else { recorder.resume(); paused = false; pauseRecordBtn.textContent = "⏸"; }
});

// Toggle video/audio
toggleVideoBtn.addEventListener("click", () => { 
  if (!localStream) return;
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  showNotification(localStream.getVideoTracks()[0].enabled ? "Video Unmuted" : "Video Muted");
});
toggleAudioBtn.addEventListener("click", () => { 
  if (!localStream) return;
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  showNotification(localStream.getAudioTracks()[0].enabled ? "Audio Unmuted" : "Audio Muted");
});

// Dark/Light mode
toggleThemeBtn.addEventListener("click", () => {
  darkMode = !darkMode;
  document.documentElement.style.setProperty('--bg-color', darkMode ? '#1e1c2c' : '#f7f9fc');
  document.documentElement.style.setProperty('--text-color', darkMode ? '#fff' : '#333');
  document.documentElement.style.setProperty('--btn-bg', darkMode ? '#00c6ff' : '#0077cc');
});

// Draggable videos
function makeDraggable(video){
  let offsetX=0, offsetY=0, isDragging=false;
  video.addEventListener('mousedown', e => { 
    isDragging = true;
    offsetX = e.clientX - video.getBoundingClientRect().left;
    offsetY = e.clientY - video.getBoundingClientRect().top;
    video.style.position = 'absolute';
    video.style.zIndex = 1000;
    video.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => { 
    if (!isDragging) return;
    video.style.left = (e.clientX - offsetX) + 'px';
    video.style.top = (e.clientY - offsetY) + 'px';
  });
  document.addEventListener('mouseup', () => { 
    isDragging = false;
    video.style.cursor = 'grab';
  });
}
makeDraggable(localVideo); 
makeDraggable(remoteVideo);

// Active speaker indicator
function monitorAudio(stream, videoElem){
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 512;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  function checkVolume(){
    analyser.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a,b) => a+b, 0)/dataArray.length;
    if (sum>10) videoElem.classList.add('active-speaker');
    else videoElem.classList.remove('active-speaker');
    requestAnimationFrame(checkVolume);
  }
  checkVolume();
}

// WebRTC
function createPeerConnection(){
  pc = new RTCPeerConnection();
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  monitorAudio(localStream, localVideo);

  pc.ontrack = e => { 
    remoteVideo.srcObject = e.streams[0]; 
    monitorAudio(e.streams[0], remoteVideo); 
    connStatus.textContent = "Connected"; 
  };

  pc.oniceconnectionstatechange = () => { 
    if (pc.iceConnectionState === "disconnected") connStatus.textContent = "Disconnected"; 
  };

  pc.onicecandidate = e => { 
    if (e.candidate && ws && ws.readyState === WebSocket.OPEN) 
      ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate })); 
  };
}

async function handleOffer(offer){
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", answer: pc.localDescription }));
}

async function handleAnswer(answer){
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(candidate){
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

// Join room
async function joinRoom(id){
  try {
    roomId = id || roomInput.value.trim() || Math.random().toString(36).substring(2,8);
    roomInput.value = roomId;
    await getLocalStream();
    createPeerConnection(); // create PC first
    joinScreen.classList.add("hidden");
    meetingScreen.classList.remove("hidden");
    showNotification("You joined the meeting!");

    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${wsProtocol}//${location.host}`);

    ws.onopen = () => ws.send(JSON.stringify({ type: "join", room: roomId }));
    ws.onmessage = async msg => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "full") return alert("Room is full!");
        if (data.type === "join") { showNotification("Participant joined!"); joinSound.play(); }
        if (data.type === "leave") { showNotification("Participant left!"); leaveSound.play(); connStatus.textContent="Disconnected"; }
        if (data.type === "offer") await handleOffer(data.offer);
        if (data.type === "answer") await handleAnswer(data.answer);
        if (data.type === "candidate") await handleCandidate(data.candidate);
      } catch(err) { console.error("WebSocket message error:", err); }
    };

  } catch(err) { console.error("joinRoom error:", err); showNotification("Error joining room"); }
}

// Join button
joinBtn.addEventListener("click", () => joinRoom());

// Share link
shareLinkBtn.addEventListener("click", () => {
  let linkRoomId = roomInput.value.trim() || Math.random().toString(36).substring(2,8);
  roomInput.value = linkRoomId;
  const url = `${window.location.origin}?room=${linkRoomId}`;
  if (navigator.share) {
    navigator.share({ title: "Join my meeting", text: "Click link to join my P2P meeting", url }).catch(err => console.log(err));
  }
  navigator.clipboard.writeText(url).then(() => showNotification("✅ Room link copied!")).catch(() => showNotification("❌ Failed to copy link."));
});

// Auto-join via URL
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) joinRoom(roomParam);

// End Call
endCallBtn.addEventListener("click", () => {
  if(pc) pc.close(); 
  if(ws) ws.close();
  meetingScreen.classList.add("hidden"); 
  joinScreen.classList.remove("hidden");
  connStatus.textContent = "Not Connected";
});
