// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ✅ Serve static files from Public folder
app.use(express.static(path.join(__dirname, "Public")));

// ✅ Route to serve index.html explicitly
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// ✅ WebSocket setup
wss.on("connection", (ws) => {
  console.log("🔗 New WebSocket connection");

  ws.on("message", (message) => {
    console.log("📩 Received:", message.toString());

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });
});

// ✅ Use Render/Heroku PORT or default 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
