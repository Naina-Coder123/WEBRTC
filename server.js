const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// serve static files from Public/
app.use(express.static(path.join(__dirname, "Public")));

const rooms = {};

// handle websocket connections
wss.on("connection", ws => {
  let currentRoom = null;

  ws.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("Invalid JSON:", err);
      return;
    }

    switch (data.type) {
      case "join":
        currentRoom = data.room;
        if (!rooms[currentRoom]) rooms[currentRoom] = [];

        // Allow max 2 people per room
        if (rooms[currentRoom].length >= 2) {
          ws.send(JSON.stringify({ type: "full" }));
          return;
        }

        rooms[currentRoom].push(ws);

        // Notify the other peer someone joined
        rooms[currentRoom].forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "join" }));
          }
        });
        break;

      case "offer":
      case "answer":
      case "candidate":
        if (currentRoom && rooms[currentRoom]) {
          rooms[currentRoom].forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
        }
        break;

      default:
        console.log("Unknown message type:", data.type);
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(c => c !== ws);

      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      } else {
        // notify remaining peer that one left
        rooms[currentRoom].forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "leave" }));
          }
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
