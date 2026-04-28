/**
 * Tiny local HTTP server used to test CobaltClient without a mocking library.
 * Returns whatever the test registered for a given path.
 */
import http from 'http';
import { AddressInfo } from 'net';

export type Handler = (req: http.IncomingMessage, body: string) => {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
};

export interface FakeServer {
  url: string;
  requests: { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }[];
  on(path: string, handler: Handler): void;
  close(): Promise<void>;
}

export async function startFakeServer(): Promise<FakeServer> {
  const handlers = new Map<string, Handler>();
  const requests: FakeServer['requests'] = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const pathOnly = (req.url || '').split('?')[0];
      requests.push({
        method: req.method || 'GET',
        url: req.url || '',
        headers: req.headers,
        body,
      });
      const handler = handlers.get(pathOnly);
      if (!handler) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'no handler registered for ' + pathOnly }));
        return;
      }
      const out = handler(req, body);
      if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
      res.writeHead(out.status, {
        'content-type': 'application/json',
        ...(out.headers || {}),
      });
      res.end(out.body === undefined ? '' : JSON.stringify(out.body));
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    on(path, handler) {
      handlers.set(path, handler);
    },
    close: () =>
      new Promise<void>((r, j) => {
        // Force-terminate any in-flight requests so tests with timeouts don't hang.
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        server.close((err) => (err ? j(err) : r()));
      }),
  };
}
