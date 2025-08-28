// navigator.mediaDevices.getUserMedia({video:true,audio:true})
const localVideoRef = document.getElementById("local-video");
const recordBtn = document.getElementById("toggle-record");
const recordingVideoRef = document.getElementById("recording-video"); // ✅ ensure this <video> exists in HTML
const timerSpan = document.getElementById("timer"); // ✅ ensure <span id="timer"></span> exists in HTML

let stream;
let recording = false;
let recorder;
let recordedChunks = [];
let secondsElapsed = 0;
let timerInterval;

// Get user media (video + audio)
const getStream = async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        console.log("STREAM", stream);
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
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
                // uploadChunksToServer(e.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "video/webm" }); // ✅ fixed Blob
            const url = URL.createObjectURL(blob); // ✅ fixed URL
            recordingVideoRef.src = url; // ✅ playback recorded video
            recordingVideoRef.controls = true;

            downloadedRecordedVideo(url); // auto-download
            stopTimer();
        };

        recorder.start(3000); // fire dataavailable every 3s
        recording = true;
        recordBtn.textContent = "Stop Recording"; // ✅ fixed wrong variable
        startTimer();
    } else {
        recorder.stop();
        recording = false;
        recordBtn.textContent = "Start Recording";
    }
});

// Auto-download helper
const downloadedRecordedVideo = (videoURL) => {
    const a = document.createElement("a");
    a.href = videoURL;
    a.download = "recording.webm";
    a.click();
};

// Timer functions
const startTimer = () => {
    secondsElapsed = 0;
    timerSpan.textContent = "00:00";

    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
        const secs = String(secondsElapsed % 60).padStart(2, "0");
        timerSpan.textContent = `${mins}:${secs}`; // ✅ fixed template string
    }, 1000);
};

const stopTimer = () => {
    clearInterval(timerInterval);
};
