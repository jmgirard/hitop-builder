import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // A cold webR boot -- R itself, then the hitop package -- is the bulk of
  // every run here, so both budgets sit well past Playwright's 30-second
  // defaults. The smoke test's first test waits for one boot and nine builds,
  // each up to 240s, so the sum of its waits (40 minutes) fits no budget
  // that smoke.yml's 25-minute job can hold twice. Each wait is a ceiling
  // for one stalled step, not a share of the whole. Twelve minutes holds the
  // boot at its ceiling and leaves eight for the builds and the scale rows;
  // the whole first test took 30s locally on 2026-09-30. Past twelve minutes
  // a run dies on a bare "Test timeout exceeded". Two attempts fit in 25.
  timeout: 12 * 60 * 1000,
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
