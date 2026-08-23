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

## Shuffling the Word form

Under **Download**, a *Word item order* box shuffles the printed order of the
items on the Word form. It is unticked by default, and it applies to the Word
file only: in the Qualtrics and REDCap exports an item number names a collected
data column, so those two downloads are the same whether the box is ticked or
not — verified 2026-08-23 on a two-scale module, where the Qualtrics files came
out byte-identical and the REDCap archives carried an identical
`instrument.csv`.

A shuffled Word file carries a crosswalk listing each printed number beside the
original HiTOP-SR number it came from. Responses collected on such a form arrive
in the printed order, not the instrument's own — put the columns back into the
original HiTOP-SR order before scoring, or the scale scores come out wrong with
no error raised. The package's
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
