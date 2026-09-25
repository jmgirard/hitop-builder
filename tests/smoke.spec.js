// The smoke test: one headless run of the builder page, from a cold boot to a
// Word form on disk. It drives the page the way a visitor does -- it reads no
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
//   A14: the link-builder anchor after the save carries the saved file in its c, opens a new tab, and has rel noopener
//   A15: a tick change removes the anchor, and a second online save puts back exactly one carrying the second file
//   A16: no link-builder anchor is in the document while a second online save begun with the first save's link present runs
//   A17: a tick during an online build leaves no link-builder anchor at the build's end
//   A18: a press of the Word card after an online save removes the anchor and hides its paragraph, and the Online card pressed again keeps the anchor
//   A19: the status names the saved file and the link after an online save, and reads "Ready." after the guarded save and after a tick that removed the link
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

// hitop-form's link builder, and the decoding of its `c` parameter: the
// inverse of the page's base64url(), written here on its own so the test
// reads nothing from the page.
const LINK_BUILDER = 'https://jmgirard.github.io/hitop-form/link.html';
function decodeC(c) {
  const b64 = c.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
}

// What the test reads of the link-builder anchor, or null with none in the
// document. Anchors are found by their text so a hidden or relocated one
// still counts; the count is the whole document's.
async function readAnchor(page) {
  const anchors = page.getByRole('link', { name: 'Continue to the link builder', includeHidden: true });
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

// The status an online save ends on when it puts the link in. A save that
// puts no link in, and every other build, ends on the bare "Ready.".
const SAVED_STATUS = 'Ready. The scoring file is saved. The link to the link builder is under the button.';

// Presses the download button and waits for the status to come back to one
// beginning with "Ready.", counting the download events in between. The
// saved file's text is read back, so the test compares what the browser was
// handed, and the status text is returned, so a caller can read which
// "Ready." the save ended on. The wait takes either, so a save ending on the
// wrong one fails the read that names it (A19) rather than stopping the run
// here.
async function saveOnline(page, downloads, label) {
  const before = downloads.length;
  await page.locator('#downloadBtn').click();
  await expect(page.locator('#status'), label).toHaveText(/^Ready\./, { timeout: BUILD_MS });
  const status = await page.locator('#status').textContent();
  const saved = downloads.slice(before);
  const text = saved.length === 1 ? await readFile(await saved[0].path(), 'utf8') : '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { count: saved.length, name: saved[0]?.suggestedFilename() ?? '', text, parsed, status };
}

// What the test reads of the page around the link, in one call: the count of
// link-builder anchors in the whole document, found by their text as
// readAnchor() finds them; whether the paragraph that holds the link carries
// the hidden attribute (null with no such paragraph, which no expectation
// below accepts); and the status text. One call, so the three are read from
// one state of the page.
function readLinkState(page) {
  return page.evaluate(() => ({
    anchors: [...document.querySelectorAll('a')]
      .filter((a) => a.textContent.trim() === 'Continue to the link builder').length,
    hidden: document.getElementById('onlineNext')?.hasAttribute('hidden') ?? null,
    status: document.getElementById('status').textContent,
  }));
}

test('the page boots, lists scales, and builds a Word form', async ({ page }) => {
  let server = null;
  let url = TARGET;
  if (!url && REQUIRE_TARGET) {
    throw new Error(
      'SMOKE_REQUIRE_TARGET is set but SMOKE_TARGET is empty: this run was ' +
        'meant to drive a deployed page and would have driven a local copy.'
    );
  }
  if (!url) {
    server = await serveDir(SERVE_DIR);
    url = `${server.origin}/index.html`;
  }

  try {
    // Recorded so every run says on its own face which page it drove: the two
    // targets are indistinguishable in the report otherwise, and a run against
    // the wrong one still looks green.
    console.log(`smoke target: ${url}`);
    test.info().annotations.push({ type: 'smoke target', description: url });

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
    // pointing at the link builder with a c that decodes to the instrument
    // and the module the saved file holds.
    const afterSave = await readAnchor(page);
    expect
      .soft(
        afterSave,
        'A14: the link-builder anchor after the save carries the saved file in its c, opens a new tab, and has rel noopener'
      )
      .toEqual({
        count: 1,
        anchor: {
          base: LINK_BUILDER,
          target: '_blank',
          rel: 'noopener',
          decoded: { instrument: 'hitopsr', module: first.parsed },
        },
      });

    // A second online save, pressed with the first save's link still in the
    // document. download() takes the link out before anything else, so no
    // anchor is in the document while the build runs. The count is read in
    // one call right after the press, with the button's state, as A17's
    // tick is: a read that landed after the build ended reads the button as
    // on and fails here as a false red, never a false green. The same read
    // is taken before the press, where it shows the count finds the anchor.
    // The wait takes any "Ready.", as saveOnline() does.
    const beforeSecondPress = await readLinkState(page);
    await page.locator('#downloadBtn').click();
    const atSecondPress = await page.evaluate(() => ({
      anchors: [...document.querySelectorAll('a')]
        .filter((a) => a.textContent.trim() === 'Continue to the link builder').length,
      building: document.getElementById('downloadBtn').disabled,
    }));
    await expect(page.locator('#status'), 'A16: the second online save returns the status to a "Ready."')
      .toHaveText(/^Ready\./, { timeout: BUILD_MS });
    expect
      .soft(
        { anchorsBeforePress: beforeSecondPress.anchors, ...atSecondPress },
        "A16: no link-builder anchor is in the document while a second online save begun with the first save's link present runs"
      )
      .toEqual({ anchorsBeforePress: 1, anchors: 0, building: true });

    // A tick change removes the anchor and returns the status to "Ready.".
    // The second scale is unticked, which leaves the first alone: the one
    // scale the Word build below starts from. A second online save from it
    // puts exactly one anchor back, carrying the second file, whose items
    // are the first scale's.
    await page.locator('#stepbar button[data-goto="0"]').click();
    await rows.filter({ has: page.locator('.nm', { hasText: new RegExp(`^${ONLINE_SCALES[1]}$`) }) })
      .locator('input[type=checkbox]').uncheck();
    const afterTick = { ...(await readAnchor(page)), status: await page.locator('#status').textContent() };
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
    // second scale is unticked again once the build ends, so the second
    // save below starts from the one scale, and its link is the one the Word
    // build further down starts with.
    const midBefore = downloads.length;
    await page.locator('#downloadBtn').click();
    const atTick = await page.evaluate(() => {
      const box = document.querySelectorAll('#scales input')[1];
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return { buildingAtTick: document.getElementById('downloadBtn').disabled };
    });
    // The wait is on the bare "Ready.": the save put no link in, so the
    // status must not name one. The text is read again for A19.
    await expect(page.locator('#status'), 'A17: the mid-tick online save returns the status to "Ready."')
      .toHaveText('Ready.', { timeout: BUILD_MS });
    const statusAfterMidTick = await page.locator('#status').textContent();
    expect
      .soft(
        {
          buildingAtTick: atTick.buildingAtTick,
          downloads: downloads.length - midBefore,
          anchors: (await readAnchor(page)).count,
        },
        "A17: a tick during an online build leaves no link-builder anchor at the build's end"
      )
      .toEqual({ buildingAtTick: true, downloads: 1, anchors: 0 });
    await page.evaluate(() => {
      const box = document.querySelectorAll('#scales input')[1];
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const second = await saveOnline(page, downloads, 'A15: the second online save returns the status to "Ready."');
    const afterSecond = await readAnchor(page);
    expect
      .soft(
        {
          afterTick: afterTick.count,
          afterSecond: afterSecond.count,
          secondDownloads: second.count,
          secondItems: second.parsed?.items ?? null,
          secondDecoded: afterSecond.anchor?.decoded ?? null,
        },
        'A15: a tick change removes the anchor, and a second online save puts back exactly one carrying the second file'
      )
      .toEqual({
        afterTick: 0,
        afterSecond: 1,
        secondDownloads: 1,
        secondItems: ONLINE_ITEMS_FIRST,
        secondDecoded: { instrument: 'hitopsr', module: second.parsed },
      });

    // The status line, the page's one announced region, is what tells a
    // visitor the link is there. Three reads: after the first save, which put
    // a link in; after the mid-tick save, which put none in; and after the
    // untick that took one out.
    expect
      .soft(
        { afterFirstSave: first.status, afterMidTickSave: statusAfterMidTick, afterUntick: afterTick.status },
        'A19: the status names the saved file and the link after an online save, and reads "Ready." after the guarded save and after a tick that removed the link'
      )
      .toEqual({ afterFirstSave: SAVED_STATUS, afterMidTickSave: 'Ready.', afterUntick: 'Ready.' });

    // A press of another format's card takes the link out and hides its
    // paragraph: the link belongs with the online card. The Word card stands
    // for the three, which share setFormat(). The read before the press
    // shows the count and the paragraph are found. After the press, the
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
        'A18: a press of the Word card after an online save removes the anchor and hides its paragraph, and the Online card pressed again keeps the anchor'
      )
      .toEqual({
        beforeWordPress: { anchors: 1, hidden: false, status: SAVED_STATUS },
        afterWordPress: { anchors: 0, hidden: true, status: 'Ready. Word form chosen.' },
        thirdDownloads: 1,
        afterOnlineAgain: { anchors: 1, hidden: false, status: 'Ready. Online form chosen.' },
      });

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
    // "Building the DOCX file…" at the click and nothing else until the build
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
  } finally {
    if (server) await server.close();
  }
});
