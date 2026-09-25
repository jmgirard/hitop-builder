// The plant matrix: proof that the smoke test can fail, and on what.
//
// Each plant below is one defect the smoke test claims to catch, written into
// a copy of index.html in a scratch directory. The matrix runs the smoke test
// against each planted copy and against an unplanted one, records which of the
// spec file's enumerated assertions failed in each run, and finishes by
// checking that every assertion the spec file enumerates was failed by at
// least one plant -- an assertion no plant can fail is one this matrix says
// nothing about.
//
// Run it with `npm run plants`. Each run boots webR and installs the hitop
// package, so the whole matrix takes several minutes.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(REPO, 'tests', 'smoke.spec.js');

const PLANTS = [
  {
    id: 'a',
    what: 'MIN_HITOP raised to 99.0.0, unreachable by construction',
    from: "const MIN_HITOP = '0.2.0';",
    to: "const MIN_HITOP = '99.0.0';",
  },
  {
    id: 'b',
    what: 'the download button renamed',
    // Renamed at every site, not only in the markup. Renaming the id alone
    // would make main() throw on el('downloadBtn') before the page ever
    // reached "Ready.", so the run would go red on a page that never started
    // -- which is a different defect from the one this plant is about. Renamed
    // consistently, the page works exactly as before and the only thing that
    // breaks is the smoke test's own selector, which is the claim.
    edits: [
      { from: 'id="downloadBtn"', to: 'id="downloadBtnRenamed"' },
      { from: "el('downloadBtn').textContent", to: "el('downloadBtnRenamed').textContent" },
      { from: "el('downloadBtn').addEventListener", to: "el('downloadBtnRenamed').addEventListener" },
    ],
  },
  {
    id: 'c',
    what: 'WEBR_URL pointed at a path that returns 404',
    from: "const WEBR_URL = 'https://webr.r-wasm.org/v0.6.0/webr.mjs';",
    to: "const WEBR_URL = 'https://webr.r-wasm.org/v0.6.0/no-such-webr.mjs';",
  },
  {
    id: 'd',
    what: 'the download handler hands over a 12-byte non-zip blob as the bundle',
    from: "saveFile(bundleBytes, 'application/zip', `${stem}.zip`);",
    to: "saveFile(new Uint8Array(12), 'application/zip', `${stem}.zip`);",
  },
  {
    id: 'g',
    what: 'the README left out of the bundle',
    from: 'files = c(out_path, desc_path, readme_path),',
    to: 'files = c(out_path, desc_path),',
  },
  {
    id: 'h',
    what: 'the Word form inside the bundle replaced by a 12-byte stub',
    // Planted after the generator wrote the real form and before the bundle
    // is zipped, so the bundle itself is a well-formed zip with the right
    // three names and only its .docx entry is wrong.
    from: '    const bytes = await webR.FS.readFile(path);',
    to: '    await webR.FS.writeFile(path, new Uint8Array(12));\n' +
      '    const bytes = await webR.FS.readFile(path);',
  },
  {
    id: 'e',
    what: "the picker's render truncated to one scale row",
    from: '  const withDefs = definitionsAvailable();\n  for (const s of scales) {',
    to: '  const withDefs = definitionsAvailable();\n  for (const s of scales.slice(0, 1)) {',
  },
  {
    id: 'f',
    what: 'one rendered row given an empty name',
    from: '    name.textContent = s.Scale;',
    to: "    name.textContent = s === scales[0] ? '' : s.Scale;",
  },
  {
    id: 'i',
    what: 'the build flag dropped from the button state refreshTally() sets',
    // download() still turns the button off at its start and still turns away
    // a second call, so the page builds as before. Only a refreshTally() call
    // during a build that leaves a scale ticked now turns the button back on.
    // A8's tick is such a call.
    from: '    b.disabled = bootAbandoned || building || selected().length === 0;',
    to: '    b.disabled = bootAbandoned || selected().length === 0;',
  },
  {
    id: 'j',
    what: "the format cards left on during a build",
    // Only the line that turns the cards off is removed. The build still runs
    // on the format read at the click, so the bundle is the same Word bundle.
    // What changes is that A9's press on the Qualtrics card now reaches
    // setFormat() during the build.
    from: '    cards.forEach((b) => (b.disabled = true));\n',
    to: '',
  },
  {
    id: 'k',
    what: 'the disabled look of the format cards removed',
    // Only the two card rules are removed, so the cards are still turned off
    // during a build and A9 still passes. Without them, the card rules put the
    // card background, the current card's solid border and the muted
    // description colour back over the page's disabled pair, which is what
    // A10 reads.
    from:
      '  .formats button:disabled {\n' +
      '    background: var(--surface-2); border-color: var(--line); border-style: dashed;\n' +
      '    box-shadow: none;\n' +
      '  }\n' +
      '  .formats button:disabled .fmtname,\n' +
      '  .formats button:disabled .fmtwhat { color: var(--disabled-fg); }\n',
    to: '',
  },
  {
    id: 'l',
    what: 'the focus return at the end of a build removed',
    // Only the focus() call is removed, so the build, the save and the
    // controls' state at the end are the same as before. What changes is that
    // focus stays on the body after the build, which is what A11 reads.
    from: '      focusAtClick.focus({ preventScroll: true });\n',
    to: '',
  },
  {
    id: 'm',
    what: 'the online card absent',
    // The whole card is removed, so the second step shows three cards and
    // A12, read before the press, fails by name.
    from:
      '      <button type="button" data-choose="online">\n' +
      '        <span class="fmtname">Online form</span>\n' +
      '        <span class="fmtwhat">A scoring file for the online form, to paste into the study link builder.</span>\n' +
      '      </button>\n',
    to: '',
  },
  {
    id: 'n',
    what: 'the saved scoring file under a wrong name',
    from: "saveFile(descBytes, 'application/json', `${stem}.json`);",
    to: "saveFile(descBytes, 'application/json', `${stem}.txt`);",
  },
  {
    id: 'o',
    what: "the saved scoring file's items out of order",
    // The file's items array is reversed in the text the browser is handed.
    // The anchor is made from the same text, so its c still equals the file
    // and only A13 reads the difference.
    from:
      '      const descBytes = await webR.FS.readFile(descPath);\n' +
      "      saveFile(descBytes, 'application/json'",
    to:
      '      const descBytes = new TextEncoder().encode(\n' +
      '        new TextDecoder().decode(await webR.FS.readFile(descPath)).replace(\n' +
      '          /"items": \\[([^\\]]*)\\]/,\n' +
      "          (m, s) => '\"items\": [' + s.split(', ').reverse().join(', ') + ']'\n" +
      '        )\n' +
      '      );\n' +
      "      saveFile(descBytes, 'application/json'",
  },
  {
    id: 'p',
    what: "the anchor's c carrying a module that differs from the saved file",
    from: 'showLinkBuilder(JSON.parse(new TextDecoder().decode(descBytes)));',
    to: 'showLinkBuilder({ ...JSON.parse(new TextDecoder().decode(descBytes)), nItems: 0 });',
  },
  {
    id: 'q',
    what: "the anchor's c lacking instrument",
    from: 'base64url(JSON.stringify({ instrument: INSTRUMENT, module }));',
    to: 'base64url(JSON.stringify({ module }));',
  },
  {
    id: 'r',
    what: 'the anchor on a wrong base URL',
    from: "const LINK_BUILDER = 'https://jmgirard.github.io/hitop-form/link.html';",
    to: "const LINK_BUILDER = 'https://jmgirard.github.io/hitop-form/index.html';",
  },
  {
    id: 's',
    what: 'the anchor without target',
    from: '<a target="_blank" rel="noopener">Continue to the link builder</a>',
    to: '<a rel="noopener">Continue to the link builder</a>',
  },
  {
    id: 't',
    what: 'the anchor without rel',
    from: '<a target="_blank" rel="noopener">Continue to the link builder</a>',
    to: '<a target="_blank">Continue to the link builder</a>',
  },
  {
    id: 'u',
    what: 'an anchor left in the document after a Word build',
    // Only the removal at the start of a build is dropped. The tick removal
    // and the replacement on an online save still run, so A15 holds and only
    // A16, read at the start of the Word build, sees the anchor.
    from: '    removeLinkBuilder();\n    status(`Building the',
    to: '    status(`Building the',
  },
];

