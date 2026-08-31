import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // A cold webR boot -- R itself, then the hitop package -- is the bulk of
  // every run here, so both budgets sit well past Playwright's 30-second
  // defaults. Ten minutes rather than the eight the smoke test's own two waits
  // add up to (240s booting, 240s building): a per-test budget equal to the
  // sum of the waits inside it leaves nothing for the navigation, the clicks
  // and the checkbox, and a slow runner would die on a bare "Test timeout
  // exceeded" with no assertion evaluated and nothing for the plant matrix to
  // record. Two attempts still fit inside smoke.yml's 25-minute job budget.
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
