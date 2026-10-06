// The smoke test: one headless run of the builder page, from a cold boot to a
// Word form on disk. It drives the page the way a visitor does -- it reads
// only the page's document, no script state, and stubs nothing -- so a green
// run means the deployed article really does hand over a document. There are
// three exceptions. The webr.mjs request: the first test holds it for a moment
// to read the page while it loads (A20), and the last test refuses it to read
// the page after a failed load (A22). As the first test's last step,
// URL.createObjectURL is made to throw, so the next build fails at its save
// and the test reads the page after a failed build (A30, A31). And the second
// test makes one status write after R starts throw, to read the page after a
// start-up that failed past R (A32).
//
// Its assertions are enumerated here, and tests/plants.mjs reads this list out
// of this file to check that each one is failed by at least one planted
// defect:
//
//   A1: the status region reaches "Ready."
//   A2: more than MIN_SCALE_ROWS scale rows render in the initial list
//   A3: every rendered row carries a non-empty name
//   A4: the downloaded bundle holds exactly the three expected entries
//   A5: the bundle's .docx entry begins with the four bytes of a zip container
//   A6: the bundle's .docx entry is longer than MIN_DOCX_BYTES
//   A7: the download button is present and enabled
//   A8: the download button stays disabled when a scale is ticked during a build
//   A9: a format card pressed during a build leaves the page on the build's format
//   A10: the format cards wear the disabled look during a build
//   A11: focus comes back to the download button when the build ends
//   A12: the second step shows four format cards and the fourth is "Online form"
//   A13: the online card saves one .json, named for the build, whose scales and items are the two ticked scales'
//   A14: the Study Link Builder anchor after the save carries the saved file in its c, opens a new tab, and has rel noopener
//   A15: a tick change removes the panel and its anchor, and a second online save puts back exactly one of each, carrying the second file
//   A16: no Study Link Builder anchor or panel is in the document while a second online save begun with the first save's link present runs
//   A17: a tick during an online build leaves no Study Link Builder anchor or panel at the build's end
//   A18: a press of the Word card after an online save removes the panel and its anchor, and the Online card pressed again keeps them
//   A19: the status names the saved file and the link after an online save, and reads "Ready." after the guarded save and after a tick that removed the link
//   A20: while R loads, the text from the h1 to the status line holds at most 50 words, and one closed "Technical details" holds the host list and the log
//   A21: once the page is ready, "Technical details" is still closed and on show
//   A22: a failed load opens "Technical details", and the status names it
//   A23: every scale checkbox's accessible name is the scale's name and "<n> items", and the two known scales carry their own item counts
//   A24: every scale row has a visible Definition button named for its scale, and on every row a click and a key press open and close the definition and a hover opens none
//   A25: a filter that matches no scale shows "No scales match" in a status region, and a filter that matches one takes it away
//   A26: for each format, with its settings closed, the text from the cards to the download button holds at most 60 words
//   A27: a mouse click on each step control leaves the new step's heading with no outline, and a keyboard press on it shows one
//   A28: each format's card title, download button, build status and README.txt title use its one name, and each step control holds its target step's name
//   A29: after an online save, a panel headed "Next: make the study link" shows the Study Link Builder link, drawn as a button
//   A30: a build that fails opens "Technical details", and the status names it
//   A31: a build that fails while the "Technical details" summary is below the window brings the summary wholly into the window
//   A32: a start-up that throws after R started says so in the status, opens "Technical details", and leaves the controls hidden
//   A33: a failed load leaves the page unscrolled, with the open section reaching below the window
//
// A4, A5 and A6 are soft assertions so that one download is measured against
// all three: a bundle whose form is neither a zip nor long enough has to be
// reported as failing every one it fails, not only whichever is checked first.
//
// A7 and A12 are asserted before the click rather than left to the click's own
// failure, so a renamed or missing button or card is reported as a named
// assertion the plant matrix can account for, not as a bare locator timeout.
//
// The online saves come before the Word build, on the same page: A18 presses
// the Word card after an online save, and the online saves after A15 leave
// exactly the one ticked scale the Word build has always started from.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { serveDir } from './serve.mjs';

// Reads a zip's entries from its central directory: a map of entry name to
// bytes. Only what the page's bundles use is handled -- stored and deflated
// entries, no encryption, no zip64 -- and a buffer with no central directory
// yields an empty map rather than throwing, so a bundle that is not a zip at
// all fails A4 by name instead of crashing the test.
function zipEntries(buf) {
  const entries = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return entries;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart =
      local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    entries.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The page under test. SMOKE_TARGET names a deployed URL; with it unset the
// run serves a directory on localhost instead -- the repository itself by
// default, or whatever SMOKE_SERVE_DIR names (the plant matrix points it at a
// scratch directory holding a planted copy).
const TARGET = process.env.SMOKE_TARGET ?? '';
const SERVE_DIR = process.env.SMOKE_SERVE_DIR ?? REPO;

// Set by the workflow on the runs whose whole point is the deployed page. The
// fallback to a local server is silent by design for the plant matrix and for
// a developer's own run, and silence is exactly wrong there: a dropped `env:`
// block or a renamed event would leave the weekly job green forever against
// the checkout it was never meant to test.
const REQUIRE_TARGET = (process.env.SMOKE_REQUIRE_TARGET ?? '') !== '';

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

// The two scales the online save is made from, by the names the page shows,
// and the HiTOP-SR item numbers those two scales hold, listed by hand from
// the hitop package's own tables (hitop_module("hitopsr", scales = these)
// on 2026-09-25) rather than read off the file under test. The page must
// save them in ascending order, which is the order write_module() writes and
// the order hitop-form requires.
const ONLINE_SCALES = ['Agoraphobia', 'Appetite Loss'];
const ONLINE_ITEMS = [66, 109, 118, 144, 202, 260, 291, 389];
// The items of the first of the two alone, for the second save.
const ONLINE_ITEMS_FIRST = [66, 109, 118, 260, 291];

// hitop-form's Study Link Builder, and the decoding of its `c` parameter: the
// inverse of the page's base64url(), written here on its own so the test
// reads nothing from the page.
const STUDY_LINK_BUILDER = 'https://jmgirard.github.io/hitop-form/link.html';

// The next-step panel an online save puts under the button, and its link.
const PANEL_HEADING = 'Next: make the study link';
const PANEL_LINK = 'Open the Study Link Builder';

// The one table the names are read against (A28): each format's one name,
// keyed by its card's data-choose, and each step's name, by its index. They
// are stated here, not read off the page, so a page that renames a format in
// one place and not the others fails.
const FORMAT_NAMES = {
  docx: 'Word form',
  qualtrics: 'Qualtrics file',
  redcap: 'REDCap dictionary',
  online: 'Online form',
};
const STEP_NAMES = ['Choose scales', 'Choose a format and download'];

// Every control that changes the step, with the step it is on and the step
// it leads to (A27, A28).
const STEP_CONTROLS = [
  { what: 'the step bar button to step 2', from: 0, to: 1, sel: '#stepbar button[data-goto="1"]' },
  { what: 'the Next button', from: 0, to: 1, sel: '#step1 .stepnav button[data-goto="1"]' },
  { what: 'the step bar button to step 1', from: 1, to: 0, sel: '#stepbar button[data-goto="0"]' },
  { what: 'the link in the step 2 recap', from: 1, to: 0, sel: '#step2 .recap button[data-goto="0"]' },
  { what: 'the Back button', from: 1, to: 0, sel: '#step2 .stepnav button[data-goto="0"]' },
];

// The closed section that holds the host list and the log (A20 to A22), and
// the hosts the page names there. The page loads R and the package from
// these, so they are facts about the page's own code, not content.
const TECH_DETAILS = 'Technical details';
const HOSTS = ['webr.r-wasm.org', 'jmgirard.r-universe.dev', 'r2.ropensci.org', 'repo.r-wasm.org'];

// The page's first request for R. A20 holds it to read the loading state,
// and A22 refuses it to make the load fail.
const WEBR_MJS = '**/webr.mjs';

// The status of a start-up that throws after R started (A32), up to the
// pointer that every failure status ends with.
const SETUP_FAILED = 'R started, but the page did not finish setting up.';

// Where the "Technical details" summary sits against the window (A31): its
// box's top and bottom and the window's height, in CSS pixels.
function readSummaryBox(page) {
  return page.evaluate(() => {
    const r = document.querySelector('#techDetails > summary').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: window.innerHeight };
  });
}

