const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "Public")));

const rooms = {};

wss.on("connection", ws => {
  let currentRoom = null;

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      const roomId = data.room;
      currentRoom = roomId;

      if (!rooms[roomId]) rooms[roomId] = [];
      if (rooms[roomId].length >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      rooms[roomId].push(ws);

      // Notify other participant
      rooms[roomId].forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "join" }));
        }
      });
      return;
    }

    // Relay signaling
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(c => c !== ws);
      if (rooms[currentRoom].length === 0) delete rooms[currentRoom];

      rooms[currentRoom]?.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "leave" }));
        }
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
