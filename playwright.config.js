import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // A cold webR boot -- R itself, then the hitop package -- is the bulk of
  // every run here, so both budgets sit well past Playwright's 30-second
  // defaults. The smoke test's boot test boots once and runs nine builds,
  // and most builds wait twice, for the download and then for "Ready.": 17
  // waits of up to 240s each, 68 minutes in all, which no per-test budget
  // inside smoke.yml's 25-minute job can hold. Each wait is a ceiling for one
  // stalled step, not a share of the whole. Ten minutes holds the boot at its
  // ceiling and leaves six for the builds and the scale rows; the whole boot
  // test took 30s locally on 2026-09-30. Past ten minutes a run dies on a
  // bare "Test timeout exceeded". Two attempts take up to 20 of the job's 25
  // minutes, which leaves 5 for setup, the prose run and the other three
  // tests. The zip reader's test loads no page. The other two download no
  // hitop package. The failed load stops before R
  // arrives. The failed start-up downloads R itself and stops after R starts,
  // before the install, so every run of it costs one R download. On
  // 2026-10-06 they took 0.2s and 2.1s locally.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 60 * 1000 },
  // One retry in CI, so a single hiccup on webr.r-wasm.org or r-universe does
  // not turn the job red on its own. A second failure does. Locally none:
  // a red run is what the plant matrix is asking for.
  retries: process.env.CI ? 1 : 0,
  // One at a time: every run boots its own webR and downloads the package.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // The full Chromium build rather than Playwright's headless shell: what the
  // page has to work in is a real browser, and the shell is a cut-down one.
  // Every action the smoke test takes is a click or a check on an element the
  // page has already rendered, so 30 seconds is generous -- and bounding them
  // is what keeps a missing element from eating the whole test budget.
  use: {
    browserName: 'chromium',
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    actionTimeout: 30 * 1000,
  },
});
