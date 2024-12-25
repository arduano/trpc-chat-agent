import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import router from './router';

// Create HTTP server
const { server, listen } = createHTTPServer({
  router,
});

// Create WebSocket server
const wss = new WebSocketServer({ server });
applyWSSHandler({ wss, router });

// Start server
listen(3000);
console.log('Server listening on http://localhost:3000');
console.log('WebSocket server listening on ws://localhost:3000');
