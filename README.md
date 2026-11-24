# HealCheck

Счупен Playwright тест се поправя сам най-много веднъж. Вторият провал спира и вика човек. Истинска грешка в приложението никога не се „лекува“.

Две имплементации срещу едни и същи критерии (`shared/acceptance.yaml`, AC1–AC9), повреди и правила на verifier-а:

| | Стек | Състояние |
|---|---|---|
| **А** `impl-a-python/` | Python, Playwright, LangGraph, местен Qwen | v1: 9 от 9 в три поредни пускания с Qwen (24.11.2026) |
| **Б** `impl-b-ts/` | TypeScript, Playwright Test, Claude Agent SDK | v1: 9 от 9 в три поредни пускания със Sonnet (24.11.2026) |

## Case study: резултати (24.11.2026)

И двете имплементации минават всичките 9 критерия за приемане в три поредни пускания. Всяка поправя 2 от 3 повреди. Третата повреда (липсващ бутон) по замисъл не се лекува, а спира и вика човек. Истинската грешка в сумата не се „поправя“ и в двете.

| | А · Python + LangGraph | Б · TypeScript + Claude Agent SDK |
|---|---|---|
| Модел | Qwen 3.8 27B (местен) | Claude Sonnet |
| Критерии (AC1–AC9) | 9/9 ×3 | 9/9 ×3 |
| Поправени повреди | 2/3 | 2/3 |
| Време за всички случаи | ~74 s | ~84 s |
| Цена на пускане | 0 | ~$0,33 по API цени |

Проверката след ремонта казва FAIL по подразбиране и хвана и заобиколния „ремонт“ от AC9 (повторни кликове до същата сума) в двата стека. Б струва около 5 пъти повече от А, пуснато със Sonnet, заради агентния цикъл (5–7 хода вместо един отговор). Подробностите са в `docs/COMPARISON.md`.

## Как работи А

```
run_test ─ зелено ─────────────────────────────► GREEN
   └ червено → diagnose ─ стойността е друга ──► REAL_BUG (тестът не се пипа)
                  └ локатор → propose (модел) → apply → rerun → verify ─ PASS ► HEALED
                                                                     └ FAIL ► STOP
```

Verifier-ът е детерминистичен и казва FAIL по подразбиране. PASS има само ако:
- има patch;
- той пипа само `tests/`;
- проверките не са махнати и стойностите им не са сменени;
- стъпките на теста са същите;
- тестът минава.

## Пускане

```
python -m venv impl-a-python/.venv
impl-a-python/.venv/Scripts/pip install playwright pytest langgraph pyyaml openai
impl-a-python/.venv/Scripts/python -m playwright install chromium
sh tools/install-hooks.sh                       # пази критериите
impl-a-python/.venv/Scripts/python impl-a-python/run_acceptance.py            # Qwen на :8081
impl-a-python/.venv/Scripts/python impl-a-python/run_acceptance.py --model sonnet-cli

cd impl-b-ts && npm install && npx playwright install chromium
npm run unit                                    # 19 unit теста на verifier-а
npm run acceptance -- --tag 1                   # Sonnet през Agent SDK (влиза с акаунта на Claude Code)
```

Сравнението на А и Б е в `docs/COMPARISON.md`.

Резултатите се записват в `docs/runs/`.

CI (`.github/workflows/ci.yml`) пуска без модел: пазача на критериите, 19-те unit теста на всеки verifier и AC1, AC4, AC6–AC9 и в двете имплементации.

## Първи числа (24.11.2026)

| Модел | AC съвпадат | Поправени повреди | Време за 8 случая | Токени вход/изход | Цена |
|---|---|---|---|---|---|
| Qwen 3.8 27B (местен) | 8/8 ×3 | 2/3 | ~66 s | 2 730 / 151 | 0 |
| Claude Sonnet (през `claude -p`) | 8/8 | 2/3 | ~86 s | 112 519* / 767 | $0,067 по API цени |

\* Повечето входни токени са системният контекст на `claude -p`, не HealCheck.

Третата повреда (`remove-feature`) по замисъл не се лекува. При едно пробно пускане Sonnet я „поправи“, като натисна три пъти първия продукт, за да излезе същата сума. Затова verifier-ът вече проверява и стъпките (`steps_changed`).
