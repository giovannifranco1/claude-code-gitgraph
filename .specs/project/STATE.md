# STATE — gitgraph

## Decisões
- 2026-10-22: painel abre só via `/gitgraph` (não disputa espaço com /filetree e /flow).
- 2026-10-22: grafo mostra todas as branches (`--all`) por padrão, com toggle para só a atual.
- 2026-10-22: gitflow clássico (git-flow-next) no repositório do mod.

## Blockers
- (resolvido) Hot-reload de mods foi ativado depois na sessão de criação.

## Lições
- 2026-10-22: a engine recusa carregar o módulo se `$` for colocado num objeto (bound/spread/destructuring de um ctx): passe `$` como parâmetro e chame `$.noun.event(...)` direto.
- 2026-10-22: em `git -C ... commit` encadeado com `;` após `tsc`, o commit sai mesmo com erro de tipo — encadear gates com `&&`.
- 2026-10-22: o kit de testes não exporta `On`; usar `Parameters<TestBody>[1]`.
- 2026-10-22: `git show --numstat` em merge não lista arquivos sem `--diff-merges=first-parent`.

## Deferred ideas
- Ver ROADMAP M2.

## Preferences
