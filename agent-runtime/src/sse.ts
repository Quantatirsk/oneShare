import type { ServerResponse } from 'node:http';

export function startSse(response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
}

export function writeSseEvent(response: ServerResponse, type: string, payload: unknown): void {
  response.write(`event: ${type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function startHeartbeat(response: ServerResponse, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    response.write(': ping\n\n');
  }, intervalMs);
  return () => clearInterval(timer);
}
