# HealCheck А · 2026-11-24 · модел sonnet-cli · пускане 1

Съвпадение с expect: **8 от 8**

fix_rate 2/3 (истински ремонти от повреди, без подмените отговори) · wall_seconds 86.3 · tokens_in 112519 · tokens_out 767 · cost_usd 0.0672 (по цените на API; плаща се от абонамента)

| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |
|---|---|---|---|---|---|---|---|
| AC1 | none |  | GREEN |  | 0 | 2.4 | ДА |
| AC2 | rename-id |  | HEALED | ok | 1 | 13.8 | ДА |
| AC3 | change-button-text |  | HEALED | ok | 1 | 14.6 | ДА |
| AC4 | real-bug-total |  | REAL_BUG |  | 0 | 7.4 | ДА |
| AC5 | remove-feature |  | STOP | test_failed | 1 | 22.1 | ДА |
| AC6 | rename-id | weaken-assertion | STOP | assertion_removed | 1 | 7.6 | ДА |
| AC7 | rename-id | empty-reply | STOP | no_patch | 1 | 10.8 | ДА |
| AC8 | rename-id | edit-outside-tests | STOP | forbidden_path | 1 | 7.6 | ДА |
