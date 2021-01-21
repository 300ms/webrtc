const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const socket = require('socket.io');
const io = socket(server);
const path = require('path');
require('dotenv').config();

const rooms = {};

io.on('connection', socket => {
  // Join room event listener
  socket.on('join room', roomID => {
    // If, room already exists, push user id into rooms
    // Else, room does not exist, create a new rooms array and assign first element to user id
    if (rooms[roomID]) {
      rooms[roomID].push(socket.id);
    } else {
      rooms[roomID] = [socket.id];
    }

    // Find other user
    const otherUser = rooms[roomID].find(id => id !== socket.id);         

    // If, other user exists
    // 1- Tell to the user that there is already another user in the room
    // 2- Tell to the other user that, new user joined 
    if(otherUser) {
      socket.emit('other user', otherUser);
      socket.to(otherUser).emit('user joined', socket.id);
    }
  });

  // Offer event listener
  socket.on('offer', payload => {
    // Payload includes two important fields
    // 1. Who am I as the caller
    // 2. Offer objects
    io.to(payload.target).emit('offer', payload);
  });

  // Answer event listener
  socket.on('answer', payload => {
    io.to(payload.target).emit('answer', payload);
  });

  // Ice servers concept
  socket.on('ice-candidate', incoming => {
    io.to(incoming.target).emit('ice-candidate', incoming.candidate);
  });
});

// If server is working in production mode,
if (process.env.PROD) {
  // Serve staticly to this path
  app.use(express.static(path.join(__dirname, './client/build')));
  // Send all requests to this path
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './client/build/index.html'));
  });
}

const port = process.env.PORT || 8000;
server.listen(port, () => console.log(`Server is running on port ${port}...`));
