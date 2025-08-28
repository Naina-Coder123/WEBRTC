const localVideoRef = document.getElementById("local-video");
const recordBtn = document.getElementById("toggle-record");
const recordingVideoRef = document.getElementById("recording-video");
const timerSpan = document.getElementById("timer");

let stream;
let recording = false;
let recorder;
let recordedChunks = [];
let secondsElapsed = 0;
let timerInterval;

// Get camera + mic
const getStream = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideoRef.srcObject = stream;
    localVideoRef.muted = true;
  } catch (error) {
    console.error("STREAM Error", error);
  }
};
getStream();

// Toggle recording
recordBtn.addEventListener("click", () => {
  if (!stream) return;

  if (!recording) {
    recorder = new MediaRecorder(stream);
    recordedChunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      recordingVideoRef.src = url;
      recordingVideoRef.controls = true;

      // auto-download
      const a = document.createElement("a");
      a.href = url;
      a.download = "recording.webm";
      a.click();

      stopTimer();
    };

    recorder.start(1000); // collect chunks every second
    recording = true;
    recordBtn.textContent = "Stop Recording";
    startTimer();
  } else {
    recorder.stop();
    recording = false;
    recordBtn.textContent = "Start Recording";
  }
});

// Timer functions
const startTimer = () => {
  secondsElapsed = 0;
  timerSpan.textContent = "00:00";

  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const secs = String(secondsElapsed % 60).padStart(2, "0");
    timerSpan.textContent = `${mins}:${secs}`;
  }, 1000);
};

const stopTimer = () => {
  clearInterval(timerInterval);
};
