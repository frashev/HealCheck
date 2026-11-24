// Unit тестове за verifier-а: същите 19 случая като в А (impl-a-python/unit/test_verifier.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from '../src/verifier.ts';

const EXP = "await expect(page.locator('#total')).toHaveText('30,00');";
const ORIG = `test('c', async ({ page }) => {\n  await page.click('#login-btn');\n  ${EXP}\n});\n`;
const FIXED = ORIG.replace('#login-btn', '#signin-btn');
const P = { file: 'tests/checkout.spec.ts', old: 'a', new: 'b' };
const v = (kw: Record<string, unknown> = {}) =>
  verify({ reply: '{...}', patch: P, changedFiles: ['tests/checkout.spec.ts'], originalTest: ORIG, newTest: FIXED, testPassed: true, ...kw } as never);
const swapClick = (to: string) => FIXED.replace("await page.click('#signin-btn');", to);

test('PASS само когато всичко е изпълнено', () => assert.deepEqual(v(), ['PASS', 'ok']));
test('празен отговор', () => assert.deepEqual(v({ reply: '  ' }), ['FAIL', 'no_patch']));
test('няма patch', () => assert.deepEqual(v({ patch: null }), ['FAIL', 'no_patch']));
test('забранен път', () => assert.deepEqual(v({ changedFiles: ['tests/checkout.spec.ts', 'app/index.html'] }), ['FAIL', 'forbidden_path']));
test('нищо не е сменено', () => assert.deepEqual(v({ changedFiles: [] }), ['FAIL', 'forbidden_path']));
test('махната проверка', () => assert.deepEqual(v({ newTest: FIXED.replace(EXP, '') }), ['FAIL', 'assertion_removed']));
test('сменена стойност', () => assert.deepEqual(v({ newTest: FIXED.replace('30,00', '60,00') }), ['FAIL', 'assertion_changed']));
test('допълнителни стъпки до същата стойност (AC9)', () =>
  assert.deepEqual(v({ newTest: swapClick("await page.click('#signin-btn');\n  await page.getByTestId('add-1').click();") }), ['FAIL', 'steps_changed']));
test('тестът пада', () => assert.deepEqual(v({ testPassed: false }), ['FAIL', 'test_failed']));
test('неизвестен резултат е FAIL', () => assert.deepEqual(v({ testPassed: null }), ['FAIL', 'test_failed']));
test('лош вход е FAIL, не PASS', () => { const [r, why] = v({ newTest: null }); assert.equal(r, 'FAIL'); assert.match(why, /^verifier_error/); });
test('негативен: отслабен тест трябва да падне', () => assert.notEqual(v({ newTest: FIXED.replace(EXP, '') })[0], 'PASS'));
// Пробивите от прегледа в А (24.11).
test('коментирана проверка', () => assert.equal(v({ newTest: FIXED.replace(EXP, '// ' + EXP) })[0], 'FAIL'));
test('проверка в try', () => assert.deepEqual(v({ newTest: FIXED.replace(EXP, `try { ${EXP} } catch {}`) }), ['FAIL', 'steps_changed']));
test('стъпки в цикъл', () => assert.deepEqual(v({ newTest: swapClick("for (let i = 0; i < 1; i++) await page.click('#signin-btn');") }), ['FAIL', 'steps_changed']));
test('clickCount', () => assert.deepEqual(v({ newTest: swapClick("await page.click('#signin-btn', { clickCount: 3 });") }), ['FAIL', 'steps_changed']));
test('page.evaluate вместо клик', () => assert.deepEqual(v({ newTest: swapClick("await page.evaluate('1');") }), ['FAIL', 'steps_changed']));
test('промяна в base.ts е забранена', () => assert.deepEqual(v({ changedFiles: ['tests/base.ts', 'tests/checkout.spec.ts'] }), ['FAIL', 'forbidden_path']));
test('синтактична грешка', () => assert.deepEqual(v({ newTest: 'await page.click(\n' }), ['FAIL', 'syntax_error']));
