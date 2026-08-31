import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // A cold webR boot -- R itself, then the hitop package -- is the bulk of
  // every run here, so both budgets sit well past Playwright's 30-second
  // defaults.
  timeout: 8 * 60 * 1000,
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
  use: { browserName: 'chromium', channel: 'chromium', headless: true, acceptDownloads: true },
});
