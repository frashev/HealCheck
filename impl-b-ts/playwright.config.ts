// Пуска теста от работното копие (HC_TESTS). Изходът на Playwright е извън копието, за да не се брои за промяна.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: process.env.HC_TESTS || './tests',
  outputDir: process.env.HC_OUT || './work/.out',
  timeout: 15_000,
  retries: 0,
  workers: 1,
  expect: { timeout: 3_000 },
  use: { actionTimeout: 3_000, headless: true },
});
