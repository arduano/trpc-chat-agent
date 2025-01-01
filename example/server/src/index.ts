/* eslint-disable perfectionist/sort-imports */
import './env';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { createContext } from './context';
import router from './router';

// Create HTTP server
const { server, listen } = createHTTPServer({
  router,
  createContext,
});

// Create WebSocket server
const wss = new WebSocketServer({ server });
applyWSSHandler({ wss, router, createContext });

// Start server
listen(3000);
console.info('Server listening on http://localhost:3000');
console.info('WebSocket server listening on ws://localhost:3000');
