// The prose extraction: every string a visitor can read, listed so a linter
// can read it too, and the facts each passage carries, so a rewrite can be
// shown to have kept them.
//
// The domain has four parts, in the order they are emitted:
//
//   body     the text of every element in <body>, outside <script> and
//            <style>, one passage per block element, with the `placeholder`
//            and `aria-label` attributes as passages of their own
//   script   every string that reaches the page as text: the arguments of
//            status(), log() and abandonBoot(), the strings inside the
//            functions that write the tally, the recap, the settings
//            summaries, the "Select all" label and the crosswalk sentence,
//            FORMATS[].label and .button, the version line, and the message
//            the <script nomodule> block writes
//   readme   the README.txt the page puts in a bundle, one passage per format,
//            produced by running the page's own bundleReadme() code
//   md       README.md, one passage per section, for the facts pass only:
//            the linter reads that file directly
//
// Excluded on purpose: the scale names and definitions the page renders from
// the package (`s.Scale`, `s.Brief`, `s.nItems`), and the two `Ready.` status
// strings the smoke test pins. Each exclusion is listed in WRITERS below.
//
// WRITERS is a ledger of every site in the script that writes text or an
// attribute into the page. The script greps the source for such sites and
// refuses to run if the count differs from the ledger, so a writer added
// later has to be classified here before the extraction is trusted again.
//
// Usage:
//   node tests/prose.mjs [--ref <git ref>] [--text <out.md>] [--json <out.json>]
//                        [--compare <baseline.json>]
//
// --ref reads index.html and README.md from a git ref instead of the working
// tree. --text writes the passages for the linter: code tokens in backticks,
// URLs bare. --json writes the passages with their facts. --compare reads a
// JSON written earlier and reports every passage whose facts differ, exiting 1
// if any do. Facts are compared as multisets: the same tokens the same number
// of times, in any order.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- Arguments ---------------------------------------------------------

const args = process.argv.slice(2);
function opt(name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  if (i + 1 >= args.length) throw new Error(`missing value after ${name}`);
  return args[i + 1];
}
const REF = opt('--ref');
const TEXT_OUT = opt('--text');
const JSON_OUT = opt('--json');
const COMPARE = opt('--compare');

function source(file) {
  if (REF) return execFileSync('git', ['show', `${REF}:${file}`], { cwd: REPO, encoding: 'utf8' });
  return readFileSync(path.join(REPO, file), 'utf8');
}

const html = source('index.html');
const readme = source('README.md');

// ---- Small helpers -----------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '\u2014', ndash: '\u2013', nbsp: '\u00a0', hellip: '\u2026' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10));
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}
function squash(s) {
  return s.replace(/\s+/g, ' ').trim();
}
// Decodes the escapes a JS string literal can carry, so the linter sees the
// character the visitor sees: \u2014 is an em dash on the page.
function unescapeJs(s) {
  return s.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|x[0-9a-f]{2}|.)/gis, (m, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r' }[e] ?? e;
  });
}

// ---- Part 1: the body ---------------------------------------------------

// Elements that end one passage and start the next. Everything else is
// inline and its text runs on. <code> becomes a backticked token and <a>
// contributes its href, bare, after its text.
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'li', 'div', 'section', 'nav', 'footer', 'pre',
  'label', 'legend', 'fieldset', 'summary', 'details', 'button', 'noscript', 'ol', 'ul',
  'input', 'span:block']);