// The assertions this matrix must cover, read out of the spec file itself
// rather than restated here: a spec that grows an assertion has to grow a
// plant that fails it, and reading the list from the spec is what notices.
async function enumeratedAssertions() {
  const spec = await readFile(SPEC, 'utf8');
  const ids = [...spec.matchAll(/^\/\/\s+(A\d+): /gm)].map((m) => m[1]);
  if (ids.length === 0) throw new Error(`no enumerated assertions found in ${SPEC}`);
  return ids;
}

function replaceOnce(html, from, to) {
  const hits = html.split(from).length - 1;
  if (hits !== 1) {
    throw new Error(
      `expected exactly one occurrence of ${JSON.stringify(from)}, found ${hits}`
    );
  }
  return html.replace(from, to);
}

// A plant is one edit (`from`/`to`) or a list of them (`edits`); each is
// applied with replaceOnce, so a plant whose target text has moved or changed
// stops the matrix loudly rather than planting nothing.
function plantEdits(plant) {
  return plant.edits ?? [{ from: plant.from, to: plant.to }];
}

async function plantedCopy(plant) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hitop-plant-'));
  let html = await readFile(path.join(REPO, 'index.html'), 'utf8');
  if (plant) {
    for (const edit of plantEdits(plant)) html = replaceOnce(html, edit.from, edit.to);
  }
  await writeFile(path.join(dir, 'index.html'), html);
  return dir;
}

