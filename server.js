// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// Simple in-memory rooms map: { roomId: [ws, ...] }
const rooms = {};

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error("Bad JSON:", err);
      return;
    }

    const { type } = data;

    if (type === "join") {
      const room = (data.room || "").trim();
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "missing room" }));
        return;
      }
      currentRoom = room;
      if (!rooms[room]) rooms[room] = [];

      // limit to 2 participants
      if (rooms[room].length >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      rooms[room].push(ws);
      ws.send(JSON.stringify({ type: "joined", room, peers: rooms[room].length }));

      // If now two peers in room, tell the first peer to initiate (create offer).
      if (rooms[room].length === 2) {
        const [first, second] = rooms[room];
        if (first.readyState === WebSocket.OPEN) first.send(JSON.stringify({ type: "initiate" }));
        if (second.readyState === WebSocket.OPEN) second.send(JSON.stringify({ type: "ready" }));
      }
      return;
    }

    // Relay signaling messages (offer/answer/candidate) to other peer(s) in same room
    if (["offer", "answer", "candidate"].includes(type)) {
      if (!currentRoom || !rooms[currentRoom]) return;
      rooms[currentRoom].forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
      return;
    }
  });

  ws.on("close", () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    rooms[currentRoom] = rooms[currentRoom].filter((c) => c !== ws);
    if (rooms[currentRoom].length === 0) {
      delete rooms[currentRoom];
    } else {
      // notify remaining peer
      rooms[currentRoom].forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "leave" }));
        }
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
