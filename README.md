# HiTOP-SR Module Builder

A web page that builds HiTOP-SR modules: questionnaires that hold only the
scales you choose. You download a module as a Word form, a Qualtrics file or a
REDCap dictionary. Each of those downloads is one zip file. It holds the
questionnaire, a module file that records the scales it collects, and a
`README.txt`. The `hitop` package later scores the responses with the module
file. A fourth choice, the Online form, saves the module file alone. The page
then leads you to the
[Study Link Builder](https://jmgirard.github.io/hitop-form/link.html) of
hitop-form with your module filled in.

Live app: <https://jmgirard.github.io/hitop-builder/>

## Using the page

### What it does, and what it does not

The page builds blank questionnaires. It scores nothing. It never asks for,
receives, keeps, or sends anyone's responses. The
[`hitop` R package](https://jmgirard.github.io/hitop/) scores HiTOP-SR data,
on your own machine, after you collect the responses. Its
[Building HiTOP-SR Modules](https://jmgirard.github.io/hitop/articles/modules-hitopsr.html)
article says how.

Nothing you select or build leaves your browser, with one exception. The link
to the Study Link Builder carries your module (the scale names and item
numbers) in its address, so opening it sends them to GitHub Pages. There is no
server-side R process and no backend of any kind. The page is static files on
GitHub Pages, and the R code runs inside the browser tab. The first load
downloads R and then the package, about twenty seconds each. The browser
caches them afterwards.

### The two steps

The page works in two steps, one on screen at a time. A *Steps* bar above
them shows which one you are on. Its two buttons, *Choose scales* and *Choose
a format and download*, go straight to either step. Nothing stops you from
moving on. You can reach the second step with no scale selected, and a line
under its download button then says to choose a scale first.

Every other control that changes the step holds the name of the step it goes
to: *Next: Choose a format and download* at the foot of the first step, and
*Back: Choose scales* twice on the second. A step change moves keyboard focus
to the new step's heading. In Chromium, the browser the tests run, the
heading shows a focus outline after a keyboard press and no outline after a
mouse click. The page uses the CSS `:focus-visible` rule for this. Other
browsers apply their own version of that rule.

### Step 1: Choose scales

A *Filter scales…* box narrows the list of scales. A filter that matches no
scale shows *No scales match the filter.* in place of the list. The line sits
in a `role="status"` live region, so a screen reader can announce it.
*Select all* selects every scale the filter shows, and its label says how
many while a filter is in use. *Clear all* clears every scale, shown or not.

Each row holds a checkbox, the scale's name and its item count, such as
*5 items*. The checkbox's accessible name holds the name and the count, as
Chromium computes it. Other browsers are not tested. A *Definition* button on
each row shows the scale's brief clinician-facing definition as a line under
the row. A second press hides it.
Nothing opens on hover. A screen reader also reads the definition with the
checkbox. The names, counts and definitions come from the installed `hitop`
package. A package version that has no definitions shows no *Definition*
buttons.

A tally under the list says how many scales and how many items you selected.

### Step 2: Choose a format and download

The step opens with the same tally and a *Back: Choose scales* button, drawn as
a link. Four cards follow, one per format. Each card's title is the format's one name,
which its download button, its status line and its `README.txt` also use:

| Card | What it builds | Download button |
|---|---|---|
| *Word form* | A questionnaire to print and fill in on paper (`.docx`) | *Download the Word form (.zip)* |
| *Qualtrics file* | An advanced-format file to import as a Qualtrics survey (`.txt`) | *Download the Qualtrics file (.zip)* |
| *REDCap dictionary* | A data dictionary to import into a REDCap project (`.zip`) | *Download the REDCap dictionary (.zip)* |
| *Online form* | A module file for a study link in the Study Link Builder (`.json`) | *Download the module file for the Online form (.json)* |

The page starts on the Word form. A card press marks that card and switches
everything under the cards to its format, without leaving the step. The status
line then names the chosen format. If the status line shows a failed build's
message, a card press leaves that message in place.

Under the first three cards sits one closed settings line for the current
format: *Word settings*, *Qualtrics settings* or *REDCap settings*. Its summary
names the values in use, *US Letter · numbered 1 to n · original order* at
first. Every card press closes it again. Open it to change a setting, and the
summary follows the change. The page shows only the current format's settings,
and nothing set under one format reaches another format's file.

- *Word settings* holds three groups: *Paper size*, *Item numbering* and
  *Item order*.
- *Qualtrics settings* holds one: *Block and question naming*.
- *REDCap settings* holds one: *Form name and required items*.

A short note above the download button says what the download holds. For the
three zip formats, the note lists the questionnaire, a module file and a
`README.txt`. It adds that `read_module()` reads the module file at scoring
time. For the REDCap dictionary, a second line says to upload the inner
`-upload.zip` file as it is. For the Online form, the note says that the
download is one module file. It also says that two saves that each skip some
scales share a file name. If you keep both, rename one.

The download button builds the current format in this browser. While it runs,
the status line reads *Building the Word form…* (or the format's own name), or
*Writing the module file for the Online form…*. The button and the four cards
are off during a build. The cards look grey with a dashed border, and the
current card keeps the check in its corner. At the end of a build, keyboard
focus goes back to the button or card that had it at your press of the button.
Two things must hold for that: no other element has focus then, and that
control is on and on show. The page does not scroll.

A zip format's download is one file rather than two saves, because a browser
can drop a second save that nobody asked for. A questionnaire that arrives
without its module file is not noticed until scoring day. The page keeps your
scale selection, so a second format needs no new ticks.

*Paper size* chooses between US Letter, the default, and A4. It reaches the
Word form only. The Qualtrics and REDCap files carry no page size.

### Technical details

A closed *Technical details* section at the foot of the page names the hosts
the page fetches R and the packages from. It also holds the log of what the
page asked R to do and what R replied. The section stays closed while the page
loads and once it is ready. If the load or a build fails, the page opens it.
The status line then says where to look: *The log under "Technical details"
below says more.*

### The module file

Every zip file holds a small `.json` module file that takes the
questionnaire's own name. Examples are `hitopsr-word-module.json` beside
`hitopsr-word-module.docx`, and `hitopsr-redcap.json` beside
`hitopsr-redcap-upload.zip`. The `hitop` package's own
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

Its `packageVersion` is the version that wrote this file, not the minimum the
page requires. [How it works](#how-it-works) names that minimum.

Keep the module file with the responses you collect. In R,
[`read_module()`](https://jmgirard.github.io/hitop/reference/read_module.html)
reads it back into the module that the scoring functions take. It returns any
recorded printed order on the module's `item_order` attribute.
Given that module and `layout = "printed"`,
[`score_hitopsr()`](https://jmgirard.github.io/hitop/reference/score_hitopsr.html)
reads that attribute. So columns left in a shuffled form's printed order score
as they stand.

The `README.txt` in every zip file says the same to a reader who never saw the
page. Its first line names the format and the zip file. This one comes from a
REDCap zip file:

```
HiTOP-SR REDCap dictionary: hitopsr-redcap-module.zip
Built by the HiTOP-SR Module Builder
(https://jmgirard.github.io/hitop-builder/) with hitop 0.2.0.

hitopsr-redcap-module-upload.zip
  The questionnaire, and the file to field: a data dictionary to import into a
  REDCap project. Upload this file, the one that ends in -upload.zip, to
  REDCap as it is, without extracting it. The REDCap instrument upload takes
  this zip itself, not the zip file that holds it.

hitopsr-redcap-module.json
  The module file. Keep it with the responses you collect: it records which
  scales the questionnaire collects and, on a shuffled Word form, the order
  the items were printed in. When you score the data in R, the hitop package
  reads it back with read_module().

README.txt
  This file.

The zip file takes its name from the build that made it: the format, every
scale or a selection of them, and shuffled or not. A build that differs in any
of those three gets another name. Two builds that each tick a different
selection of scales share a name, so if you keep both, rename one of them.
```

A Word or Qualtrics `README.txt` differs from that one in four places. Its
first line names that format. Its stem, which names the zip file and the
module file, takes that format's name. Its questionnaire entry is named for
the stem and the format's extension, such as `hitopsr-word-module.docx`, with
no `-upload`. That entry's paragraph describes that format's file and carries
no upload instruction. A shuffled Word `README.txt` also adds one paragraph
under the module file. It says to score printed-order columns with the module
from `read_module()` and `layout = "printed"`, and that columns in HiTOP-SR
order take the default layout.

### The Online form

The fourth card, *Online form*, is for a study that collects responses through
[hitop-form](https://jmgirard.github.io/hitop-form/), the online questionnaire
page for the HiTOP Society instruments. That page shows the items itself, from
the `hitop` package's own export of the instrument, so there is no
questionnaire file to build. What it needs is the module, which a study link
carries.

With the Online form chosen, the download button saves the module file alone.
The page calls `write_module()` on the module that `hitop_module()` builds from
the scales you ticked. If every box is ticked, the module holds every scale.
The file is saved as `hitopsr-online.json` for every scale and as
`hitopsr-online-module.json` for a selection. It holds the same fields as the
module file in a zip file, without `itemOrder` or `columns`. No form was
printed, so there is no printed order to record, and the online form names its
own columns. Keep the file with the responses you collect.

After the save, a panel headed *Next: make the study link* appears under the
button. It says that the Study Link Builder opens in a new tab with your module
filled in. There you name the study and choose where the responses go. Its
*Open the Study Link Builder* link is drawn as a button. It opens
`https://jmgirard.github.io/hitop-form/link.html` in a new tab. The address's
`c` value holds the instrument and the saved file's module, in the encoding
that the Study Link Builder reads. The status line, which a screen reader
announces, reads *Ready. The module file is saved. "Next: make the study
link" is under the button.*

The panel carries the module of one saved file. If you tick or untick a scale,
press another format's card, or start another build, the page removes the
panel. After a tick the status line returns to *Ready.* After a card press it
names the chosen format. Pressing the Online form card again keeps the panel. A
later save puts a new panel in its place. In the Study Link Builder you can
also choose the saved module file, or paste its text, in the *Item order and
HiTOP-SR module* section.

### What the downloads are named

A build's zip file and the two named files inside it share one stem, and that
stem says which build made them. It carries the instrument, the format,
`-module` unless the build is the whole instrument, and `-shuffled` on a Word
form whose printed order you shuffled. The zip file takes `.zip`. Inside it
the questionnaire takes its format's extension, and the module file takes
`.json`. The one exception is the questionnaire in a REDCap zip file. The data
dictionary is itself a zip, so it takes `-upload.zip`, and the two zips cannot
be confused. Two builds that differ in any of those three therefore arrive
under different names, so neither can overwrite the other in your downloads
folder.

| What you built | Zip file | Questionnaire inside | Module file inside | README inside |
|---|---|---|---|---|
| Word form, every scale | `hitopsr-word.zip` | `hitopsr-word.docx` | `hitopsr-word.json` | `README.txt` |
| Word form, every scale, shuffled | `hitopsr-word-shuffled.zip` | `hitopsr-word-shuffled.docx` | `hitopsr-word-shuffled.json` | `README.txt` |
| Word form, some scales | `hitopsr-word-module.zip` | `hitopsr-word-module.docx` | `hitopsr-word-module.json` | `README.txt` |
| Word form, some scales, shuffled | `hitopsr-word-module-shuffled.zip` | `hitopsr-word-module-shuffled.docx` | `hitopsr-word-module-shuffled.json` | `README.txt` |
| Qualtrics file, every scale | `hitopsr-qualtrics.zip` | `hitopsr-qualtrics.txt` | `hitopsr-qualtrics.json` | `README.txt` |
| Qualtrics file, some scales | `hitopsr-qualtrics-module.zip` | `hitopsr-qualtrics-module.txt` | `hitopsr-qualtrics-module.json` | `README.txt` |
| REDCap dictionary, every scale | `hitopsr-redcap.zip` | `hitopsr-redcap-upload.zip` | `hitopsr-redcap.json` | `README.txt` |
| REDCap dictionary, some scales | `hitopsr-redcap-module.zip` | `hitopsr-redcap-module-upload.zip` | `hitopsr-redcap-module.json` | `README.txt` |
| Online form, every scale | none: the module file `hitopsr-online.json` is the download | none | `hitopsr-online.json` | none |
| Online form, some scales | none: the module file `hitopsr-online-module.json` is the download | none | `hitopsr-online-module.json` | none |

Nothing else about a build reaches its name. The module file records which
scales you ticked, so two different scale selections in one format share a
file name. If you keep both, rename one yourself. The paper size, the item
numbering, the Qualtrics and REDCap naming values and REDCap's required flag
are in neither the name nor the module file. Only the questionnaire itself
keeps them, though the log names all but the paper size while the page stays
open.

Ticking every scale is not on its own what drops `-module`.
[Ticking every scale](#ticking-every-scale) says what else it takes.

### Numbering the Word form

Under *Word settings*, an *Item numbering* group chooses which numbers the
Word form prints beside its items:

- *Number the items 1 to n*, the default, numbers the printed items from `1`
  down the page, so a module form does not show the full instrument's gapped
  numbers.
- *Keep the HiTOP-SR's own item numbers* prints each item's original HiTOP-SR
  number instead.

The choice applies to the Word form only. In the Qualtrics and REDCap files an
item number names a collected data column, so those two downloads come out
the same either way. Those files use the original numbers for their field
names. With the original numbers on the paper form, you can type paper
responses into a project built from this page without translating them.

Together with the *Item order* box, the numbering choice decides whether a
shuffled form can be traced back to the instrument's numbers. Numbered `1 to
n`, a shuffled module form prints a crosswalk. With the instrument's own
numbers there is nothing to cross-walk, so it prints none, and you enter each
response under its printed number. Ticking every scale leaves a shuffled form
with no crosswalk either way. The page's on-screen notice says which of these
applies, and [Shuffling the Word form](#shuffling-the-word-form) lists all
four.

### Naming the Qualtrics and REDCap exports

These settings name what the import creates in the target system. None of
them reaches the Word form, and none of them changes the items, their wording,
or their response options. *Qualtrics settings* holds a *Block and question
naming* group, and *REDCap settings* a *Form name and required items* group.

- *Block name* (Qualtrics) becomes the `[[Block:…]]` line at the top of the
  Qualtrics `.txt`, and names the block the questions land in.
- *Question ID prefix* (Qualtrics) starts each question's `[[ID:…]]`, so a
  prefix of `W2SCR` gives IDs like `W2SCR_066`. The number after the prefix is
  the item's own HiTOP-SR number, whatever the Word numbering choice.
- *Form name* (REDCap) fills the `Form Name` column on every row of the
  dictionary's `instrument.csv`, which is the instrument name REDCap shows.
- *Mark every item as required* (REDCap), ticked by default, sets that file's
  `Required Field?` column to `y` on every item row. Unticked, it reads `n`.

Each box starts at the value the `hitop` package itself uses by default. The
page reads that value out of the package at load time. If you empty a box, the
page uses that default again, with a line in the log that says so.

The page does not test whether a name is one its target system will take.
Qualtrics and REDCap each have their own rules about what a block, field, or
form can be called. The target system refuses a name that breaks those rules
at import time, not at build time here.

### Ticking every scale

Ticking all 76 scales builds the whole instrument rather than a module that
happens to contain every scale. That holds only because the page asks the
package one question: whether this instrument's scales, taken together, hold a
run of item numbers from 1 with no gaps in it. It reads no separate count of
the instrument's items, so it cannot see a tail of higher-numbered items that
no scale claims. It asks once while starting up, and the log line *the scales'
items together run from 1 with no gaps* carries the answer. On the HiTOP-SR it
is true, and there the run is the instrument's whole item set. On an
instrument where it is false, ticking every box keeps building a module, and
the names keep `-module`.

With the answer true and every box ticked, the Word form is headed
`HiTOP-SR (v1.0)` rather than `HiTOP-SR Module (v1.0)`. The downloads drop the
`-module` part of their names: `hitopsr-word.docx` rather than
`hitopsr-word-module.docx`, and so on for the other formats. This changes
nothing in the Qualtrics and REDCap files themselves.

### Shuffling the Word form

Under *Word settings*, an *Item order* box shuffles the printed order of the
items on the Word form. It is unticked by default, and it applies to the Word
form only. In the Qualtrics and REDCap files an item number names a collected
data column. So those two downloads are the same with the box ticked or not.
While the box is ticked, a notice under the settings line says how to
score a shuffled form. It stays in view whether the settings line is open or
closed.

Data entered straight off a shuffled form has its columns in the printed
order, not the instrument's own. Score those columns in R with the module that
`read_module()` returns from the zip file's module file, and pass
`layout = "printed"` to `score_hitopsr()`. Columns already in the original
HiTOP-SR order take the default layout, and `layout = "printed"` scrambles
them. Under the wrong layout the scale scores come out wrong with no error.

A shuffled Word form carries a crosswalk in one case only: the form is
numbered `1 to n` *and* built from a selection of scales. The crosswalk lists
each printed number beside the original HiTOP-SR number it came from. The
other three combinations carry none, and the page's notice says so in each:

| Numbering | Selection | Crosswalk |
|---|---|---|
| 1 to n | some scales | yes |
| 1 to n | every scale | no |
| the instrument's own numbers | some scales | no |
| the instrument's own numbers | every scale | no |

With the instrument's own numbers there is nothing to cross-walk. The printed
number already is the original one, so you can enter responses under it. With
every scale ticked the page builds the whole instrument. The package prints no
crosswalk for a shuffled full instrument, because such a crosswalk runs to 405
pairs on a page that a participant reads. So nothing on that form
records the order it was printed in. The module file in the zip file records
that order in an `itemOrder` field, and `layout = "printed"` scores through
it. A shuffled whole-instrument form whose module file is lost cannot be put
back into instrument order at all. The package's
[`generate_docx_hitopsr()`](https://jmgirard.github.io/hitop/reference/generate_docx_hitopsr.html)
help page gives the same scoring rule under its `randomize` argument, for
callers who work in R directly.

## For developers

### How it works

The page loads [webR](https://docs.r-wasm.org/webr/latest/), which is R
compiled to WebAssembly. It installs the `hitop` package from the
[jmgirard.r-universe.dev](https://jmgirard.r-universe.dev) service. That
service builds a WebAssembly binary of the package from its source repository
and redirects the download itself to `r2.ropensci.org`. The page then calls
the package's own `available_scales()` to list the scales. It calls
`generate_docx_hitopsr()`, `generate_qualtrics_hitopsr()`, and
`generate_redcap_hitopsr()` to write each file. It passes each one the
`descriptor` argument, which writes the module file beside it. It then zips the
two with a `README.txt` into one zip file, through the package's own `{zip}`
dependency, and saves that zip file. For the Online form it calls
`write_module()` on the module that `hitop_module()` builds from your scales,
and saves that one file.

The page always installs whatever version r-universe currently serves. That
service builds only its current version, and the install call takes no
version number, so the page cannot ask for a particular one. What it can do
is refuse an unusable one. The page declares the oldest `hitop` it will build
against as `MIN_HITOP` in `index.html`, the one place that minimum is set.
Today it is 0.2.0. On load the page reads the installed version, shows it
under *Technical details*, and compares the two the way R does: component by
component as numbers, so `0.10.0` counts as newer than `0.9.0`. Anything older
stops the page with a message that names both versions, and the page offers
no download button. The page reads every scale name and item number it shows
from the installed package's keying tables at runtime. This repository
contains no copy of the instrument's content.

The page also stops waiting on a half of the load that never finishes. It
races the download of R itself against `RUNTIME_TIMEOUT_MS`. That download is
the webR module import plus the `init()` that fetches the WebAssembly build
behind it. It races `installPackages` against `INSTALL_TIMEOUT_MS`. The file
`index.html` states both and sets both to `120000` milliseconds, two minutes,
against a first load of about twenty seconds each. On either timeout the page
says which half stalled and stays switched off. A stalled step that settles
afterwards does not turn it back on. Every failure to load R or the package,
and every build failure, goes through `showFailure()`, which opens *Technical
details*.

### Verification notes

These checks were made by hand against the built files, on the dates given.

- The re-cut of the page into two steps changed no file it builds. On
  2026-08-24, sixteen combinations of format, scale selection and settings
  each came out matching the file the previously deployed page built from the
  same inputs. The 2026-09-11 fold of the settings into a closed line was
  checked the same way against the eight zip files the previous page built.
- The download names in the table under
  [What the downloads are named](#what-the-downloads-are-named) were checked on
  2026-09-11. All eight zip files were built, and the entry names were read out
  of the zip files the page asked the browser to save. The two Online form
  rows were checked on 2026-09-25 by reading the name of the file the page
  asked the browser to save.
- Item numbering, checked 2026-08-23 on a two-scale module. The Qualtrics files
  were byte-identical between the two numbering choices, and the REDCap
  archives carried an identical `instrument.csv`. The same module printed
  items 238, 275, 344, 358, 392 and 398 on the Word form and named its REDCap
  fields `hsr_238` through `hsr_398`. The four shuffle and numbering
  combinations' crosswalks were read back from the built files the same day.
- Naming, checked 2026-08-24 on a two-scale module. A block name of
  `Wave 2 Screening`, an ID prefix of `W2SCR` and a form name of
  `wave2_screening` produced `[[Block:Wave 2 Screening]]`. The question IDs ran
  `W2SCR_066` through `W2SCR_389`. The `Form Name` column read
  `wave2_screening` on all 9 rows of the dictionary. `Required Field?` read `n`
  on all 8 item rows with the box unticked and `y` on all 8 with it ticked.
  With every control at its default, the same module's Qualtrics `.txt` and
  REDCap `instrument.csv` came out byte-identical to the files the deployed
  page built.
- Ticking every scale, checked 2026-08-23 against the files the page produced
  beforehand: the Qualtrics `.txt` was byte-identical and the REDCap
  `instrument.csv` identical.
- Shuffling, checked 2026-08-23 on a two-scale module: the Qualtrics files came
  out byte-identical, and the REDCap archives carried an identical
  `instrument.csv`, with the box ticked and not.
- The Online form's link, checked 2026-09-25 on a two-scale module against the
  deployed Study Link Builder. The saved file's `scales` and `items` were those
  two scales' and their eight item numbers. The link's `c` decoded to the file.
  The Study Link Builder opened with `hitopsr` and the module filled in.

### Tests and repository layout

Every tracked file:

| Path | Purpose |
|---|---|
| `index.html` | The entire app: markup, styles, and the webR driver script |
| `.github/workflows/pages.yml` | Publishes `index.html`, `LICENSE.md` and `README.md`, and nothing else in the repository, to GitHub Pages on every push to `main` |
| `.github/workflows/smoke.yml` | Runs the prose extraction on this checkout on every run, then the smoke test: on pull requests and pushes to `main` against this checkout, and weekly and on demand against the deployed page |
| `tests/smoke.spec.js` | The smoke test, whose assertions its header lists. One test boots the page and reads its head and *Technical details* while R loads, with the `webr.mjs` request held. It then checks the scale rows, their names, *Definition* buttons and filter line. It checks the step controls' names and focus outlines, and each format's text and names. It saves the Online form's module file and reads the next-step panel. It builds a Word, a Qualtrics and a REDCap zip file and reads them. Last, it makes `URL.createObjectURL` throw and reads the failed build that follows. A second test refuses the `webr.mjs` request and reads the failed load |
| `tests/runtime-timeout.spec.js` | Two probes that stall R's download and make sure that the page gives up and says which half stalled |
| `tests/plants.mjs` | The plant matrix: one planted defect per entry in its `PLANTS` list. Each is run to prove that the smoke test goes red on it. The matrix also checks that every smoke assertion goes red on at least one |
| `tests/prose.mjs` | The prose extraction, run by `npm run prose` and by the workflow on every run. For a linter, it lists the page's body text with its `placeholder` and `aria-label` attributes. It adds the script's text at the sites its header names, and each zip file's README.txt. It also lists the facts each passage carries. It does not list every string a visitor reads. Its header names what it leaves out, such as the package's scale names and definitions and two "Ready." statuses. It refuses a page whose count of `.textContent`, `.innerHTML` and `.setAttribute` writes differs from its ledger. It also refuses a passage that holds a name the `hitop` package retired from its web pages. And it refuses a page body with no text node, or with a text node whose text appears in no body passage |
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