// The word limits AC1 and AC3 set.
const MAX_HEADER_WORDS = 50;
const MAX_STEP2_WORDS = 60;

// The item counts of the two online scales, listed by hand from the hitop
// package's own tables (lengths(hitopsr_scales$itemNumbers) in hitop 0.2.0,
// on 2026-09-30) rather than worked out from the item lists above.
const KNOWN_COUNTS = {
  [ONLINE_SCALES[0]]: 5,
  [ONLINE_SCALES[1]]: 3,
};

// Opens the page under test: SMOKE_TARGET when set, else a local server over
// SERVE_DIR. Returns its URL and a close function.
async function openTarget() {
  if (!TARGET && REQUIRE_TARGET) {
    throw new Error(
      'SMOKE_REQUIRE_TARGET is set but SMOKE_TARGET is empty: this run was ' +
        'meant to drive a deployed page and would have driven a local copy.'
    );
  }
  if (TARGET) return { url: TARGET, close: async () => {} };
  const server = await serveDir(SERVE_DIR);
  return { url: `${server.origin}/index.html`, close: () => server.close() };
}

// What A20 to A22 read of the page's head and its "Technical details", in
// one call. Words are runs of non-space text holding a letter or a digit,
// counted over the rendered elements from the h1 to the status line. The
// hosts shown are the ones in the page's rendered text, which leaves out the
// body of a closed <details>.
function readTechState(page) {
  return page.evaluate(([summaryText, hosts]) => {
    const count = (t) => (t.match(/\S+/g) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const texts = [];
    for (let n = document.querySelector('h1').nextElementSibling; n && n.id !== 'status'; n = n.nextElementSibling) {
      if (n.checkVisibility()) texts.push(n.innerText);
    }
    const sections = [...document.querySelectorAll('details')]
      .filter((d) => d.querySelector(':scope > summary')?.textContent.trim() === summaryText);
    const d = sections[0];
    return {
      headerWords: count(texts.join(' ')),
      sections: sections.length,
      open: d ? d.open : null,
      rendered: d ? d.checkVisibility() : null,
      holdsLog: d ? d.querySelector('#log') !== null : null,
      holdsHosts: d ? hosts.every((h) => d.textContent.includes(h)) : null,
      hostsShown: hosts.filter((h) => document.body.innerText.includes(h)),
      status: document.getElementById('status').textContent,
    };
  }, [TECH_DETAILS, HOSTS]);
}

// The words step 2 shows between the format cards and the download button,
// read from the rendered children of the step between the two, so a closed
// settings disclosure counts its summary line only (A26).
function readStep2Words(page) {
  return page.evaluate(() => {
    const count = (t) => (t.match(/\S+/g) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const kids = [...document.getElementById('step2').children];
    const from = kids.indexOf(document.querySelector('#step2 .formats'));
    const to = kids.indexOf(document.querySelector('#step2 .downloadrow'));
    const text = from < 0 || to < 0 ? '' : kids.slice(from + 1, to)
      .filter((k) => k.checkVisibility()).map((k) => k.innerText).join(' ');
    return {
      words: count(text),
      openSettings: [...document.querySelectorAll('#formatOptions details')].some((d) => d.open),
    };
  });
}

// Which element has focus after a step change, and its computed outline.
function readFocusOutline(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    const step = a?.closest('.step');
    return {
      heading: a?.tagName === 'H2' && step ? step.id : null,
      outline: a ? getComputedStyle(a).outlineStyle : null,
    };
  });
}

// A value that names `name` reads as the name, and any other value as it
// stands, so a failure shows the text that left the name out.
function uses(text, name) {
  return typeof text === 'string' && text.includes(name) ? name : text;
}
function decodeC(c) {
  const b64 = c.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
}

// What the test reads of the Study Link Builder anchor, or null with none in
// the document. Anchors are found by their text so a hidden or relocated one
// still counts; the count is the whole document's.
async function readAnchor(page) {
  const anchors = page.getByRole('link', { name: PANEL_LINK, includeHidden: true });
  const count = await anchors.count();
  if (count === 0) return { count, anchor: null };
  const a = anchors.first();
  const href = (await a.getAttribute('href')) ?? '';
  const [base, query] = href.split('?');
  const c = new URLSearchParams(query ?? '').get('c');
  let decoded = null;
  try { decoded = c ? decodeC(c) : null; } catch { decoded = 'unreadable'; }
  return {
    count,
    anchor: {
      base,
      target: await a.getAttribute('target'),
      rel: await a.getAttribute('rel'),
      decoded,
    },
  };
}

