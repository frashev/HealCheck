// Като conftest.py в А: при провал записва DOM-а в HEALCHECK_DOM, за да го види агентът.
import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ domOnFailure: void }>({
  domOnFailure: [async ({ page }, use, info) => {
    await use();
    if (info.status !== info.expectedStatus && process.env.HEALCHECK_DOM) {
      fs.writeFileSync(process.env.HEALCHECK_DOM, await page.content(), 'utf8');
    }
  }, { auto: true }],
});
export { expect };
