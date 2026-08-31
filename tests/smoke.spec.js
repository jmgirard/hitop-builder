// The smoke test: one headless run of the builder page, from a cold boot to a
// Word file on disk. It drives the page the way a visitor does -- it reads no
// page internals and stubs nothing -- so a green run means the deployed
// article really does hand over a document.
//
// Its assertions are enumerated here, and tests/plants.mjs reads this list out
// of this file to check that each one is failed by at least one planted
// defect:
//
//   A1: the status region reaches "Ready."
//   A2: more than MIN_SCALE_ROWS scale rows render in the initial list
//   A3: every rendered row carries a non-empty name
//   A4: the downloaded file begins with the four bytes of a zip container
//   A5: the downloaded file is longer than MIN_DOCX_BYTES
//
// A4 and A5 are soft assertions so that one download is measured against
// both: a file that is neither a zip nor long enough has to be reported as
// failing both, not only whichever is checked first.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The page under test. SMOKE_TARGET names a deployed URL; with it unset the
// run serves a directory on localhost instead -- the repository itself by
// default, or whatever SMOKE_SERVE_DIR names (the plant matrix points it at a
// scratch directory holding a planted copy).
const TARGET = process.env.SMOKE_TARGET ?? '';
const SERVE_DIR = process.env.SMOKE_SERVE_DIR ?? REPO;

// A deliberate floor, set well under the number of scales the instrument
// actually has. It is NOT the instrument's scale count and must not be
// "tightened" into one: that count belongs to the hitop package's keying
// tables, and this repository holds no instrument content. What the floor
// catches is a scale list that arrives empty or truncated.
const MIN_SCALE_ROWS = 50;

// A floor on the same terms: a built Word form of this instrument runs to tens
// of kilobytes, and what this catches is an empty or stub container handed
// over in place of a built one.
const MIN_DOCX_BYTES = 10000;

// A cold boot downloads R and then the hitop package, roughly twenty seconds
// each on a warm connection -- and CI is not one. Every wait below is budgeted
// well past Playwright's 30-second default for that reason.
const BOOT_MS = 240000;
const BUILD_MS = 240000;

test('the page boots, lists scales, and builds a Word form', async ({ page }) => {
  let server = null;
  let url = TARGET;
  if (!url) {
    server = await serveDir(SERVE_DIR);
    url = `${server.origin}/index.html`;
  }

  try {
    await page.goto(url);

    // "Ready." is also the status a finished build restores, so it is read
    // here, before anything is clicked, where it can only mean boot finished.
    await expect(page.locator('#status'), 'A1: the status region reaches "Ready."')
      .toHaveText('Ready.', { timeout: BOOT_MS });

    const rows = page.locator('#scales label');
    const rowCount = await rows.count();
    expect(
      rowCount,
      `A2: more than ${MIN_SCALE_ROWS} scale rows render in the initial list`
    ).toBeGreaterThan(MIN_SCALE_ROWS);

    // A2 having floored the count above zero is what keeps this from passing
    // over an empty list: an "every row" check on no rows says nothing.
    const names = await page.locator('#scales label .nm').allTextContents();
    const blank = names
      .map((n, i) => (n.trim() === '' ? i : -1))
      .filter((i) => i >= 0);
    expect(blank, 'A3: every rendered row carries a non-empty name').toEqual([]);

    // One scale, then the format screen the Word download lives on. Ticking
    // before moving is what turns the download button on.
    await rows.first().locator('input[type=checkbox]').check();
    await page.locator('#stepbar button[data-goto="1"]').click();
    await page.locator('[data-choose="docx"]').click();

    // The page hands the file over by clicking an anchor carrying a `download`
    // attribute, which arrives here as Playwright's download event. webR's own
    // requests come from a Web Worker and are invisible to the page's network
    // panel, which is why nothing here watches for them.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: BUILD_MS }),
      page.locator('#downloadBtn').click(),
    ]);
    const bytes = await readFile(await download.path());

    expect
      .soft(
        Array.from(bytes.subarray(0, 4)),
        'A4: the downloaded file begins with the four bytes of a zip container'
      )
      .toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect
      .soft(
        bytes.length,
        `A5: the downloaded file is longer than ${MIN_DOCX_BYTES} bytes`
      )
      .toBeGreaterThan(MIN_DOCX_BYTES);
  } finally {
    if (server) await server.close();
  }
});