// The status an online save ends on when it puts the panel in. A save that
// puts no panel in, and every other build, ends on the bare "Ready.".
const SAVED_STATUS = 'Ready. The module file is saved. "Next: make the study link" is under the button.';

// Presses the download button and waits for the status to come back to one
// beginning with "Ready.", counting the download events in between. The
// saved file's text is read back, so the test compares what the browser was
// handed, and the status text is returned, so a caller can read which
// "Ready." the save ended on. The wait takes either, so a save ending on the
// wrong one fails a later status read (A19 for the first save, A18 for the
// save read as `second`) rather than stopping the run here. The status
// before the press also begins with "Ready.", so the save's download event
// is awaited first: the status is then read after the build that produced
// the file, whether or not download() wrote its progress line before the
// click resolved.
async function saveOnline(page, downloads, label) {
  const before = downloads.length;
  const saved1 = page.waitForEvent('download', { timeout: BUILD_MS });
  await page.locator('#downloadBtn').click();
  await saved1;
  await expect(page.locator('#status'), label).toHaveText(/^Ready\./, { timeout: BUILD_MS });
  const status = await page.locator('#status').textContent();
  const saved = downloads.slice(before);
  const text = saved.length === 1 ? await readFile(await saved[0].path(), 'utf8') : '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { count: saved.length, name: saved[0]?.suggestedFilename() ?? '', text, parsed, status };
}

// What the test reads of the page around the panel, in one call: the count
// of Study Link Builder anchors in the whole document, found by their exact
// text (readAnchor() finds the same link by its accessible name); the
// headings of the panels in the document that hold such an anchor; the
// count of panel headings in the document, found by their text whether or
// not an anchor is left beside them, so a removal that takes the link and
// leaves the panel is seen; the status text; and whether the download
// button is off, which it is for the length of a build. One call, so all of
// it is read from one state of the page. The panel's <template> is not
// counted: its content is not in the document.
function readLinkState(page, heading = PANEL_HEADING, link = PANEL_LINK) {
  return page.evaluate(([heading, link]) => {
    const anchors = [...document.querySelectorAll('a')].filter((a) => a.textContent.trim() === link);
    return {
      building: document.getElementById('downloadBtn').disabled,
      anchors: anchors.length,
      panels: anchors
        .map((a) => a.closest('section')?.querySelector('h3')?.textContent.trim() ?? null)
        .filter((h) => h === heading),
      headings: [...document.querySelectorAll('h1, h2, h3, h4')]
        .filter((h) => h.textContent.trim() === heading).length,
      status: document.getElementById('status').textContent,
    };
  }, [heading, link]);
}