function bodyPassages(html) {
  let body = html.slice(html.indexOf('<body'));
  body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  const passages = [];
  let current = null;
  const attrs = []; // placeholder and aria-label values, emitted after the text

  function open(tag, attrText) {
    const id = /\bid="([^"]*)"/.exec(attrText)?.[1] ?? '';
    const facts = [];
    if (id) facts.push(`id=${id}`);
    for (const m of attrText.matchAll(/\bdata-([\w-]+)="([^"]*)"/g)) facts.push(`data-${m[1]}=${m[2]}`);
    for (const m of attrText.matchAll(/\b(placeholder|aria-label)="([^"]*)"/g)) {
      attrs.push({ id: `attr:${m[1]}${id ? '#' + id : ''}`, text: decodeEntities(m[2]) });
    }
    if (BLOCK.has(tag)) {
      flush();
      current = { tag, id, text: '', attrFacts: facts };
    } else if (current) {
      current.attrFacts.push(...facts);
      if (tag === 'a') {
        const href = /\bhref="([^"]*)"/.exec(attrText)?.[1];
        if (href) current.pendingHref = href;
      }
      if (tag === 'code') current.inCode = true;
    }
  }
  function close(tag) {
    if (!current) return;
    if (tag === 'code') { current.inCode = false; return; }
    if (tag === 'a' && current.pendingHref) {
      current.text += ` ${current.pendingHref} `;
      current.pendingHref = null;
      return;
    }
    if (BLOCK.has(tag)) flush();
  }
  function text(t) {
    if (!current) return;
    const decoded = decodeEntities(t);
    if (current.inCode) current.text += ' `' + squash(decoded) + '` ';
    else current.text += decoded;
  }
  function flush() {
    if (!current) return;
    const t = squash(current.text);
    if (t || current.attrFacts.length) {
      passages.push({
        id: `body:${passages.length}:${current.tag}${current.id ? '#' + current.id : ''}`,
        text: t,
        extraFacts: current.attrFacts,
      });
    }
    current = null;
  }

  const re = /<\/?([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;
  for (const m of body.matchAll(re)) {
    if (m[3] !== undefined) { text(m[3]); continue; }
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') close(tag);
    else {
      open(tag, m[2]);
      if (tag === 'input' || tag === 'br') close(tag);
    }
  }
  flush();
  return passages.concat(attrs.map((a) => ({ id: a.id, text: a.text, extraFacts: [] })));
}

// ---- Part 2: the script ------------------------------------------------

const moduleScript = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
const nomoduleScript = /<script nomodule>([\s\S]*?)<\/script>/.exec(html)[1];

// The ledger. `anchor` occurs exactly once in the source; `covered` names the
// part of the extraction that carries the site's text, or the reason it is
// excluded.
const WRITERS = [
  { anchor: "document.getElementById('status').textContent =", covered: 'nomodule message' },
  { anchor: 'logPane.textContent +=', covered: 'log() calls' },
  { anchor: "function status(text) { el('status').textContent = text; }", covered: 'status() and abandonBoot() calls' },
  { anchor: "el('downloadBtn').textContent = FORMATS[format].button;", covered: 'FORMATS[].button' },
  { anchor: "b.setAttribute('aria-current', 'true')", covered: 'excluded: an attribute value, not text' },
  { anchor: 'span.textContent = settingsSummary(span.dataset.summary);', covered: 'settingsSummary() and namingSummary()' },
  { anchor: "b.setAttribute('aria-current', 'step')", covered: 'excluded: an attribute value, not text' },
  { anchor: "document.querySelectorAll('.recapText')) span.textContent = text;", covered: 'selectionSentence()' },
  { anchor: "el('tally').textContent = selectionSentence();", covered: 'selectionSentence()' },
  { anchor: "box.textContent = '';", covered: 'excluded: clears the list' },
  { anchor: 'name.textContent = s.Scale;', covered: 'excluded: a scale name from the package' },
  { anchor: 'n.textContent = `${s.nItems}`;', covered: 'excluded: an item count from the package' },
  { anchor: "desc.setAttribute('role', 'tooltip');", covered: 'excluded: an attribute value, not text' },
  { anchor: 'desc.textContent = s.Brief;', covered: 'excluded: a scale definition from the package' },
  { anchor: "input.setAttribute('aria-describedby', desc.id);", covered: 'excluded: an attribute value, not text' },
  { anchor: "el('shuffleCrosswalk').textContent = crosswalkSentence();", covered: 'crosswalkSentence()' },
  { anchor: "el('selectAll').textContent =", covered: 'refreshSelectAllLabel()' },
  { anchor: "el('pkgver').textContent = `(version ${version})`;", covered: 'the version line' },
];

function checkWriters() {
  const grep = [...html.matchAll(/\.(textContent|innerHTML)\s*\+?=|\.setAttribute\(/g)].length;
  if (grep !== WRITERS.length) {
    throw new Error(`the source has ${grep} writer sites and the ledger lists ${WRITERS.length}; classify the difference in WRITERS`);
  }
  for (const w of WRITERS) {
    const hits = html.split(w.anchor).length - 1;
    if (hits !== 1) throw new Error(`ledger anchor found ${hits} times, expected 1: ${JSON.stringify(w.anchor)}`);
  }
  return grep;
}

// Reads one JS expression made of string literals, templates and other
// pieces joined by `+`, and renders it as prose: literals decoded, a
// template's ${...} and any non-literal piece as a backticked code token.
function renderStringExpr(expr) {
  let out = '';
  let i = 0;
  const s = expr;
  let other = '';
  function flushOther() {
    const t = other.trim().replace(/^\+|\+$/g, '').trim();
    if (t && t !== '+') out += ' `' + t + '` ';
    other = '';
  }
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      flushOther();
      let j = i + 1; let lit = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') { lit += s[j] + s[j + 1]; j += 2; } else lit += s[j++]; }
      out += unescapeJs(lit);
      i = j + 1;
    } else if (c === '`') {
      flushOther();
      let j = i + 1; let raw = '';
      while (j < s.length && s[j] !== '`') {
        if (s[j] === '\\') { raw += s[j] + s[j + 1]; j += 2; continue; }
        if (s[j] === '$' && s[j + 1] === '{') {
          let depth = 1; let k = j + 2;
          while (k < s.length && depth) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; k++; }
          raw += '`${' + s.slice(j + 2, k - 1).trim() + '}`';
          j = k; continue;
        }
        raw += s[j++];
      }
      out += unescapeJs(raw);
      i = j + 1;
    } else if (c === '+' && /^\s*$/.test(other)) {
      other = ''; i++;
    } else {
      other += c; i++;
    }
  }
  flushOther();
  return squash(out);
}

