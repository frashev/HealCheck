# HealCheck А · 2026-11-24 · модел sonnet-cli · пускане ac9-3

Съвпадение с expect: **9 от 9**

fix_rate 2/3 (истински ремонти от повреди, без подмените отговори) · wall_seconds 95.5 · tokens_in 78749 · tokens_out 950 · cost_usd 0.0641 (по цените на API; плаща се от абонамента)

| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |
|---|---|---|---|---|---|---|---|
| AC1 | none |  | GREEN |  | 0 | 2.3 | ДА |
| AC2 | rename-id |  | HEALED | ok | 1 | 13.5 | ДА |
| AC3 | change-button-text |  | HEALED | ok | 1 | 13.6 | ДА |
| AC4 | real-bug-total |  | REAL_BUG |  | 0 | 7.4 | ДА |
| AC5 | remove-feature |  | STOP | no_patch | 1 | 23.6 | ДА |
| AC6 | rename-id | weaken-assertion | STOP | assertion_removed | 1 | 7.8 | ДА |
| AC7 | rename-id | empty-reply | STOP | no_patch | 1 | 11.1 | ДА |
| AC8 | rename-id | edit-outside-tests | STOP | forbidden_path | 1 | 8.0 | ДА |
| AC9 | remove-feature | extra-steps | STOP | steps_changed | 1 | 8.2 | ДА |
