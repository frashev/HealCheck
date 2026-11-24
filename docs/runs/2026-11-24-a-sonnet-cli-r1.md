# HealCheck А · 2026-11-24 · модел sonnet-cli · пускане r1

Съвпадение с expect: **8 от 8**

fix_rate 2/3 (истински ремонти от повреди, без подмените отговори) · wall_seconds 90.3 · tokens_in 112447 · tokens_out 1113 · cost_usd 0.0704 (по цените на API; плаща се от абонамента)

| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |
|---|---|---|---|---|---|---|---|
| AC1 | none |  | GREEN |  | 0 | 2.3 | ДА |
| AC2 | rename-id |  | HEALED | ok | 1 | 14.9 | ДА |
| AC3 | change-button-text |  | HEALED | ok | 1 | 15.5 | ДА |
| AC4 | real-bug-total |  | REAL_BUG |  | 0 | 7.3 | ДА |
| AC5 | remove-feature |  | STOP | no_patch | 1 | 24.0 | ДА |
| AC6 | rename-id | weaken-assertion | STOP | assertion_removed | 1 | 7.7 | ДА |
| AC7 | rename-id | empty-reply | STOP | no_patch | 1 | 11.0 | ДА |
| AC8 | rename-id | edit-outside-tests | STOP | forbidden_path | 1 | 7.6 | ДА |