test('the page boots, lists scales, and builds a Word form', async ({ page }) => {
  const target = await openTarget();
  const url = target.url;

  try {
    // Recorded so every run says on its own face which page it drove: the two
    // targets are indistinguishable in the report otherwise, and a run against
    // the wrong one still looks green.
    console.log(`smoke target: ${url}`);
    test.info().annotations.push({ type: 'smoke target', description: url });

    // The webr.mjs request is held until the loading state has been read, so
    // the read cannot race a fast load. It is then let through unchanged.
    let releaseWebr;
    const webrHeld = new Promise((resolve) => { releaseWebr = resolve; });
    await page.route(WEBR_MJS, async (route) => {
      await webrHeld;
      await route.continue();
    }, { times: 1 });

    await page.goto(url);

    // While R loads: the head of the page is short, and the host list and
    // the log sit in one closed "Technical details". The hosts must not show
    // anywhere in the rendered text, which rules out a host list left in the
    // head. The status is read in the same call, so the read is shown to be
    // of the loading state.
    await expect(page.locator('#status'), 'A20: the page shows its loading status')
      .toHaveText('Starting R in your browser…');
    const loading = await readTechState(page);
    releaseWebr();
    console.log(`header words while loading: ${loading.headerWords}`);
    expect
      .soft(
        { ...loading, headerWordsInLimit: loading.headerWords > 0 && loading.headerWords <= MAX_HEADER_WORDS },
        `A20: while R loads, the text from the h1 to the status line holds at most ${MAX_HEADER_WORDS} words, and one closed "Technical details" holds the host list and the log`
      )
      .toEqual({
        headerWords: loading.headerWords,
        headerWordsInLimit: true,
        sections: 1,
        open: false,
        rendered: true,
        holdsLog: true,
        holdsHosts: true,
        hostsShown: [],
        status: 'Starting R in your browser…',
      });

    // "Ready." is also the status a finished build restores, so it is read
    // here, before anything is clicked, where it can only mean boot finished.
    await expect(page.locator('#status'), 'A1: the status region reaches "Ready."')
      .toHaveText('Ready.', { timeout: BOOT_MS });

    const ready = await readTechState(page);
    expect
      .soft(
        { sections: ready.sections, open: ready.open, rendered: ready.rendered, hostsShown: ready.hostsShown },
        'A21: once the page is ready, "Technical details" is still closed and on show'
      )
      .toEqual({ sections: 1, open: false, rendered: true, hostsShown: [] });

    const rows = page.locator('#scales label');
    const rowCount = await rows.count();
    expect(
      rowCount,
      `A2: more than ${MIN_SCALE_ROWS} scale rows render in the initial list`
    ).toBeGreaterThan(MIN_SCALE_ROWS);

    // Checked against the row count, not against the name locator's own yield.
    // `allTextContents()` returns an empty list when the locator matches
    // nothing, so "none of the collected names is blank" is satisfied by a
    // page that renders no names at all -- a dropped name span, or a renamed
    // class, would leave every row nameless and this green. Asserting one name
    // per counted row is what fails on that.
    const names = await page.locator('#scales label .nm').allTextContents();
    const blank = names
      .map((n, i) => (n.trim() === '' ? i : -1))
      .filter((i) => i >= 0);
    expect(
      { named: names.length, blank },
      'A3: every rendered row carries a non-empty name'
    ).toEqual({ named: rowCount, blank: [] });

    // Each checkbox's accessible name, as the browser computes it, is the
    // scale's name and its item count. The names come from the accessibility
    // tree, one per row in row order. The count on each row is the package's,
    // so two of them are held to the counts this file states on its own.
    const tree = await page.locator('#scales').ariaSnapshot();
    const boxNames = [...tree.matchAll(/- checkbox "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const buttonNames = [...tree.matchAll(/- button "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const counts = {};
    const misnamed = [];
    names.forEach((name, i) => {
      const m = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ([1-9]\\d*) items$`).exec(boxNames[i] ?? '');
      if (m) counts[name] = Number(m[1]);
      else misnamed.push(boxNames[i] ?? `(no checkbox for ${name})`);
    });
    expect
      .soft(
        {
          boxes: boxNames.length,
          misnamed,
          known: Object.fromEntries(Object.keys(KNOWN_COUNTS).map((k) => [k, counts[k] ?? null])),
        },
        'A23: every scale checkbox\'s accessible name is the scale\'s name and "<n> items", and the two known scales carry their own item counts'
      )
      .toEqual({ boxes: rowCount, misnamed: [], known: KNOWN_COUNTS });

    // Every row has a Definition button, on show, named for its scale. On
    // every row: a hover opens nothing; a click opens the definition and a
    // second click closes it; Enter opens it and Space closes it. The
    // definition is the text the checkbox's aria-describedby names. The
    // hover is held 600 ms on the first row, long enough for a delayed
    // opener like the hover popup this button replaced, and 150 ms on the
    // others, which still catches an opener that fires at once. Each row's
    // result is kept whole, so a failure names the rows that went wrong.
    const expectedRow = {
      onHover: false, onClick: true, expanded: 'true', hasText: true,
      onSecondClick: false, onEnter: true, onSpace: false,
    };
    const rowFailures = [];
    const defRows = page.locator('#scales .row');
    const defRowCount = await defRows.count();
    for (let i = 0; i < defRowCount; i++) {
      const row = defRows.nth(i);
      const defButton = row.locator('button');
      const descId = (await defButton.getAttribute('aria-controls')) ?? '';
      const desc = page.locator(`[id="${descId}"]`);
      const shown = () => desc.isVisible();
      await row.locator('label').hover();
      await page.waitForTimeout(i === 0 ? 600 : 150);
      const onHover = await shown();
      await page.mouse.move(0, 0);
      await defButton.click();
      const onClick = await shown();
      const expanded = await defButton.getAttribute('aria-expanded');
      const descText = ((await desc.textContent()) ?? '').trim();
      await defButton.click();
      const onSecondClick = await shown();
      await defButton.focus();
      await page.keyboard.press('Enter');
      const onEnter = await shown();
      await page.keyboard.press(' ');
      const onSpace = await shown();
      const got = { onHover, onClick, expanded, hasText: descText.length > 0, onSecondClick, onEnter, onSpace };
      if (JSON.stringify(got) !== JSON.stringify(expectedRow)) rowFailures.push({ row: names[i], ...got });
    }
    const definitions = await page.locator('#scales .row').evaluateAll((rs) => rs.map((r) => {
      const b = r.querySelector('button.defbtn');
      return {
        shown: b !== null && b.checkVisibility() && b.textContent.trim() === 'Definition',
        describes: r.querySelector('input').getAttribute('aria-describedby') === b?.getAttribute('aria-controls'),
      };
    }));
    expect
      .soft(
        {
          buttons: definitions.filter((d) => d.shown && d.describes).length,
          buttonNames: buttonNames.filter((n, i) => n === `Definition of ${names[i]}`).length,
          rowsDriven: defRowCount,
          rowFailures,
        },
        'A24: every scale row has a visible Definition button named for its scale, and on every row a click and a key press open and close the definition and a hover opens none'
      )
      .toEqual({
        buttons: rowCount,
        buttonNames: rowCount,
        rowsDriven: rowCount,
        rowFailures: [],
      });

    // A filter that matches nothing shows the line, inside a status region,
    // and hides every row; one that matches a scale takes the line away
    // again.
    const readFilter = () => page.evaluate(() => ({
      line: document.getElementById('noMatch')?.checkVisibility()
        ? document.getElementById('noMatch').textContent.trim() : null,
      inStatus: document.getElementById('noMatch')?.closest('[role="status"]') != null,
      rows: [...document.querySelectorAll('#scales .row')].filter((r) => r.checkVisibility()).length,
    }));
    await page.locator('#filter').fill('qqqq no such scale');
    const noMatch = await readFilter();
    await page.locator('#filter').fill(ONLINE_SCALES[0]);
    const oneMatch = await readFilter();
    await page.locator('#filter').fill('');
    expect
      .soft(
        { noMatch: { ...noMatch, line: noMatch.line?.startsWith('No scales match') ? 'No scales match' : noMatch.line }, oneMatch },
        'A25: a filter that matches no scale shows "No scales match" in a status region, and a filter that matches one takes it away'
      )
      .toEqual({
        noMatch: { line: 'No scales match', inStatus: true, rows: 0 },
        oneMatch: { line: null, inStatus: true, rows: 1 },
      });

    // Each control that changes the step, pressed once with the mouse and
    // once with the keyboard. After the mouse click the new step's heading
    // has focus and no outline; after the key press it has focus and an
    // outline. Before each press the page is put on the control's own step
    // with a mouse click on the step bar.
    const stepPresses = [];
    for (const c of STEP_CONTROLS) {
      for (const how of ['mouse', 'keyboard']) {
        await page.locator(`#stepbar button[data-goto="${c.from}"]`).click();
        const control = page.locator(c.sel);
        if (how === 'mouse') {
          await control.click();
        } else {
          await control.focus();
          await page.keyboard.press('Enter');
        }
        const r = await readFocusOutline(page);
        stepPresses.push({
          control: c.what, how, heading: r.heading,
          outline: how === 'mouse' ? r.outline : (r.outline !== 'none' ? 'shown' : 'none'),
        });
      }
    }
    expect
      .soft(stepPresses, 'A27: a mouse click on each step control leaves the new step\'s heading with no outline, and a keyboard press on it shows one')
      .toEqual(STEP_CONTROLS.flatMap((c) => [
        { control: c.what, how: 'mouse', heading: `step${c.to + 1}`, outline: 'none' },
        { control: c.what, how: 'keyboard', heading: `step${c.to + 1}`, outline: 'shown' },
      ]));
    await page.locator('#stepbar button[data-goto="0"]').click();

    // The names A28 reads, gathered as the run reaches each one.
    const seen = { cards: {}, buttons: {}, statuses: {}, readmes: {} };

    // Every download the page hands over from here on is counted, so a save
    // that is one file can be told from one that is two, or none.
    const downloads = [];
    page.on('download', (d) => downloads.push(d));

    // The online card first: two scales ticked by name, the second step, the
    // fourth card. The cards are read before the press, so a missing card
    // fails A12 by name rather than as a locator timeout.
    for (const name of ONLINE_SCALES) {
      await rows.filter({ has: page.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
        .locator('input[type=checkbox]').check();
    }
    await page.locator('#stepbar button[data-goto="1"]').click();
    const cardNames = await page.locator('[data-choose] .fmtname').allTextContents();
    expect(
      { count: cardNames.length, fourth: cardNames[3] ?? null },
      'A12: the second step shows four format cards and the fourth is "Online form"'
    ).toEqual({ count: 4, fourth: 'Online form' });
    await page.locator('[data-choose="online"]').click();

    // The button is asserted before its first press here, as it is again
    // before the Word build below, so a renamed or missing button fails A7 by
    // name rather than as a bare locator timeout on the press.
    await expect(
      page.locator('#downloadBtn'),
      'A7: the download button is present and enabled'
    ).toBeEnabled();

    // One press, one save: the file is named for an online module build and
    // holds the two scales and their items, in ascending order.
    const first = await saveOnline(page, downloads, 'A13: the online save returns the status to "Ready."');
    expect
      .soft(
        {
          downloads: first.count,
          name: first.name,
          scales: first.parsed?.scales ?? null,
          items: first.parsed?.items ?? null,
        },
        "A13: the online card saves one .json, named for the build, whose scales and items are the two ticked scales'"
      )
      .toEqual({
        downloads: 1,
        name: 'hitopsr-online-module.json',
        scales: ONLINE_SCALES,
        items: ONLINE_ITEMS,
      });

    // The anchor under the button: one, opening a new tab with rel noopener,
    // pointing at the Study Link Builder with a c that decodes to the instrument
    // and the module the saved file holds.
    const afterSave = await readAnchor(page);
    expect
      .soft(
        afterSave,
        'A14: the Study Link Builder anchor after the save carries the saved file in its c, opens a new tab, and has rel noopener'
      )
      .toEqual({
        count: 1,
        anchor: {
          base: STUDY_LINK_BUILDER,
          target: '_blank',
          rel: 'noopener',
          decoded: { instrument: 'hitopsr', module: first.parsed },
        },
      });

    // The anchor sits in a panel under that heading, and is on show.
    const panel = page.locator('#nextStepSlot section', { has: page.getByRole('heading', { name: PANEL_HEADING }) });
    expect
      .soft(
        {
          panels: await panel.count(),
          heading: ((await panel.locator('h3').first().textContent().catch(() => null)) ?? '').trim() || null,
          buttonShown: await panel.getByRole('link', { name: PANEL_LINK }).isVisible(),
        },
        'A29: after an online save, a panel headed "Next: make the study link" shows the Study Link Builder link, drawn as a button'
      )
      .toEqual({ panels: 1, heading: PANEL_HEADING, buttonShown: true });

    // A second online save, pressed with the first save's link still in the
    // document. download() takes the link out synchronously, before its
    // first await, right after it turns the controls off, so no anchor is in
    // the document while the build runs. The count is read in one call
    // right after the press, with the button's state, as A17's tick is: a
    // read that landed after the build ended reads the button as on and
    // fails here as a false red, never a false green. The same read is
    // taken before the press, where it shows the count finds the anchor.
    // The save's download is awaited and then any "Ready.", as
    // saveOnline() does.
    const beforeSecondPress = await readLinkState(page);
    const secondSaved = page.waitForEvent('download', { timeout: BUILD_MS });
    await page.locator('#downloadBtn').click();
    const atSecondPress = await readLinkState(page);
    // The status download() writes as it starts, read in the same call.
    seen.statuses.online = atSecondPress.status;
    await secondSaved;
    await expect(page.locator('#status'), 'A16: the second online save returns the status to a "Ready."')
      .toHaveText(/^Ready\./, { timeout: BUILD_MS });
    expect
      .soft(
        {
          anchorsBeforePress: beforeSecondPress.anchors,
          headingsBeforePress: beforeSecondPress.headings,
          anchors: atSecondPress.anchors,
          headings: atSecondPress.headings,
          building: atSecondPress.building,
        },
        "A16: no Study Link Builder anchor or panel is in the document while a second online save begun with the first save's link present runs"
      )
      .toEqual({ anchorsBeforePress: 1, headingsBeforePress: 1, anchors: 0, headings: 0, building: true });

    // A tick change removes the anchor and returns the status to "Ready.".
    // The second scale is unticked, which leaves the first alone: the one
    // scale the Word build below starts from. A later online save from it
    // (read as `second` below) puts exactly one anchor back, carrying that
    // save's file, whose items are the first scale's.
    await page.locator('#stepbar button[data-goto="0"]').click();
    await rows.filter({ has: page.locator('.nm', { hasText: new RegExp(`^${ONLINE_SCALES[1]}$`) }) })
      .locator('input[type=checkbox]').uncheck();
    const afterTick = {
      ...(await readAnchor(page)),
      headings: (await readLinkState(page)).headings,
      status: await page.locator('#status').textContent(),
    };
    await page.locator('#stepbar button[data-goto="1"]').click();

    // An online save from the one scale, with a second scale ticked
    // while R writes the file. The boxes stay on during a build, and the
    // file saved is the one-scale module, so a link put back at the end
    // would carry it beside a two-scale selection: the page must end with
    // no link. The tick is made in the page rather than by a click on the
    // first step, so it lands within the build; the button's state is read
    // in the same call, and a tick that landed after the build ended reads
    // the button as on and fails here as a false red, never a false green,
    // since the tick's own removal would leave no link either way. The
    // second scale is unticked again once the build ends, so the save below
    // (read as `second`) starts from the one scale, and its link is the one
    // A18's Word card press removes.
    const midBefore = downloads.length;
    await page.locator('#downloadBtn').click();
    const atTick = await page.evaluate(() => {
      const box = document.querySelectorAll('#scales input')[1];
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return { buildingAtTick: document.getElementById('downloadBtn').disabled };
    });
    // The wait takes any "Ready.", so a save that wrongly put a link in
    // fails A17's anchor read and A19's read of this status rather than
    // stopping the run on a timeout here. The text is read for A19.
    await expect(page.locator('#status'), 'A17: the mid-tick online save returns the status to a "Ready."')
      .toHaveText(/^Ready\./, { timeout: BUILD_MS });
    const statusAfterMidTick = await page.locator('#status').textContent();
    expect
      .soft(
        {
          buildingAtTick: atTick.buildingAtTick,
          downloads: downloads.length - midBefore,
          anchors: (await readAnchor(page)).count,
          headings: (await readLinkState(page)).headings,
        },
        "A17: a tick during an online build leaves no Study Link Builder anchor or panel at the build's end"
      )
      .toEqual({ buildingAtTick: true, downloads: 1, anchors: 0, headings: 0 });
    await page.evaluate(() => {
      const box = document.querySelectorAll('#scales input')[1];
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const second = await saveOnline(page, downloads, 'A15: the second online save returns the status to "Ready."');
    const afterSecond = await readAnchor(page);
    const headingsAfterSecond = (await readLinkState(page)).headings;
    expect
      .soft(
        {
          afterTick: afterTick.count,
          headingsAfterTick: afterTick.headings,
          afterSecond: afterSecond.count,
          headingsAfterSecond,
          secondDownloads: second.count,
          secondItems: second.parsed?.items ?? null,
          secondDecoded: afterSecond.anchor?.decoded ?? null,
        },
        'A15: a tick change removes the panel and its anchor, and a second online save puts back exactly one of each, carrying the second file'
      )
      .toEqual({
        afterTick: 0,
        headingsAfterTick: 0,
        afterSecond: 1,
        headingsAfterSecond: 1,
        secondDownloads: 1,
        secondItems: ONLINE_ITEMS_FIRST,
        secondDecoded: { instrument: 'hitopsr', module: second.parsed },
      });

    // The status line, the page's announced region for builds, is what tells a
    // visitor the link is there. Three reads: after the first save, which put
    // a link in; after the mid-tick save, which put none in; and after the
    // untick that took one out.
    expect
      .soft(
        { afterFirstSave: first.status, afterMidTickSave: statusAfterMidTick, afterUntick: afterTick.status },
        'A19: the status names the saved file and the link after an online save, and reads "Ready." after the guarded save and after a tick that removed the link'
      )
      .toEqual({ afterFirstSave: SAVED_STATUS, afterMidTickSave: 'Ready.', afterUntick: 'Ready.' });

    // A press of another format's card takes the panel and its link out: the
    // panel belongs with the online card. The Word card stands for the
    // three, which share setFormat(). The read before the press shows the
    // count and the panel are found. After the press, the
    // removal has returned the status to "Ready." and the card handler has
    // written the chosen format after it. The online card is then pressed
    // again, a save made from it, and the online card pressed once more: a
    // press that changes nothing keeps the link.
    const beforeWordPress = await readLinkState(page);
    await page.locator('[data-choose="docx"]').click();
    const afterWordPress = await readLinkState(page);
    await page.locator('[data-choose="online"]').click();
    const third = await saveOnline(page, downloads, 'A18: the online save after the Word card press returns the status to a "Ready."');
    await page.locator('[data-choose="online"]').click();
    const afterOnlineAgain = await readLinkState(page);
    expect
      .soft(
        { beforeWordPress, afterWordPress, thirdDownloads: third.count, afterOnlineAgain },
        'A18: a press of the Word card after an online save removes the panel and its anchor, and the Online card pressed again keeps them'
      )
      .toEqual({
        beforeWordPress: { building: false, anchors: 1, panels: [PANEL_HEADING], headings: 1, status: SAVED_STATUS },
        afterWordPress: { building: false, anchors: 0, panels: [], headings: 0, status: 'Ready. Word form chosen.' },
        thirdDownloads: 1,
        afterOnlineAgain: { building: false, anchors: 1, panels: [PANEL_HEADING], headings: 1, status: 'Ready. Online form chosen.' },
      });

    // Each format's card pressed in turn, which closes its settings: the
    // words from the cards to the download button, and, for A28, the card's
    // title and the button's text. A count of zero fails too, so a read that
    // found nothing to count cannot pass.
    const step2Words = {};
    for (const format of Object.keys(FORMAT_NAMES)) {
      const card = page.locator(`[data-choose="${format}"]`);
      await card.click();
      const r = await readStep2Words(page);
      step2Words[format] = r.openSettings ? 'settings open' : r.words;
      seen.cards[format] = ((await card.locator('.fmtname').textContent()) ?? '').trim();
      seen.buttons[format] = await page.locator('#downloadBtn').textContent();
    }
    console.log(`step 2 words: ${JSON.stringify(step2Words)}`);
    expect
      .soft(
        Object.fromEntries(Object.entries(step2Words).map(([f, n]) => [f, typeof n === 'number' && n > 0 && n <= MAX_STEP2_WORDS ? 'within' : n])),
        `A26: for each format, with its settings closed, the text from the cards to the download button holds at most ${MAX_STEP2_WORDS} words`
      )
      .toEqual(Object.fromEntries(Object.keys(FORMAT_NAMES).map((f) => [f, 'within'])));

    // The Word build, from the one scale still ticked; the Word card is
    // pressed rather than relied on as the page's starting format.
    await rows.first().locator('input[type=checkbox]').check();
    await page.locator('[data-choose="docx"]').click();

    await expect(
      page.locator('#downloadBtn'),
      'A7: the download button is present and enabled'
    ).toBeEnabled();
    // The button's Word text, read before the build starts. A9 compares the
    // text after a card press during the build against it.
    const wordButton = await page.locator('#downloadBtn').textContent();

    // The page hands the bundle over by clicking an anchor carrying a
    // `download` attribute, which arrives here as Playwright's download event.
    // webR's own requests come from a Web Worker and are invisible to the
    // page's network panel, which is why nothing here watches for them.
    const downloaded = page.waitForEvent('download', { timeout: BUILD_MS });
    await page.locator('#downloadBtn').click();
    // The status download() writes as it starts, before its first await.
    seen.statuses.docx = await page.locator('#status').textContent();

    // Every selection change (a tick, an untick, Select all, Clear all) goes
    // through refreshTally(), the one site that can turn the button back on
    // during a build. A tick is the simplest of them to make. The state is
    // read once, not polled: a poll could pass on a later state. The
    // build takes seconds, so the tick lands while it runs. A build that ends
    // first leaves the button on and fails A8, which is a false red, never a
    // false green. download() turns the button off itself, so a tick that
    // never reached refreshTally() would also leave it off. The tally, which
    // refreshTally() writes, is read in the same assertion to rule that out.
    await page.locator('#stepbar button[data-goto="0"]').click();
    await rows.nth(1).locator('input[type=checkbox]').check();
    const duringBuild = {
      disabled: await page.locator('#downloadBtn').isDisabled(),
      tallyCountsTwo: (await page.locator('#tally').textContent()).startsWith('2 of '),
    };
    expect
      .soft(
        duringBuild,
        'A8: the download button stays disabled when a scale is ticked during a build'
      )
      .toEqual({ disabled: true, tallyCountsTwo: true });

    // Back on the second step, still during the build, the Qualtrics card is
    // pressed. download() turns the cards off, so the press must change
    // nothing: the button keeps its Word text and the Word card keeps its
    // mark. The press is forced because Playwright would otherwise wait, up to
    // its action timeout, for the disabled card to turn on. It would then
    // either throw without naming A9, or press the card after the build ends
    // and fail A9 on a correct page. A forced click still lands as a real
    // mouse click, which a browser does not deliver to a disabled button. The
    // state is read once, like A8's. The same read takes the cards' disabled
    // state, so a page whose handler ignores the press with the cards left on
    // also fails A9. It takes the status line too: download() writes
    // "Building the Word form…" at the click and nothing else until the build
    // ends, so a press that came after the end fails on the status and not
    // only on the button.
    await page.locator('#stepbar button[data-goto="1"]').click();
    await page.locator('[data-choose="qualtrics"]').click({ force: true });
    const afterPress = {
      button: await page.locator('#downloadBtn').textContent(),
      wordMarked: await page.locator('[data-choose="docx"]').getAttribute('aria-current'),
      cardsDisabled: await page
        .locator('[data-choose]')
        .evaluateAll((cards) => cards.map((b) => b.disabled)),
      stillBuilding: (await page.locator('#status').textContent()).startsWith('Building'),
    };
    expect
      .soft(
        afterPress,
        "A9: a format card pressed during a build leaves the page on the build's format"
      )
      .toEqual({
        button: wordButton,
        wordMarked: 'true',
        cardsDisabled: [true, true, true, true],
        stillBuilding: true,
      });

    // Still during the build, the cards must look off as well as be off. The
    // mouse is moved away from the cards first, and the read waits for the
    // cards' 0.15s transitions to end, so it reads the settled look and not a
    // frame on the way to it. The wait names A10, so a card that never
    // settles fails A10 and not a bare timeout. Each card's background, border
    // colour and two text colours are compared with the download button's,
    // read in the same pass: the button is disabled during the build and
    // wears the page's disabled pair, so the compare holds in either colour
    // scheme without naming a colour here. A page that turns the button back
    // on during the build (plant (i)) also fails A10 for that reason, since
    // the button is no longer disabled. The same read takes the status line,
    // as A9's does, so a build that ended before the read fails on the status
    // and not only on the look.
    await page.mouse.move(0, 0);
    const cards = page.locator('[data-choose]');
    await expect
      .poll(
        () =>
          cards.evaluateAll((cs) =>
            cs.every((c) => c.getAnimations({ subtree: true }).length === 0)
          ),
        { message: 'A10: the format cards wear the disabled look during a build', timeout: 5000 }
      )
      .toBe(true);
    const cardLook = await cards.evaluateAll((cs) => {
      const b = getComputedStyle(document.getElementById('downloadBtn'));
      const looks = cs.map((c) => {
        const s = getComputedStyle(c);
        return {
          borderTopStyle: s.borderTopStyle,
          boxShadow: s.boxShadow,
          background: s.backgroundColor === b.backgroundColor,
          borderColor: s.borderTopColor === b.borderTopColor,
          name: getComputedStyle(c.querySelector('.fmtname')).color === b.color,
          what: getComputedStyle(c.querySelector('.fmtwhat')).color === b.color,
        };
      });
      const status = document.getElementById('status').textContent;
      return { looks, stillBuilding: status.startsWith('Building') };
    });
    expect
      .soft(cardLook, 'A10: the format cards wear the disabled look during a build')
      .toEqual({
        looks: Array(4).fill({
          borderTopStyle: 'dashed',
          boxShadow: 'none',
          background: true,
          borderColor: true,
          name: true,
          what: true,
        }),
        stillBuilding: true,
      });

    // The click above focused the download button, and download() then
    // disabled it, which drops focus to the body. The step bar presses since
    // then (showStep() focuses the second step's heading) and the forced card
    // press can leave focus off the body, so it is blurred here.
    // This stands in for a focus lost to the disabled button, which is what
    // a visitor who clicks and then waits has at the end of the build.
    await page.evaluate(() => document.activeElement?.blur());

    const download = await downloaded;
    const bundle = zipEntries(await readFile(await download.path()));

    // One scale ticked is a module, and the page names a Word module's bundle
    // and its entries hitopsr-word-module; the README travels in every bundle.
    const STEM = 'hitopsr-word-module';
    expect
      .soft(
        Array.from(bundle.keys()),
        'A4: the downloaded bundle holds exactly the three expected entries'
      )
      .toEqual([`${STEM}.docx`, `${STEM}.json`, 'README.txt']);
    const docx = bundle.get(`${STEM}.docx`) ?? Buffer.alloc(0);
    expect
      .soft(
        Array.from(docx.subarray(0, 4)),
        "A5: the bundle's .docx entry begins with the four bytes of a zip container"
      )
      .toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect
      .soft(
        docx.length,
        `A6: the bundle's .docx entry is longer than ${MIN_DOCX_BYTES} bytes`
      )
      .toBeGreaterThan(MIN_DOCX_BYTES);

    // The save comes before download() turns the controls back on, so the
    // read is polled rather than taken once. The button is enabled and on
    // show at the end of the build: two scales are ticked and the second step
    // is the one on show.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''), {
        message: 'A11: focus comes back to the download button when the build ends',
        timeout: 5000,
      })
      .toBe('downloadBtn');

    // A28 reads each format's name in its card title, its download button,
    // its build status and, for the three zip formats, the first line of
    // the README.txt in its zip file. The Word README comes from the build
    // above; a Qualtrics and a REDCap build follow for theirs. A fast build
    // can end before a read taken after the press, so every status text the
    // build writes is recorded from before the press, by an observer on the
    // status element, and the one naming the format is kept. With none, the
    // whole record is kept, so a failure shows what the build wrote.
    seen.readmes.docx = (bundle.get('README.txt')?.toString('utf8') ?? '').split('\n')[0];
    await expect(page.locator('#status'), 'A28: the Word build returns the status to "Ready."')
      .toHaveText(/^Ready\./, { timeout: BUILD_MS });
    for (const format of ['qualtrics', 'redcap']) {
      await page.locator(`[data-choose="${format}"]`).click();
      await page.evaluate(() => {
        const s = document.getElementById('status');
        window.smokeStatuses = [];
        new MutationObserver(() => window.smokeStatuses.push(s.textContent))
          .observe(s, { childList: true, characterData: true, subtree: true });
      });
      const saved = page.waitForEvent('download', { timeout: BUILD_MS });
      await page.locator('#downloadBtn').click();
      const zip = zipEntries(await readFile(await (await saved).path()));
      seen.readmes[format] = (zip.get('README.txt')?.toString('utf8') ?? '').split('\n')[0];
      await expect(page.locator('#status'), `A28: the ${FORMAT_NAMES[format]} build returns the status to "Ready."`)
        .toHaveText(/^Ready\./, { timeout: BUILD_MS });
      const written = await page.evaluate(() => window.smokeStatuses);
      seen.statuses[format] = written.find((t) => t.includes(FORMAT_NAMES[format])) ?? written.join(' | ');
    }
    // The step bar's names, from each button's name span, and the text of
    // each control that changes the step.
    const stepBar = await page.locator('#stepbar button span:not(.num)').allTextContents();
    const controls = [];
    for (const c of STEP_CONTROLS) {
      controls.push(uses((await page.locator(c.sel).textContent())?.trim() ?? null, STEP_NAMES[c.to]));
    }
    expect
      .soft(
        {
          formats: Object.fromEntries(Object.entries(FORMAT_NAMES).map(([f, name]) => [f, {
            card: seen.cards[f],
            button: uses(seen.buttons[f], name),
            status: uses(seen.statuses[f], name),
            readme: f === 'online' ? null : uses(seen.readmes[f], name),
          }])),
          stepBar: stepBar.map((t) => t.trim()),
          controls,
        },
        "A28: each format's card title, download button, build status and README.txt title use its one name, and each step control holds its target step's name"
      )
      .toEqual({
        formats: Object.fromEntries(Object.entries(FORMAT_NAMES).map(([f, name]) => [f, {
          card: name, button: name, status: name, readme: f === 'online' ? null : name,
        }])),
        stepBar: STEP_NAMES,
        controls: STEP_CONTROLS.map((c) => STEP_NAMES[c.to]),
      });

    // A failed build, the run's last step. URL.createObjectURL is made to
    // throw, so the next Word build fails at its save, after R has written
    // the files, and the error reaches download()'s catch as any build
    // failure does. "Technical details" is read before the press, closed, so
    // the section's state after the press is the failure's doing.
    const beforeFailure = await readTechState(page);
    await page.evaluate(() => {
      URL.createObjectURL = () => { throw new Error('made to fail by the smoke test (A30)'); };
    });
    await page.locator('[data-choose="docx"]').click();
    // A31 starts from the place a visitor builds from: the download button
    // at the foot of the window, with "Technical details" below it, out of
    // sight. A short window makes that start hold whatever the height of the
    // content above the button, and A31 asserts it rather than assuming it.
    // The button is in view, so the click below does not scroll.
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.locator('#downloadBtn').evaluate((b) => b.scrollIntoView({ block: 'end' }));
    const boxBefore = await readSummaryBox(page);
    await page.locator('#downloadBtn').click();
    await expect(page.locator('#status'), 'A30: the page reports the failed build')
      .toHaveText(/^The Word form build failed\./, { timeout: BUILD_MS });
    const afterFailure = await readTechState(page);
    expect
      .soft(
        {
          openBefore: beforeFailure.open,
          open: afterFailure.open,
          rendered: afterFailure.rendered,
          namesIt: afterFailure.status.includes(`"${TECH_DETAILS}"`),
        },
        'A30: a build that fails opens "Technical details", and the status names it'
      )
      .toEqual({ openBefore: false, open: true, rendered: true, namesIt: true });
    const boxAfter = await readSummaryBox(page);
    expect
      .soft(
        {
          belowBefore: boxBefore.top >= boxBefore.height,
          inWindowAfter: boxAfter.top >= 0 && boxAfter.bottom <= boxAfter.height,
        },
        'A31: a build that fails while the "Technical details" summary is below the window brings the summary wholly into the window'
      )
      .toEqual({ belowBefore: true, inWindowAfter: true });
  } finally {
    await target.close();
  }
});

// A start-up that fails after R started. The status write that opens the
// package download is made to throw, through the textContent setter, for
// that one text alone, so every other write, the failure's own status
// included, goes through. The throw comes after R's start and before the
// install begins, so this test boots R but downloads no package.
test('a start-up that fails after R started says so', async ({ page }) => {
  const target = await openTarget();
  try {
    await page.addInitScript(() => {
      const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(Node.prototype, 'textContent', {
        ...d,
        set(v) {
          if (this.id === 'status' && String(v).startsWith('Downloading the hitop package')) {
            throw new Error('made to fail by the smoke test (A32)');
          }
          d.set.call(this, v);
        },
      });
    });
    await page.goto(target.url);
    await expect(page.locator('#status'), 'A32: the page reports the failed start-up')
      .toHaveText(/^R (started|did not)/, { timeout: BOOT_MS });
    const failed = await readTechState(page);
    expect
      .soft(
        {
          status: failed.status.startsWith(`${SETUP_FAILED} `) ? SETUP_FAILED : failed.status,
          open: failed.open,
          rendered: failed.rendered,
          namesIt: failed.status.includes(`"${TECH_DETAILS}"`),
          controlsHidden: await page.locator('#controls').isHidden(),
        },
        'A32: a start-up that throws after R started says so in the status, opens "Technical details", and leaves the controls hidden'
      )
      .toEqual({ status: SETUP_FAILED, open: true, rendered: true, namesIt: true, controlsHidden: true });
  } finally {
    await target.close();
  }
});

// A failed load: the webr.mjs request is refused, so R never arrives. The
// page stops, and the status points at "Technical details", which is open.
test('a failed load opens Technical details', async ({ page }) => {
  const target = await openTarget();
  try {
    // A short window, so the opened section reaches past its foot and a
    // scroll to it would move the page (A33).
    await page.setViewportSize({ width: 1280, height: 300 });
    await page.route(WEBR_MJS, (route) => route.abort());
    await page.goto(target.url);
    await expect(page.locator('#status'), 'A22: the page reports the failed load')
      .toHaveText(/^R did not load\./, { timeout: BOOT_MS });
    const failed = await readTechState(page);
    expect
      .soft(
        {
          sections: failed.sections,
          open: failed.open,
          rendered: failed.rendered,
          namesIt: failed.status.includes(`"${TECH_DETAILS}"`),
        },
        'A22: a failed load opens "Technical details", and the status names it'
      )
      .toEqual({ sections: 1, open: true, rendered: true, namesIt: true });
    const after = await page.evaluate(() => ({
      scrollY: window.scrollY,
      sectionBelow: document.getElementById('techDetails').getBoundingClientRect().bottom > window.innerHeight,
    }));
    expect
      .soft(after, 'A33: a failed load leaves the page unscrolled, with the open section reaching below the window')
      .toEqual({ scrollY: 0, sectionBelow: true });
  } finally {
    await target.close();
  }
});
