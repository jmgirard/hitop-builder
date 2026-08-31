// The two probes for the page's runtime timeout, which bounds the pair of
// steps that fetch R itself: the `import(WEBR_URL)` of webr.mjs, and the
// `webR.init()` that downloads the WebAssembly build behind it from
// WEBR_BASE. One probe stalls each.
//
// Each serves a copy of index.html with one of those two URLs pointed at the
// local server's /hang/ path, which is held open and never answered. A request
// that never settles is the failure this timeout exists for; a 404 or a
// refused connection is not, and the page has separate branches for those.
//
// The copies also shorten RUNTIME_TIMEOUT_MS. What is under test is the race
// and the message it produces, and waiting the shipped two minutes twice
// proves nothing further; the shipped value is what index.html declares and
// what README.md states, checked against each other rather than here.

import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_TIMEOUT_MS = 5000;

// Replaces one exact string, and refuses to carry on if it was not found or
// was found more than once. A rewrite that silently does nothing would leave a
// page that boots normally and a probe that reports on nothing.
function replaceOnce(html, from, to) {
  const hits = html.split(from).length - 1;
  if (hits !== 1) {
    throw new Error(`expected exactly one occurrence of ${JSON.stringify(from)}, found ${hits}`);
  }
  return html.replace(from, to);
}

async function serveProbe(stall) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hitop-runtime-probe-'));
  let html = await readFile(path.join(REPO, 'index.html'), 'utf8');
  html = replaceOnce(
    html,
    'const RUNTIME_TIMEOUT_MS = 120000;',
    `const RUNTIME_TIMEOUT_MS = ${PROBE_TIMEOUT_MS};`
  );
  html = replaceOnce(html, stall.from, stall.to);
  await writeFile(path.join(dir, 'index.html'), html);
  const server = await serveDir(dir);
  return {
    url: `${server.origin}/index.html`,
    async close() {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

const PROBES = [
  {
    name: 'the webr.mjs import never settles',
    from: "const WEBR_URL = 'https://webr.r-wasm.org/v0.6.0/webr.mjs';",
    to: "const WEBR_URL = '/hang/webr.mjs';",
  },
  {
    name: 'webR.init()’s own downloads never settle',
    from: "const WEBR_BASE = 'https://webr.r-wasm.org/v0.6.0/';",
    to: "const WEBR_BASE = '/hang/';",
  },
];

for (const probe of PROBES) {
  test(`the page gives up when ${probe.name}`, async ({ page }) => {
    const served = await serveProbe(probe);
    try {
      await page.goto(served.url);
      await expect(page.locator('#status')).toHaveText(
        new RegExp(
          `R in your browser did not finish downloading within ` +
            `${PROBE_TIMEOUT_MS / 1000} seconds`
        ),
        { timeout: 60000 }
      );
      // Hidden rather than merely disabled: nothing behind the controls can
      // produce a file once the page has given up on R.
      await expect(page.locator('#controls')).toBeHidden();
    } finally {
      await served.close();
    }
  });
}
