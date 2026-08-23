# HiTOP-SR Module Builder

A single-page web app for building **HiTOP-SR modules** — questionnaires
containing only the scales you choose — and downloading them ready to field in
Word, Qualtrics, or REDCap.

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
WebAssembly binary of the package from its source repository. It then calls the
package's own `available_scales()` to list the scales and its
`generate_docx_hitopsr()`, `generate_qualtrics_hitopsr()`, and
`generate_redcap_hitopsr()` to write each file.

The page always installs whatever version r-universe currently serves, and
displays that version once it loads; it was **`hitop` 0.2.0** when this README
was last checked (2026-08-21). Every scale name and item number the page shows
is read from the installed package's keying tables at runtime — this repository
contains no copy of the instrument's content.

The first load downloads R and the package, which takes roughly twenty seconds;
the browser caches them afterwards.

## Numbering the Word form

Under **Download**, a *Word item numbering* group chooses which numbers the
Word form prints beside its items:

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

Combined with the *Word item order* box, the numbering choice decides whether a
shuffled form can be traced back to the instrument's numbers. Numbered `1 to n`,
a shuffled module form prints a crosswalk; with the instrument's own numbers
there is nothing to cross-walk, so it prints none and each response is entered
under its printed number. Ticking every scale leaves a shuffled form with no
crosswalk either way. The page's on-screen notice says which of these applies,
and [Shuffling the Word form](#shuffling-the-word-form) below tabulates all four
— verified 2026-08-23.

## Ticking every scale

Ticking all 76 scales builds the whole instrument rather than a module that
happens to contain every scale. The Word form is then headed
`HiTOP-SR (v1.0)` rather than `HiTOP-SR Module (v1.0)`, and the downloads are
named `hitopsr.docx`, `hitopsr.txt` and `hitopsr.zip` rather than
`hitopsr-module.*`. The Qualtrics and REDCap files themselves are unchanged by
this — verified 2026-08-23 against the files the page produced beforehand, the
Qualtrics `.txt` byte-identical and the REDCap `instrument.csv` identical.

## Shuffling the Word form

Under **Download**, a *Word item order* box shuffles the printed order of the
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
printed in. The package's
[`generate_docx_hitopsr()`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
help page states the same reordering rule for callers working in R directly.

## Repository layout

Every tracked file:

| Path | Purpose |
|---|---|
| `index.html` | The entire app: markup, styles, and the webR driver script |
| `.github/workflows/pages.yml` | Publishes the repository to GitHub Pages on every push to `main` |
| `README.md` | This file |
| `LICENSE.md` | GPL-3 |
| `.gitignore` | Keeps `.DS_Store` out |

There is no build step, no R file, and no backend of any kind in this
repository.

## Instrument content

The HiTOP-SR is the property of the
[HiTOP Society](https://hitop-system.org). This app
reproduces the instrument as the `hitop` package encodes it and changes nothing
about its items, wording, or response options.

## License

The app's own code is licensed GPL-3, matching the `hitop` package. See
[LICENSE.md](LICENSE.md).
