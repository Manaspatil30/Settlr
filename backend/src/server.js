require('dotenv').config();
const http    = require('http');
const app     = require('./app');
const { initSocket } = require('./config/socket');

const PORT = process.env.PORT || 5000;

// Create HTTP server so Socket.io can share it
const server = http.createServer(app);

// Attach Socket.io
initSocket(server);

server.listen(PORT, () => {
  console.log(`\n🚀 Settlr backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   http://localhost:${PORT}\n`);
});