// Runs the smoke test against one served directory and reports whether it
// passed and which enumerated assertions failed. Retries are off: a planted
// red is exactly what this is asking for, and retrying it wastes minutes.
function runSmoke(dir) {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['playwright', 'test', 'tests/smoke.spec.js', '--reporter=json', '--retries=0'],
      {
        cwd: REPO,
        // SMOKE_REQUIRE_TARGET is cleared along with SMOKE_TARGET: left set by
        // the caller's shell it would make every run here throw the spec's
        // deployed-page guard before a page was ever loaded, and the matrix
        // would report a red that says nothing about any plant.
        env: {
          ...process.env,
          SMOKE_SERVE_DIR: dir,
          SMOKE_TARGET: '',
          SMOKE_REQUIRE_TARGET: '',
          CI: '',
        },
        maxBuffer: 64 * 1024 * 1024,
      },
      (err, stdout) => {
        // A run that produced no usable report says nothing about the plant:
        // a launch error, a browser that would not start, a crashed reporter
        // all land here, and crediting any of them as "the smoke test went
        // red" would let a plant that never ran pass for one that did. It is
        // reported as an error and the matrix fails on it.
        let report;
        try {
          report = JSON.parse(stdout);
        } catch {
          resolve({ error: 'the run produced no JSON report', failed: [] });
          return;
        }
        const results = (report.suites ?? [])
          .flatMap((s) => s.specs ?? [])
          .flatMap((s) => s.tests ?? [])
          .flatMap((t) => t.results ?? []);
        const messages = results.flatMap((r) =>
          (r.errors ?? []).map((e) => e.message ?? '')
        );
        const failed = [
          ...new Set(
            messages.flatMap((m) => [...m.matchAll(/\b(A\d+):/g)].map((x) => x[1]))
          ),
        ].sort();
        if (results.length === 0) {
          resolve({ error: 'the report contained no test results', failed: [] });
          return;
        }
        const passed = results.every((r) => r.status === 'passed');
        const note =
          messages.length && failed.length === 0
            ? messages[0].split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '')
            : '';
        resolve({ passed, failed, note });
      }
    );
  });
}

