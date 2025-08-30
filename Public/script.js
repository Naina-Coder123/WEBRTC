// script.js - client side
const roomInput = document.getElementById("room-id");
const joinBtn = document.getElementById("join-btn");
const shareBtn = document.getElementById("share-btn");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

const toggleAudioBtn = document.getElementById("toggle-audio");
const toggleVideoBtn = document.getElementById("toggle-video");
const shareScreenBtn = document.getElementById("share-screen");
const recordBtn = document.getElementById("record");
const endCallBtn = document.getElementById("end-call");

const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const toast = document.getElementById("toast");
function showToast(msg){ toast.textContent = msg; toast.hidden = false; setTimeout(()=> toast.hidden = true, 2500); }

// state
let localStream = null;
let pc = null;
let ws = null;
let dataChannel = null;
let roomId = null;
let recorder = null;
let chunks = [];

// STUN config
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// helper: connect WS with proper protocol
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${proto}//${location.host}`);
}

// join room
joinBtn.onclick = async () => {
  roomId = roomInput.value.trim() || Math.random().toString(36).slice(2,8);
  roomInput.value = roomId;
  statusEl.textContent = "Joining...";
  try {
    // get media first
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    ws = connectWS();

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", room: roomId }));
    };

    ws.onmessage = async (evt) => {
      const data = JSON.parse(evt.data);
      switch (data.type) {
        case "joined":
          statusEl.textContent = `Joined ${data.room} (peers: ${data.peers})`;
          break;
        case "initiate":
          // we are the first peer; create offer
          await ensurePC();
          createDataChannel();
          await makeAndSendOffer();
          break;
        case "ready":
          // second peer ready, but we only act when we receive 'initiate' to avoid race
          statusEl.textContent = "Peer present, waiting for connection...";
          break;
        case "offer":
          await ensurePC();
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "answer", answer, room: roomId }));
          break;
        case "answer":
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          break;
        case "candidate":
          if (pc) {
            try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
            catch(e){ console.warn("Candidate add failed", e); }
          }
          break;
        case "leave":
          showToast("Peer left");
          cleanupPeer(false);
          break;
        case "full":
          alert("Room is full (max 2 participants).");
          break;
        case "error":
          showToast(data.message || "Error from server");
          break;
      }
    };
  } catch (err) {
    console.error("Could not get local media:", err);
    alert("Please allow camera/microphone and try again.");
    statusEl.textContent = "Media error";
  }
};

// ensure RTCPeerConnection exists
async function ensurePC() {
  if (pc) return;
  pc = new RTCPeerConnection(config);

  // add local tracks
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // remote tracks
  pc.ontrack = (evt) => {
    if (!remoteVideo.srcObject) remoteVideo.srcObject = evt.streams[0];
  };

  // ICE candidates -> send to other peer via WS
  pc.onicecandidate = (ev) => {
    if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "candidate", candidate: ev.candidate, room: roomId }));
    }
  };

  // when remote creates a datachannel (if we are not initiator)
  pc.ondatachannel = (ev) => {
    dataChannel = ev.channel;
    setupDataChannel();
  };
}

// initiator creates data channel
function createDataChannel() {
  if (!pc) return;
  dataChannel = pc.createDataChannel("chat");
  setupDataChannel();
}

function setupDataChannel() {
  if (!dataChannel) return;
  dataChannel.onopen = () => showToast("Chat ready");
  dataChannel.onmessage = (ev) => {
    const div = document.createElement("div");
    div.textContent = `Peer: ${ev.data}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  };
}

// offer creation
async function makeAndSendOffer() {
  if (!pc) await ensurePC();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer, room: roomId }));
}

// chat form
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = chatInput.value.trim();
  if (!txt) return;
  const div = document.createElement("div");
  div.textContent = `Me: ${txt}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  if (dataChannel && dataChannel.readyState === "open") dataChannel.send(txt);
  else showToast("Chat not connected yet");
  chatInput.value = "";
});

// UI controls
toggleAudioBtn.onclick = () => {
  if (!localStream) return;
  const t = localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  toggleAudioBtn.textContent = t.enabled ? "🎤" : "🔇";
};

toggleVideoBtn.onclick = () => {
  if (!localStream) return;
  const t = localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  toggleVideoBtn.textContent = t.enabled ? "🎥" : "📷";
};

shareScreenBtn.onclick = async () => {
  if (!pc) { showToast("Start or join a call first"); return; }
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    // replace the outgoing video track
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) await sender.replaceTrack(screenTrack);
    showToast("Screen shared");
    screenTrack.onended = async () => {
      // restore camera
      const camTrack = localStream.getVideoTracks()[0];
      if (sender && camTrack) await sender.replaceTrack(camTrack);
      showToast("Screen sharing stopped");
    };
  } catch (e) {
    console.error("Screen share failed:", e);
  }
};

// recording local stream to file
recordBtn.onclick = () => {
  if (!localStream) { showToast("No local stream"); return; }
  if (!recorder) {
    recorder = new MediaRecorder(localStream);
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "recording.webm"; a.click();
      URL.revokeObjectURL(url);
      recorder = null;
      showToast("Recording saved");
    };
    recorder.start(1000);
    recordBtn.textContent = "⏹";
    showToast("Recording...");
  } else {
    recorder.stop();
    recordBtn.textContent = "⏺";
  }
};

endCallBtn.onclick = () => {
  cleanupPeer(true);
  statusEl.textContent = "Call ended";
};

// cleanup
function cleanupPeer(keepMedia = false) {
  try { if (ws) ws.close(); } catch (e) {}
  try { if (pc) pc.close(); } catch (e) {}
  dataChannel = null;
  pc = null;
  ws = null;
  if (!keepMedia) {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
  }
}

// share link button
shareBtn.onclick = () => {
  const url = `${location.origin}?room=${encodeURIComponent(roomInput.value || roomId || "")}`;
  navigator.clipboard.writeText(url).then(()=> showToast("Link copied to clipboard")).catch(()=> showToast("Copy failed"));
};

// auto-join via URL ?room=XXXX
(function autoJoin() {
  const params = new URLSearchParams(location.search);
  const r = params.get("room");
  if (r) {
    roomInput.value = r;
    joinBtn.click();
  }
})();
