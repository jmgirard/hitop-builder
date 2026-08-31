# HiTOP-SR Module Builder

A single-page web app for building **HiTOP-SR modules** — questionnaires
containing only the scales you choose — and downloading them ready to field in
Word, Qualtrics, or REDCap. Each download is two files and two clicks: the
questionnaire, which the page saves as soon as it is built, and a small `.json`
file recording what it collects, which the page offers on a button of its own
for you to take. That file is what scores the responses later.

**Live app: <https://jmgirard.github.io/hitop-builder/>**

## What it does, and what it does not

The app **generates blank questionnaires. It scores nothing.** It never asks
for, receives, stores, or transmits anyone's responses. Scoring HiTOP-SR data
is the job of the [`hitop` R package](https://jmgirard.github.io/hitop/),
which you run on your own machine after collecting responses — see its
[Building HiTOP-SR Modules](https://jmgirard.github.io/hitop/articles/modules-hitopsr.html)
article.

Nothing you select or generate leaves your browser. There is no server-side R
process and no backend of any kind: the page is static files on GitHub Pages,
and the R code runs inside the browser tab.

## How it works

The page loads [webR](https://docs.r-wasm.org/webr/latest/) — R compiled to
WebAssembly — and installs the `hitop` package from
[jmgirard.r-universe.dev](https://jmgirard.r-universe.dev), which builds a
WebAssembly binary of the package from its source repository and redirects the
download itself to `r2.ropensci.org`. It then calls the
package's own `available_scales()` to list the scales and its
`generate_docx_hitopsr()`, `generate_qualtrics_hitopsr()`, and
`generate_redcap_hitopsr()` to write each file, passing each one the
`descriptor` argument that writes the scoring file beside it.

The page always installs whatever version r-universe currently serves — that
service builds only its current version, and the install call takes no version
number, so the page cannot ask for a particular one. What it can do is refuse
an unusable one. The page declares the oldest `hitop` it will build against as
`MIN_HITOP` in `index.html`, which is the one place that minimum is set;
today it is **0.2.0**. On load the page reads the installed version, displays
it, and compares the two the way R does — component by component as numbers,
so `0.10.0` counts as newer than `0.9.0`. Anything older stops the page with a
message naming both versions, and no download button is offered. Every scale
name and item number the page shows is read from the installed package's keying
tables at runtime — this repository contains no copy of the instrument's
content.

The page also stops waiting on either half of the load that never finishes.
Downloading R itself — the webR module import and the `init()` that fetches the
WebAssembly build behind it — is raced against `RUNTIME_TIMEOUT_MS`, and
`installPackages` against `INSTALL_TIMEOUT_MS`. Both are stated in `index.html`,
both set to `120000` milliseconds — two minutes — against a first load of
roughly twenty seconds each. On either timeout the page says which half stalled
and stays switched off, including if the stalled step settles afterwards.

The first load downloads R and the package, which takes roughly twenty seconds;
the browser caches them afterwards.

## What the page shows

The page works in three steps, one on screen at a time. It asks which format you
want before it asks anything about that format, so you only ever see the
settings that reach the file you are building. A *Steps* bar above the steps
says which one you are on, and its three buttons — *Choose scales*,
*Choose a format*, *Options and download* — jump straight to any of them.
Nothing gates moving on: the last step is reachable with no scale selected, and
its download button says there that it is off until one is.

1. **Choose scales.** A *Filter the scale list by name* box narrows the
   *HiTOP-SR scales* group; each row carries a scale's name and its item count,
   and a tally below the group says how many scales and how many items are
   currently selected. Pointing at a row, or reaching its checkbox with the Tab
   key, shows that scale's brief clinician-facing definition in a popup, which
   Escape dismisses; the definitions come from the installed package, like every
   other scale fact on the page, so a version that does not supply them simply
   shows no popup. A *Continue to the format* button ends the step.
2. **Choose a format.** Three buttons — *Word (.docx)*, *Qualtrics (.txt)* and
   *REDCap (.zip)* — each with a line saying what that file is for. Pressing one
   both records the choice and opens the third step set up for it. A *Back to
   scales* button ends the step.
3. **Options and download.** The step is headed for the format you chose —
   *Word: options and download*, *Qualtrics: options and download*, or *REDCap:
   options and download* — and carries that format's settings, a
   *A download here is two files, and takes two clicks* notice, one download
   button named for the questionnaire it builds, and a *Choose a different
   format* button at its foot leading back to the second step. Pressing the
   download button builds both files, saves the questionnaire, and reveals a
   second button — *Save the scoring file*, named for the file it will hand
   you — which saves that `.json` file when you click it. A line under the
   two buttons says what just happened: which scoring file is now on offer,
   whether a replacement took an untaken one away, and when a click saved
   one. That button is off while a build is running: when the new build
   matches the one on offer in format, in whether it is the whole instrument
   or a selection, and in whether a Word form was shuffled, its scoring file is
   headed for the name the file on offer already carries, and the button
   being off is what stops you taking the old one under that name. That
   second button is a click of your own rather than a second automatic
   save, because a browser may quietly drop a save nobody asked for, and a
   questionnaire that arrives without its scoring file is not noticed until
   scoring day. It stays on offer, takeable more than once, until the next
   completed build replaces it; when a build does replace one you had not
   taken, the log says so. Your scale selection is kept, so
   building a second format needs no re-ticking.

   - **Word** has three settings groups: *Paper size*, *Item numbering* and
     *Item order*.
   - **Qualtrics** has one: *Block and question naming*.
   - **REDCap** has one: *Form name and required items*.

   No format's screen shows another format's settings, and nothing set under one
   format reaches another format's file.

Steps two and three each open with the same tally the first step ends on,
followed by a *Change the selection* button back to the scale list, so neither
is a blind continuation of the choice you made.

Below the three steps, a *Log* records what the page asked R to do and what R
replied; it is where a failed download says what went wrong. It stays visible on
every step, as does the status line above them.

Re-cutting the page into these steps changed no file it builds: on 2026-08-24,
sixteen combinations of format, scale selection and settings each came out
matching the file the previously deployed page built from the same inputs.

*Paper size* chooses between **US Letter**, the default, and **A4**. Like the
other two groups on the Word screen it reaches the Word form only — the
Qualtrics and REDCap exports carry no page size at all.

## The scoring file

Every download is two files. The page saves the questionnaire itself, then
offers a small `.json` file taking the same name — `hitopsr-word-module.json`
beside `hitopsr-word-module.docx`, `hitopsr-redcap.json` beside
`hitopsr-redcap.zip` — on a button you click to take it. It is written by the
`hitop` package's own
[`descriptor`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
argument, and holds no responses: it records which scales the form collects and,
for a shuffled Word form, the order the items were printed in. From a two-scale
module built with the shuffle box ticked:

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
minimum the page requires; the minimum is `MIN_HITOP` in `index.html`, above.

Keep it with the responses you collect. In R,
[`read_module()`](https://jmgirard.github.io/hitop/reference/read_module.html)
reads it back into the module object the scoring functions take, and returns any
recorded printed order on the module's `item_order` attribute. The page's third
step says the same in an *A download here is two files, and takes two clicks*
notice above its download button.

## What the downloads are named

Both files of a build share one name, and that name says which build made them:
the instrument, the format, `-module` unless the build is the whole instrument,
and `-shuffled` on a Word form whose printed order you shuffled. The
questionnaire takes its format's extension and the scoring file takes `.json`.
Two builds differing in any of those three therefore arrive under different
names, so neither can overwrite the other's scoring file in your downloads
folder. Two builds differing only in which scales you ticked do share a name —
the paragraph under the table says what to do about that.

Ticking every scale is not on its own what drops `-module`. The page also has to
have confirmed with the package that the instrument's scales between them cover
its items with nothing left out, which it asks once while starting up and
reports in the log as *every scale ticked covers items 1..N with no gaps*. The
answer is yes for the HiTOP-SR, the only instrument this page builds, so ticking
all 76 does drop `-module`; were it no, ticking every box would still build a
module and the name would still carry `-module`. [Ticking every
scale](#ticking-every-scale) below says what else rides on that answer.

| What you built | Questionnaire | Scoring file |
|---|---|---|
| Word, every scale | `hitopsr-word.docx` | `hitopsr-word.json` |
| Word, every scale, shuffled | `hitopsr-word-shuffled.docx` | `hitopsr-word-shuffled.json` |
| Word, some scales | `hitopsr-word-module.docx` | `hitopsr-word-module.json` |
| Word, some scales, shuffled | `hitopsr-word-module-shuffled.docx` | `hitopsr-word-module-shuffled.json` |
| Qualtrics, every scale | `hitopsr-qualtrics.txt` | `hitopsr-qualtrics.json` |
| Qualtrics, some scales | `hitopsr-qualtrics-module.txt` | `hitopsr-qualtrics-module.json` |
| REDCap, every scale | `hitopsr-redcap.zip` | `hitopsr-redcap.json` |
| REDCap, some scales | `hitopsr-redcap-module.zip` | `hitopsr-redcap-module.json` |

Verified 2026-08-29 by building all eight and reading back the names the page
asked the browser to save.

Nothing else about a build reaches its name. Which scales you ticked is
recorded in the scoring file travelling beside the questionnaire — and, on a
shuffled Word form, the order the items were printed in — so two different
scale selections in one format do share a filename: take the `.json` file, and
rename the pair yourself if you are keeping both. The paper size, the item
numbering, the Qualtrics and REDCap naming values and REDCap's required flag
are in neither the name nor the scoring file; the questionnaire itself is the
only file that keeps them, though the build log names all but the paper size
while the page stays open.

## Numbering the Word form

On the Word screen, an *Item numbering* group chooses which numbers the Word
form prints beside its items:

- **Number the items 1 to n** — the default — numbers the printed items from
  `1` down the page, so a module form does not show the full instrument's
  gapped numbers.
- **Keep the HiTOP-SR's own item numbers** prints each item's original
  HiTOP-SR number instead.

The choice applies to the Word file only. In the Qualtrics and REDCap exports
an item number names a collected data column, so those two downloads come out
the same either way — verified 2026-08-23 on a two-scale module, where the
Qualtrics files were byte-identical between the two settings and the REDCap
archives carried an identical `instrument.csv`.

Those original numbers are what the online exports use for their field names,
so paper responses can be typed into a project built from this page without
translating them. The same two-scale module printed items 238, 275, 344, 358,
392 and 398 on the Word form and named its REDCap fields `hsr_238` through
`hsr_398` (verified 2026-08-23).

Combined with the *Item order* box, the numbering choice decides whether a
shuffled form can be traced back to the instrument's numbers. Numbered `1 to n`,
a shuffled module form prints a crosswalk; with the instrument's own numbers
there is nothing to cross-walk, so it prints none and each response is entered
under its printed number. Ticking every scale leaves a shuffled form with no
crosswalk either way. The page's on-screen notice says which of these applies,
and [Shuffling the Word form](#shuffling-the-word-form) below tabulates all four
— verified 2026-08-23.

## Naming the Qualtrics and REDCap exports

These settings name what the import creates in the target system. None of them
reaches the Word form, and none of them changes the items, their wording, or
their response options. They sit on the screen of the format they reach: the
Qualtrics screen carries a *Block and question naming* group, and the REDCap
screen a *Form name and required items* group.

- **Block name** (Qualtrics) becomes the `[[Block:…]]` line at the top of the
  Qualtrics `.txt`, naming the block the questions land in.
- **Question ID prefix** (Qualtrics) starts each question's `[[ID:…]]`, so a
  prefix of `W2SCR` gives IDs like `W2SCR_066`. The number after the underscore
  is the item's own HiTOP-SR number, whatever the Word numbering choice.
- **Form name** (REDCap) fills the `Form Name` column on every row of the
  dictionary's `instrument.csv` — the instrument name REDCap shows.
- **Mark every item as required** (REDCap), ticked by default, sets that file's
  `Required Field?` column to `y` on every item row; unticked it reads `n`.

Each box starts at the value the `hitop` package itself uses by default, read
out of the package when the page loads rather than kept in this repository.
Empty a box and that default is used again, with a line in the log saying so.

The page does not check that a name is one its target system will take.
Qualtrics and REDCap each have their own rules about what a block, field, or
form may be called, and a name either one refuses is refused when you import
the file, not when you build it here.

Verified 2026-08-24 on a two-scale module. A block name of `Wave 2 Screening`,
an ID prefix of `W2SCR` and a form name of `wave2_screening` produced
`[[Block:Wave 2 Screening]]`, question IDs `W2SCR_066` through `W2SCR_389`, and
a `Form Name` of `wave2_screening` on all 9 rows of the dictionary;
`Required Field?` read `n` on all 8 item rows with the box unticked and `y` on
all 8 with it ticked. With every control left at its default, the same module's
Qualtrics `.txt` and REDCap `instrument.csv` came out byte-identical to the
files the deployed page built.

## Ticking every scale

Ticking all 76 scales builds the whole instrument rather than a module that
happens to contain every scale — but only because the page has asked the package
whether this instrument's scales, taken together, cover its items with nothing
left out. It asks once while starting up, and the log line *every scale ticked
covers items 1..N with no gaps* carries the answer; on the HiTOP-SR it is true.
On an instrument where it were false, "every scale" would not be the same thing
as the whole instrument, and ticking every box would keep building a module.

With the answer true and every box ticked, the Word form is headed
`HiTOP-SR (v1.0)` rather than `HiTOP-SR Module (v1.0)`, and the downloads drop
the `-module` part of their names — `hitopsr-word.docx` rather than
`hitopsr-word-module.docx`, and so on for the other two formats. The Qualtrics
and REDCap files themselves are unchanged by this — verified 2026-08-23 against
the files the page produced beforehand, the Qualtrics `.txt` byte-identical and
the REDCap `instrument.csv` identical.

## Shuffling the Word form

On the Word screen, an *Item order* box shuffles the printed order of the
items on the Word form. It is unticked by default, and it applies to the Word
file only: in the Qualtrics and REDCap exports an item number names a collected
data column, so those two downloads are the same whether the box is ticked or
not — verified 2026-08-23 on a two-scale module, where the Qualtrics files came
out byte-identical and the REDCap archives carried an identical
`instrument.csv`.

Responses collected on a shuffled form arrive in the printed order, not the
instrument's own — put the columns back into the original HiTOP-SR order before
scoring, or the scale scores come out wrong with no error raised.

A shuffled Word file carries a crosswalk — each printed number beside the
original HiTOP-SR number it came from — only when the form is numbered `1 to n`
*and* built from a selection of scales. The other three combinations carry
none, and the page's on-screen notice says so in each. Verified 2026-08-23 by
reading the four built files back:

| Numbering | Selection | Crosswalk |
|---|---|---|
| 1 to n | some scales | yes |
| 1 to n | every scale | no |
| the instrument's own numbers | some scales | no |
| the instrument's own numbers | every scale | no |

With the instrument's own numbers there is nothing to cross-walk: the printed
number already is the original one, so responses can be entered under it. With
every scale ticked the page builds the whole instrument, and the package prints
no crosswalk for a shuffled full instrument — that would be 405 pairs on a
participant-facing page — so nothing on that form records the order it was
printed in. The `.json` scoring file the second button offers records that order
in an `itemOrder` field, so a shuffled whole-instrument form whose scoring file
is not taken cannot be put back into instrument order at all. The package's
[`generate_docx_hitopsr()`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
help page states the same reordering rule for callers working in R directly.

## Repository layout

Every tracked file:

| Path | Purpose |
|---|---|
| `index.html` | The entire app: markup, styles, and the webR driver script |
| `.github/workflows/pages.yml` | Publishes `index.html`, and nothing else in the repository, to GitHub Pages on every push to `main` |
| `.github/workflows/smoke.yml` | Runs the smoke test on pull requests and pushes to `main` against this checkout, and weekly and on demand against the deployed page |
| `tests/smoke.spec.js` | The smoke test: boot the page, check the scale list, download a Word form |
| `tests/runtime-timeout.spec.js` | Two probes that stall R's download and check the page gives up and says which half stalled |
| `tests/plants.mjs` | The plant matrix: six planted defects, run to prove the smoke test goes red on each |
| `tests/serve.mjs` | The local static server both specs use, which also holds `/hang/` requests open and never answers them |
| `playwright.config.js` | The timeouts, single worker and one CI retry those runs use |
| `package.json`, `package-lock.json` | The pinned `@playwright/test` they run under |
| `README.md` | This file |
| `LICENSE.md` | GPL-3 |
| `.gitignore` | Keeps `.DS_Store`, `node_modules/` and Playwright's run output out |

There is still no R file and no backend of any kind, and nothing is compiled,
bundled or generated. The deployed site is `index.html` alone: the Pages
workflow copies that one file into the artifact it uploads, so `package.json`,
`playwright.config.js` and everything under `tests/` are never served at all.
They exist only for the smoke test, and run only in CI or from a checkout.

## Instrument content

The HiTOP-SR is the property of the
[HiTOP Society](https://hitop-system.org). This app
reproduces the instrument as the `hitop` package encodes it and changes nothing
about its items, wording, or response options.

## License

The app's own code is licensed GPL-3, matching the `hitop` package. See
[LICENSE.md](LICENSE.md).
