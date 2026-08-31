// A static file server for the smoke test and its probes. Two jobs beyond
// handing over files: it serves whichever directory it is pointed at -- the
// repository itself, or a scratch directory holding a planted or rewritten
// copy of index.html -- and it holds any request under /hang/ open without
// ever answering it.
//
// The hang path is what the runtime-timeout probes point the page's own webR
// URLs at. A request that never settles is the failure the runtime timeout
// exists for; a 404 or a refused connection is not, since those reject and the
// page has had a branch for that since before the timeout was added.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export async function serveDir(dir) {
  const root = path.resolve(dir);
  // Held responses are kept so close() can destroy them: a request that is
  // never answered also never releases its socket, and the server would not
  // close with one still open.
  const held = new Set();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/hang/')) {
      held.add(res);
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      for (const res of held) res.destroy();
      held.clear();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