// Finds every call of one of `names` outside a definition and returns each
// call's argument text, read with a scanner that respects strings and nested
// parentheses.
function callArgs(src, names) {
  const found = [];
  const re = new RegExp(`(^|[^.\\w$])(${names.join('|')})\\(`, 'g');
  for (const m of src.matchAll(re)) {
    const before = src.slice(Math.max(0, m.index - 9), m.index + m[1].length);
    if (/function\s*$/.test(before)) continue;
    let i = m.index + m[0].length; let depth = 1; let q = null; const start = i;
    while (i < src.length && depth) {
      const c = src[i];
      if (q) {
        if (c === '\\') { i += 2; continue; }
        if (c === q) q = null;
        else if (q === '`' && c === '$' && src[i + 1] === '{') {
          // Skip the template hole, which may hold quotes and parens.
          let d = 1; i += 2;
          while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; }
          continue;
        }
        i++; continue;
      }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    found.push({ name: m[2], arg: src.slice(start, i - 1), line: src.slice(0, m.index).split('\n').length });
  }
  return found;
}

// Returns the body of `function name(...) { ... }`.
function functionBody(src, name) {
  const m = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{`).exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  let i = m.index + m[0].length; let depth = 1; const start = i; let q = null;
  while (i < src.length && depth) {
    const c = src[i];
    if (q) { if (c === '\\') { i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

// Every string literal in a function body, adjacent `+`-joined literals
// merged into one passage. Fragments of a ternary or an array are passages
// of their own.
function literalsIn(body) {
  const out = [];
  // Selectors, ids and comparison operands are not text a visitor reads.
  body = body
    .replace(/\b(el|querySelector|querySelectorAll)\((['"])[^'"]*\2\)/g, '')
    .replace(/[!=]==\s*(['"])[^'"]*\1/g, '');
  const re = /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|\$\{[^}]*\}|[^`\\])*`)(\s*\+\s*(?='|"|`))?/g;
  let acc = '';
  for (const m of body.matchAll(re)) {
    acc += m[1];
    if (m[2]) { acc += ' + '; continue; }
    out.push(renderStringExpr(acc));
    acc = '';
  }
  return out.filter((t) => t && !/^`[^`]*`$/.test(t) && t.length > 1);
}

// The `Ready.` strings the smoke test pins, left out of the linted domain.
const PINNED = [/^Ready\.$/, /^Ready\. `\$\{[^}]*\}` chosen\.$/];

function scriptPassages() {
  const passages = [];
  const add = (id, text, { code = false } = {}) => {
    if (!text) return;
    if (PINNED.some((p) => p.test(text))) return;
    // A passage that is nothing but code tokens carries no prose, unless it
    // is listed as code on purpose.
    if (!code && !text.replace(/`[^`]*`/g, '').trim()) return;
    passages.push({ id, text, extraFacts: [] });
  };
  add('nomodule', renderStringExpr(/textContent =([\s\S]*?);/.exec(nomoduleScript)[1]));
  for (const c of callArgs(moduleScript, ['status', 'log', 'abandonBoot'])) {
    const text = renderStringExpr(c.arg);
    // A log line opening with "> " echoes the R call the page makes. It is
    // code, kept verbatim and read as one code token.
    if (c.name === 'log' && text.startsWith('> ')) {
      add(`${c.name}@${c.line}`, '`' + text.replace(/`/g, '') + '`', { code: true });
    } else {
      add(`${c.name}@${c.line}`, text);
    }
  }
  for (const m of moduleScript.matchAll(/\b(label|button): ('(?:\\.|[^'\\])*'),/g)) {
    add(`FORMATS.${m[1]}@${moduleScript.slice(0, m.index).split('\n').length}`, renderStringExpr(m[2]));
  }
  add('pkgver', renderStringExpr(/el\('pkgver'\)\.textContent = (.*);/.exec(moduleScript)[1]));
  for (const fn of ['selectionSentence', 'settingsSummary', 'namingSummary', 'refreshSelectAllLabel', 'crosswalkSentence']) {
    literalsIn(functionBody(moduleScript, fn)).forEach((t, k) => add(`${fn}[${k}]`, t));
  }
  return passages;
}

// ---- Part 3: the bundle README ------------------------------------------

function bundleReadmePassages() {
  const pick = (re) => { const m = re.exec(moduleScript); if (!m) throw new Error(`not found: ${re}`); return m[0]; };
  const code = [
    "const INSTRUMENT = 'hitopsr';",
    pick(/const FORMATS = \{[\s\S]*?\n\};/),
    pick(/const BUNDLE_WHAT = \{[\s\S]*?\n\};/),
    pick(/function wrapIndented[\s\S]*?\n\}/),
    pick(/function questionnaireName[\s\S]*?\n\}/),
    pick(/function bundleReadme[\s\S]*?\n\}/),
    'return { FORMATS, bundleReadme };',
  ].join('\n');
  const { FORMATS, bundleReadme } = new Function(code)();
  return Object.keys(FORMATS).map((format) => ({
    id: `readme:${format}`,
    text: bundleReadme(format, `hitopsr-${FORMATS[format].name}-module`, '0.2.0'),
    extraFacts: [],
  }));
}