const assertions = await enumeratedAssertions();
console.log(
  `smoke.spec.js enumerates ${assertions.length} assertions: ${assertions.join(', ')}`
);
console.log('');

const runs = [{ id: '-', what: 'the unplanted copy', plant: null }].concat(
  PLANTS.map((p) => ({ id: p.id, what: p.what, plant: p }))
);

const rows = [];
for (const run of runs) {
  const dir = await plantedCopy(run.plant);
  const label = run.id === '-' ? 'the unplanted copy' : `plant (${run.id})`;
  console.log(`running against ${label}: ${run.what}`);
  const result = await runSmoke(dir);
  await rm(dir, { recursive: true, force: true });
  rows.push({ ...run, ...result });
  console.log(
    `  -> ${result.error ? 'ERROR' : result.passed ? 'PASSED' : 'FAILED'}` +
      (result.failed.length ? ` on ${result.failed.join(', ')}` : '') +
      (result.error ? ` (${result.error})` : result.note ? ` (${result.note})` : '')
  );
  console.log('');
}

console.log('| run | defect planted | outcome | assertion failed |');
console.log('|---|---|---|---|');
for (const r of rows) {
  const name = r.id === '-' ? 'unplanted' : `(${r.id})`;
  const outcome = r.error ? 'errored' : r.passed ? 'passed' : 'failed';
  const which =
    r.failed.join(', ') ||
    r.error ||
    (r.passed ? '--' : r.note || 'no enumerated assertion');
  console.log(`| ${name} | ${r.what} | ${outcome} | ${which} |`);
}
console.log('');

const unplanted = rows.find((r) => r.id === '-');
const covered = new Set(rows.filter((r) => r.id !== '-').flatMap((r) => r.failed));
const uncovered = assertions.filter((a) => !covered.has(a));
const passedWhenPlanted = rows
  .filter((r) => r.id !== '-' && !r.error && r.passed)
  .map((r) => r.id);

// A planted run that went red without failing one of the enumerated assertions
// demonstrated nothing about its plant: a run that timed out or was
// interrupted lands here, red but silent, and its assertion may still be
// covered by another plant -- so the coverage check below would not notice.
const redButSilent = rows
  .filter((r) => r.id !== '-' && !r.error && !r.passed && r.failed.length === 0)
  .map((r) => r.id);

const errored = rows.filter((r) => r.error).map((r) => (r.id === '-' ? 'unplanted' : r.id));

let ok = true;
if (errored.length) {
  console.log(
    `FAIL: runs that produced no usable report, so they say nothing either ` +
      `way: ${errored.join(', ')}`
  );
  ok = false;
}
if (!unplanted.passed) {
  console.log('FAIL: the unplanted copy did not pass.');
  ok = false;
}
if (redButSilent.length) {
  console.log(
    `FAIL: plants that went red without failing an enumerated assertion, so ` +
      `they say nothing about the defect they plant: ${redButSilent.join(', ')}`
  );
  ok = false;
}
if (passedWhenPlanted.length) {
  console.log(
    `FAIL: plants that did not turn the smoke test red: ${passedWhenPlanted.join(', ')}`
  );
  ok = false;
}
if (uncovered.length) {
  console.log(`FAIL: assertions no plant failed: ${uncovered.join(', ')}`);
  ok = false;
}
if (ok) {
  console.log(
    `OK: the unplanted copy passed, all ${PLANTS.length} plants turned the ` +
      'smoke test red, and every enumerated assertion was failed by at least ' +
      'one of them.'
  );
}
process.exit(ok ? 0 : 1);
