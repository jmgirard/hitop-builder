# HiTOP-SR Module Builder

A single-page web app that builds HiTOP-SR modules, questionnaires that hold
only the scales you choose. It downloads them ready to field in Word,
Qualtrics, or REDCap. Each download is one zip bundle that holds three files:
the questionnaire, a small `.json` file that records what it collects, and a
`README.txt` that says what to do with each. The `.json` file is what scores
the responses later.

Live app: <https://jmgirard.github.io/hitop-builder/>

## What it does, and what it does not

The app generates blank questionnaires. It scores nothing. It never asks for,
receives, stores, or transmits anyone's responses. Scoring HiTOP-SR data is
the job of the [`hitop` R package](https://jmgirard.github.io/hitop/), which
you run on your own machine after you collect responses. Its
[Building HiTOP-SR Modules](https://jmgirard.github.io/hitop/articles/modules-hitopsr.html)
article says how.

Nothing you select or generate leaves your browser. There is no server-side R
process and no backend of any kind. The page is static files on GitHub Pages,
and the R code runs inside the browser tab.

## How it works

The page loads [webR](https://docs.r-wasm.org/webr/latest/), which is R
compiled to WebAssembly. It installs the `hitop` package from the
[jmgirard.r-universe.dev](https://jmgirard.r-universe.dev) service. That
service builds a WebAssembly binary of the package from its source repository
and redirects the download itself to `r2.ropensci.org`. The page then calls
the package's own `available_scales()` to list the scales. It calls
`generate_docx_hitopsr()`, `generate_qualtrics_hitopsr()`, and
`generate_redcap_hitopsr()` to write each file. It passes each one the
`descriptor` argument that writes the scoring file beside it. It then zips the
two with a `README.txt` into one bundle, through the package's own `{zip}`
dependency, and saves that bundle.

The page always installs whatever version r-universe currently serves. That
service builds only its current version, and the install call takes no
version number, so the page cannot ask for a particular one. What it can do
is refuse an unusable one. The page declares the oldest `hitop` it will build
against as `MIN_HITOP` in `index.html`, the one place that minimum is set.
Today it is 0.2.0. On load the page reads the installed version, shows it, and
compares the two the way R does: component by component as numbers, so
`0.10.0` counts as newer than `0.9.0`. Anything older stops the page with a
message that names both versions, and the page offers no download button. The
page reads every scale name and item number it shows from the installed
package's keying tables at runtime. This repository contains no copy of the
instrument's content.

The page also stops waiting on a half of the load that never finishes. It
races the download of R itself, the webR module import and the `init()` that
fetches the WebAssembly build behind it, against `RUNTIME_TIMEOUT_MS`. It
races `installPackages` against `INSTALL_TIMEOUT_MS`. The file `index.html`
states both and sets both to `120000` milliseconds, two minutes, against a
first load of roughly twenty seconds each. On either timeout the page says
which half stalled and stays switched off. A stalled step that settles
afterwards does not turn it back on.

The first load downloads R and the package, which takes roughly twenty
seconds. The browser caches them afterwards.

## What the page shows

The page works in two steps, one on screen at a time. A *Steps* bar above
them says which one you are on. Its two buttons, *Choose scales* and *Choose
a format and download*, jump straight to either. Nothing gates moving on: the
second step is reachable with no scale selected, and its download button says
there that it is off until you select one.

1. *Choose scales.* A *Filter the scale list by name* box narrows the
   *HiTOP-SR scales* group. Each row carries a scale's name and its item
   count. A tally below the group says how many scales and how many items are
   currently selected. Point at a row, or reach its checkbox with the Tab key,
   and a popup shows that scale's brief clinician-facing definition. Escape
   dismisses the popup. The definitions come from the installed package, like
   every other scale fact on the page. A version that does not supply them
   shows no popup. A *Continue to the format and download* button ends the
   step.
2. *Choose a format and download.* Three cards, *Word (.docx)*, *Qualtrics
   (.txt)* and *REDCap (.zip)*, each carry a line that says what that file is
   for. The page starts on Word. Pressing a card marks it as the current
   format and switches everything under the cards to that format, without
   leaving the step. Under the cards sits one folded settings line for the
   current format: *Word settings*, *Qualtrics settings* or *REDCap
   settings*. Its summary names the values in force, *US Letter · numbered 1
   to n · original order* to begin with. It is closed at first paint and
   closes again on every card press. Open it to change a setting,
   and the summary follows the change. Below it are an *A download here is
   one zip file holding three* notice and one download button named for the
   questionnaire it builds: *Download the Word form (.zip bundle)*, *Download
   the Qualtrics file (.zip bundle)* or *Download the REDCap dictionary (.zip
   bundle)*. Pressing it builds the questionnaire and its scoring file, zips
   them with a `README.txt`, and saves that one bundle. The button is off
   while a build is running. The bundle is one file rather than two saves
   because a browser can quietly drop a second save nobody asked for. A
   questionnaire that arrives without its scoring file is not noticed until
   scoring day. The page keeps your scale selection, so building a second
   format needs no re-ticking. A *Back to scales* button ends the step.

   - *Word settings* holds three groups: *Paper size*, *Item numbering* and
     *Item order*.
   - *Qualtrics settings* holds one: *Block and question naming*.
   - *REDCap settings* holds one: *Form name and required items*.

   The page shows only the current format's settings, and nothing set under
   one format reaches another format's file. Tick *Shuffle the printed item
   order*, and a warning appears below the settings line that a shuffled form
   is not scored as it stands. The warning stays in view while the box is
   ticked, whether the settings line is open or closed. After a card press
   while the page is idle, the status line says which format was chosen.

The second step opens with the same tally the first step ends on, followed by
a *Change the selection* button back to the scale list. So it is not a blind
continuation of the choice you made.

Below the two steps, a *Log* records what the page asked R to do and what R
replied. It is where a failed download says what went wrong. It stays visible
on every step, as does the status line above them.

Re-cutting the page into steps changed no file it builds. On 2026-08-24,
sixteen combinations of format, scale selection and settings each came out
matching the file the previously deployed page built from the same inputs.
The 2026-09-11 fold of the settings into a disclosure was verified the same
way against the eight bundles the previous page built.

*Paper size* chooses between US Letter, the default, and A4. Like the other
two groups under *Word settings* it reaches the Word form only. The Qualtrics
and REDCap exports carry no page size at all.

## The scoring file

Every bundle carries a small `.json` file that takes the questionnaire's own
name: `hitopsr-word-module.json` beside `hitopsr-word-module.docx`, and
`hitopsr-redcap.json` beside `hitopsr-redcap-upload.zip`. The `hitop`
package's own
[`descriptor`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
argument writes it. It holds no responses. It records which scales the form
collects and, for a shuffled Word form, the order the items were printed in.
This example comes from a two-scale module built with the shuffle box ticked:

```json
{
  "format": "1.0",
  "package": "hitop",
  "packageVersion": "0.2.0",
  "buildDate": "2026-08-24",
  "instrument": "hitopsr",
  "scales": ["Agoraphobia", "Appetite Loss"],
  "items": [66, 109, 118, 144, 202, 260, 291, 389],
  "nItems": 8,
  "itemOrder": [389, 202, 291, 144, 109, 118, 66, 260]
}
```

Its `packageVersion` is the version that wrote this particular file, not the
minimum the page requires. The minimum is `MIN_HITOP` in `index.html`, above.

Keep it with the responses you collect. In R,
[`read_module()`](https://jmgirard.github.io/hitop/reference/read_module.html)
reads it back into the module object the scoring functions take. It returns
any recorded printed order on the module's `item_order` attribute. The page's
second step says the same in an *A download here is one zip file holding
three* notice above its download button. The `README.txt` inside every bundle
says it again, to a reader who never saw the page. This one comes from a
REDCap bundle:

```
hitopsr-redcap-module.zip, built by the HiTOP-SR Module Builder
(https://jmgirard.github.io/hitop-builder/) with hitop 0.2.0.

hitopsr-redcap-module-upload.zip
  The questionnaire, and the file to field: a data dictionary to import into a
  REDCap project. Upload this zip file to REDCap as it is, without extracting
  it. The REDCap instrument upload takes the zip itself.

hitopsr-redcap-module.json
  The scoring file. Keep it with the responses you collect: it records which
  scales the questionnaire collects and, on a shuffled Word form, the order
  the items were printed in. When you score the data in R, the hitop package
  reads it back with read_module().

README.txt
  This file.
```

A Word or Qualtrics README differs from that one in two places. Its stem,
which names the bundle on the first line and the scoring file, takes that
format's name. Its questionnaire entry takes that format's extension, and its
paragraph says what the file is and carries no upload instruction.

## What the downloads are named

A build's bundle and the two named files inside it share one stem, and that
stem says which build made them. It carries the instrument, the format,
`-module` unless the build is the whole instrument, and `-shuffled` on a Word
form whose printed order you shuffled. The bundle takes `.zip`. Inside it the
questionnaire takes its format's extension, and the scoring file takes
`.json`. The exception is the REDCap data dictionary, itself a zip, which
takes `-upload.zip` so the two zips cannot be confused. Two builds that differ
in any of those three therefore arrive under different names, so neither can
overwrite the other in your downloads folder. Two builds that differ only in
which scales you ticked share a name. The paragraph under the table says what
to do about that.

Ticking every scale is not on its own what drops `-module`. The page also asks
the package whether the instrument's scales, taken together, hold a run of
item numbers from 1 with no gaps in it. It asks once while starting up and
reports the answer in the log as *the scales' items together run from 1 with
no gaps*. The answer is yes for the HiTOP-SR, the only instrument this page
builds, so ticking all 76 does drop `-module`. With a no answer, ticking every
box still builds a module and the name still carries `-module`. [Ticking every
scale](#ticking-every-scale) below says what else rides on that answer.

| What you built | Bundle | Questionnaire inside | Scoring file inside | README inside |
|---|---|---|---|---|
| Word, every scale | `hitopsr-word.zip` | `hitopsr-word.docx` | `hitopsr-word.json` | `README.txt` |
| Word, every scale, shuffled | `hitopsr-word-shuffled.zip` | `hitopsr-word-shuffled.docx` | `hitopsr-word-shuffled.json` | `README.txt` |
| Word, some scales | `hitopsr-word-module.zip` | `hitopsr-word-module.docx` | `hitopsr-word-module.json` | `README.txt` |
| Word, some scales, shuffled | `hitopsr-word-module-shuffled.zip` | `hitopsr-word-module-shuffled.docx` | `hitopsr-word-module-shuffled.json` | `README.txt` |
| Qualtrics, every scale | `hitopsr-qualtrics.zip` | `hitopsr-qualtrics.txt` | `hitopsr-qualtrics.json` | `README.txt` |
| Qualtrics, some scales | `hitopsr-qualtrics-module.zip` | `hitopsr-qualtrics-module.txt` | `hitopsr-qualtrics-module.json` | `README.txt` |
| REDCap, every scale | `hitopsr-redcap.zip` | `hitopsr-redcap-upload.zip` | `hitopsr-redcap.json` | `README.txt` |
| REDCap, some scales | `hitopsr-redcap-module.zip` | `hitopsr-redcap-module-upload.zip` | `hitopsr-redcap-module.json` | `README.txt` |

Verified 2026-09-11 by building all eight and reading the entry names out of
the bundles the page asked the browser to save.

Nothing else about a build reaches its name. The scoring file that travels
beside the questionnaire records which scales you ticked. On a shuffled Word
form it also records the order the items were printed in. So two different scale
selections in one format share a filename. If you keep both, rename the
bundle yourself. The paper size, the item numbering, the Qualtrics and REDCap
naming values and REDCap's required flag are in neither the name nor the
scoring file. The questionnaire itself is the only file that keeps them,
though the build log names all but the paper size while the page stays open.

## Numbering the Word form

Under *Word settings*, an *Item numbering* group chooses which numbers the
Word form prints beside its items:

- *Number the items 1 to n*, the default, numbers the printed items from `1`
  down the page, so a module form does not show the full instrument's gapped
  numbers.
- *Keep the HiTOP-SR's own item numbers* prints each item's original HiTOP-SR
  number instead.

The choice applies to the Word file only. In the Qualtrics and REDCap exports
an item number names a collected data column, so those two downloads come out
the same either way. Verified 2026-08-23 on a two-scale module: the Qualtrics
files were byte-identical between the two settings, and the REDCap archives
carried an identical `instrument.csv`.

The online exports use those original numbers for their field names. So you
can type paper responses into a project built from this page without
translating them. The same two-scale module printed items 238, 275, 344, 358,
392 and 398 on the Word form. It named its REDCap fields `hsr_238` through
`hsr_398` (verified 2026-08-23).

Combined with the *Item order* box, the numbering choice decides whether a
shuffled form can be traced back to the instrument's numbers. Numbered
`1 to n`, a shuffled module form prints a crosswalk. With the instrument's own
numbers there is nothing to cross-walk, so it prints none, and you enter each
response under its printed number. Ticking every scale leaves a shuffled form
with no crosswalk either way. The page's on-screen notice says which of these
applies, and [Shuffling the Word form](#shuffling-the-word-form) below
tabulates all four (verified 2026-08-23).

## Naming the Qualtrics and REDCap exports

These settings name what the import creates in the target system. None of
them reaches the Word form, and none of them changes the items, their
wording, or their response options. They sit under the settings line of the
format they reach: *Qualtrics settings* holds a *Block and question naming*
group, and *REDCap settings* a *Form name and required items* group.

- *Block name* (Qualtrics) becomes the `[[Block:…]]` line at the top of the
  Qualtrics `.txt`, and names the block the questions land in.
- *Question ID prefix* (Qualtrics) starts each question's `[[ID:…]]`, so a
  prefix of `W2SCR` gives IDs like `W2SCR_066`. The number that follows the
  prefix is the item's own HiTOP-SR number, whatever the Word numbering
  choice.
- *Form name* (REDCap) fills the `Form Name` column on every row of the
  dictionary's `instrument.csv`, which is the instrument name REDCap shows.
- *Mark every item as required* (REDCap), ticked by default, sets that file's
  `Required Field?` column to `y` on every item row. Unticked, it reads `n`.

Each box starts at the value the `hitop` package itself uses by default. The
page reads that value out of the package at load time rather than keeping it
in this repository. If you empty a box, the page uses that default again, with
a line in the log that says so.

The page does not test whether a name is one its target system will take.
Qualtrics and REDCap each have their own rules about what a block, field, or
form can be called. The target system refuses a name that breaks those rules
at import time, not at build time here.

Verified 2026-08-24 on a two-scale module. A block name of `Wave 2 Screening`,
an ID prefix of `W2SCR` and a form name of `wave2_screening` produced
`[[Block:Wave 2 Screening]]`. The question IDs ran `W2SCR_066` through
`W2SCR_389`. The `Form Name` column read `wave2_screening` on all 9 rows of
the dictionary. `Required Field?` read `n` on all 8 item rows with the box
unticked and `y` on all 8 with it ticked. With every control left at its
default, the same module's Qualtrics `.txt` and REDCap `instrument.csv` came
out byte-identical to the files the deployed page built.

## Ticking every scale

Ticking all 76 scales builds the whole instrument rather than a module that
happens to contain every scale. That holds only because the page asks the
package one question: whether this instrument's scales, taken together, hold
a run of item numbers from 1 with no gaps in it. That is all the probe asks. It reads no
separate count of the instrument's items, so it cannot see a tail of
higher-numbered items no scale claims. It asks once while starting up, and
the log line *the scales' items together run from 1 with no gaps* carries the
answer. On the HiTOP-SR it is true, and there the run is the instrument's
whole item set. On an instrument where it is false, "every scale" is not the
same thing as the whole instrument. Ticking every box then keeps building a
module.

With the answer true and every box ticked, the Word form is headed
`HiTOP-SR (v1.0)` rather than `HiTOP-SR Module (v1.0)`. The downloads drop
the `-module` part of their names: `hitopsr-word.docx` rather than
`hitopsr-word-module.docx`, and so on for the other two formats. This changes
nothing in the Qualtrics and REDCap files themselves. Verified 2026-08-23
against the files the page produced beforehand: the Qualtrics `.txt` was
byte-identical and the REDCap `instrument.csv` identical.

## Shuffling the Word form

Under *Word settings*, an *Item order* box shuffles the printed order of the
items on the Word form. It is unticked by default, and it applies to the Word
file only. In the Qualtrics and REDCap exports an item number names a
collected data column. Those two downloads are the same whether the box is
ticked or not. Verified 2026-08-23 on a two-scale module: the Qualtrics files
came out byte-identical, and the REDCap archives carried an identical
`instrument.csv`.

Responses collected on a shuffled form arrive in the printed order, not the
instrument's own. Put the columns back into the original HiTOP-SR order
before scoring, or the scale scores come out wrong with no error raised.

A shuffled Word file carries a crosswalk in one case only: the form is
numbered `1 to n` *and* built from a selection of scales. The crosswalk lists
each printed number beside the original HiTOP-SR number it came from. The
other three combinations carry none, and the page's on-screen notice says so
in each. Verified 2026-08-23 by reading the four built files back:

| Numbering | Selection | Crosswalk |
|---|---|---|
| 1 to n | some scales | yes |
| 1 to n | every scale | no |
| the instrument's own numbers | some scales | no |
| the instrument's own numbers | every scale | no |

With the instrument's own numbers there is nothing to cross-walk. The printed
number already is the original one, so you can enter responses under it. With
every scale ticked the page builds the whole instrument, and the package
prints no crosswalk for a shuffled full instrument. Such a crosswalk runs to
405 pairs on a participant-facing page. So nothing on that form records the order
it was printed in. The `.json` scoring file inside the bundle records that
order in an `itemOrder` field. A shuffled whole-instrument form whose scoring
file is lost cannot be put back into instrument order at all. The package's
[`generate_docx_hitopsr()`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
help page states the same reordering rule for callers who work in R directly.

## Repository layout

Every tracked file:

| Path | Purpose |
|---|---|
| `index.html` | The entire app: markup, styles, and the webR driver script |
| `.github/workflows/pages.yml` | Publishes `index.html`, `LICENSE.md` and `README.md`, and nothing else in the repository, to GitHub Pages on every push to `main` |
| `.github/workflows/smoke.yml` | Runs the smoke test on pull requests and pushes to `main` against this checkout, and weekly and on demand against the deployed page |
| `tests/smoke.spec.js` | The smoke test: boot the page, count the scale rows, download a Word bundle and read the form out of it |
| `tests/runtime-timeout.spec.js` | Two probes that stall R's download and make sure that the page gives up and says which half stalled |
| `tests/plants.mjs` | The plant matrix: eight planted defects, run to prove the smoke test goes red on each |
| `tests/prose.mjs` | The prose extraction: lists every string a visitor reads, for a linter, and the facts each passage carries |
| `tests/serve.mjs` | The local static server both specs use, which also holds `/hang/` requests open and never answers them |
| `playwright.config.js` | The timeouts, single worker and one CI retry those runs use |
| `package.json`, `package-lock.json` | The pinned `@playwright/test` they run under |
| `README.md` | This file |
| `LICENSE.md` | GPL-3 |
| `.gitignore` | Keeps `.DS_Store`, `node_modules/` and Playwright's run output out |

There is still no R file and no backend of any kind, and nothing is compiled,
bundled or generated. The deployed site is `index.html`, `LICENSE.md` and
`README.md`. The Pages workflow copies those three into the artifact it
uploads and nothing else. So it never serves `package.json`,
`playwright.config.js` or anything under `tests/`. Those exist only for the
tests, and run only in CI or from a checkout.

## Instrument content

The [HiTOP Society](https://hitop-system.org) owns the HiTOP-SR. This app
reproduces the instrument as the `hitop` package encodes it and changes nothing
about its items, wording, or response options.

## License

The app's own code is licensed GPL-3, the same license as the `hitop`
package. See [LICENSE.md](LICENSE.md).
