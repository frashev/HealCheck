# HealCheck А · 2026-11-24 · модел sonnet-cli · пускане ac9-1

Съвпадение с expect: **9 от 9**

fix_rate 2/3 (истински ремонти от повреди, без подмените отговори) · wall_seconds 98.9 · tokens_in 112519 · tokens_out 974 · cost_usd 0.1995 (по цените на API; плаща се от абонамента)

| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |
|---|---|---|---|---|---|---|---|
| AC1 | none |  | GREEN |  | 0 | 2.4 | ДА |
| AC2 | rename-id |  | HEALED | ok | 1 | 16.9 | ДА |
| AC3 | change-button-text |  | HEALED | ok | 1 | 14.0 | ДА |
| AC4 | real-bug-total |  | REAL_BUG |  | 0 | 7.3 | ДА |
| AC5 | remove-feature |  | STOP | no_patch | 1 | 24.2 | ДА |
| AC6 | rename-id | weaken-assertion | STOP | assertion_removed | 1 | 7.9 | ДА |
| AC7 | rename-id | empty-reply | STOP | no_patch | 1 | 10.9 | ДА |
| AC8 | rename-id | edit-outside-tests | STOP | forbidden_path | 1 | 7.6 | ДА |
| AC9 | remove-feature | extra-steps | STOP | steps_changed | 1 | 7.7 | ДА |