// ---- Part 4: README.md, by section ---------------------------------------

function markdownPassages(md) {
  const out = [];
  let title = 'top';
  let buf = [];
  const flush = () => { if (buf.join('').trim()) out.push({ id: `md:${title}`, text: buf.join('\n'), extraFacts: [] }); buf = []; };
  for (const line of md.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { flush(); title = h[1].trim(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

// ---- Facts ---------------------------------------------------------------

// The tokens a passage must keep: URLs, code tokens (backticked, or a
// fenced block's lines), element ids and data-* values written as such,
// and numbers. Read in document order; compared as a multiset.
function facts(passage) {
  const out = [...passage.extraFacts];
  let t = passage.text;
  t = t.replace(/```[\s\S]*?```/g, (b) => { out.push(`fence=${squash(b)}`); return ' '; });
  t = t.replace(/https?:\/\/[^\s)>\]]+/g, (u) => { out.push(`url=${u.replace(/[.,]$/, '')}`); return ' '; });
  t = t.replace(/`([^`\n]+)`/g, (m, c) => { out.push(`code=${c.trim()}`); return ' '; });
  for (const m of t.matchAll(/(?<![\w.])#([A-Za-z][\w-]*)/g)) out.push(`id=${m[1]}`);
  for (const m of t.matchAll(/\bdata-[\w-]+="[^"]*"/g)) out.push(`attr=${m[0]}`);
  for (const m of t.matchAll(/(?<![\w.-])\d[\d.,:-]*\d(?![\w-])|(?<![\w.-])\d(?![\w.-])/g)) out.push(`n=${m[0]}`);
  return out;
}

// ---- Run -----------------------------------------------------------------

const writerCount = checkWriters();
const passages = [
  ...bodyPassages(html),
  ...scriptPassages(),
  ...bundleReadmePassages(),
  ...markdownPassages(readme),
].map((p) => ({ ...p, facts: facts(p) }));

const counts = {};
for (const p of passages) { const k = p.id.split(/[:@\[]/)[0]; counts[k] = (counts[k] ?? 0) + 1; }
console.log(`writer sites: ${writerCount} in the source, ${WRITERS.length} in the ledger`);
console.log(`passages: ${passages.length} (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`);

if (TEXT_OUT) {
  // The linted text is parts 1 to 3; README.md is linted as a file.
  // Each passage sits under a heading the linter ignores and ends with a
  // lone full stop, so a label with no punctuation does not run into the
  // next passage and read as one long sentence.
  const linted = passages.filter((p) => !p.id.startsWith('md:'));
  writeFileSync(TEXT_OUT, linted.map((p) => `## ${p.id}\n${p.text}\n.`).join('\n\n') + '\n');
  console.log(`wrote ${linted.length} passages to ${TEXT_OUT}`);
}
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ ref: REF ?? 'working tree', writerCount, passages }, null, 2) + '\n');
  console.log(`wrote ${JSON_OUT}`);
}
if (COMPARE) {
  const base = JSON.parse(readFileSync(COMPARE, 'utf8'));
  const sorted = (a) => [...a].sort();
  const key = (id) => id.replace(/@\d+/, '');
  const mine = new Map(passages.map((p) => [key(p.id), p]));
  const theirs = new Map(base.passages.map((p) => [key(p.id), p]));
  let bad = 0;
  const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  for (const [id, b] of theirs) {
    const m = mine.get(id);
    if (!m) { console.log(`MISSING ${id}`); bad++; continue; }
    if (!same(m.facts, b.facts)) {
      bad++;
      const lost = sorted(b.facts).filter((f) => !m.facts.includes(f));
      const gained = sorted(m.facts).filter((f) => !b.facts.includes(f));
      console.log(`DIFFER ${id}\n  lost: ${lost.join(' | ') || '-'}\n  gained: ${gained.join(' | ') || '-'}`);
    }
  }
  for (const id of mine.keys()) if (!theirs.has(id)) { console.log(`NEW ${id}`); bad++; }
  console.log(bad ? `${bad} passages differ from ${COMPARE}` : `every passage keeps the facts in ${COMPARE}`);
  process.exit(bad ? 1 : 0);
}
