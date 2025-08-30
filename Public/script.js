const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const joinBtn = document.getElementById("join-btn");
const roomInput = document.getElementById("room-id-input");

let localStream;
let peerConnection;
let ws;
let roomId;

// ICE server (STUN) to allow NAT traversal
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// 🎥 Step 1: Get media
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error("Error accessing camera/mic:", err);
  }
}

// 🔗 Step 2: Connect WebSocket signaling server
function connectSignaling() {
  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "offer") {
      await handleOffer(data.offer);
    } else if (data.type === "answer") {
      await handleAnswer(data.answer);
    } else if (data.type === "candidate") {
      await handleCandidate(data.candidate);
    }
  };
}

// 📡 Step 3: Create Peer Connection
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // Add local tracks to peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Listen for remote stream
  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "candidate",
        candidate: event.candidate,
        room: roomId
      }));
    }
  };
}

// 📨 Handle Offer
async function handleOffer(offer) {
  createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({ type: "answer", answer, room: roomId }));
}

// 📨 Handle Answer
async function handleAnswer(answer) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// 📨 Handle ICE Candidate
async function handleCandidate(candidate) {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Error adding ICE candidate", err);
  }
}

// 🔘 Step 4: Join Room
joinBtn.addEventListener("click", async () => {
  roomId = roomInput.value.trim() || Math.random().toString(36).substring(2, 8);
  console.log("Joining room:", roomId);

  connectSignaling();
  await initMedia();

  createPeerConnection();

  // Wait for WS to open, then create offer
  ws.onopen = async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({ type: "offer", offer, room: roomId }));
  };
});
