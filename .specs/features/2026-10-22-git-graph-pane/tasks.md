# Tasks — Git Graph pane

Formato: What / Where / Depends / Done-when / Verify. TDD nas tasks marcadas 🧪.

### T1 — Esqueleto do mod
- **What:** `plugin.json`, `hooks/hooks.json`, `types/index.d.ts`, `tsconfig.json`, `register.tsx` mínimo.
- **Where:** raiz do mod. **Depends:** —
- **Done-when / Verify:** `claude plugin validate .` sem erros.

### T2 🧪 — Parse do log e detalhe (GG-04, GG-07, GG-08)
- **Where:** `hooks/log.ts`, `tests/log.test.ts`. **Depends:** T1
- **Done-when:** `parseLog`, `parseRefs` (HEAD → x, branch, remote `origin/x`, `tag: v`), `parseDetail` (numstat, binários `-`), `withUncommitted`.
- **Verify:** `claude plugin test .` — testes `GG-04 …`, `GG-07 …`, `GG-08 …` verdes.

### T3 🧪 — Layout de lanes (GG-03)
- **Where:** `hooks/lanes.ts`, `tests/lanes.test.ts`. **Depends:** T2 (tipos)
- **Done-when:** linear, fork (`╯`), merge (`╮`), cruzamento (`┼`), cor estável por lane, raiz libera lane.
- **Verify:** testes `GG-03 …` verdes.

### T4 🧪 — Detecção e formatação (GG-09, GG-10, GG-04)
- **Where:** `hooks/detect.ts`, `hooks/format.ts`, testes. **Depends:** T1
- **Done-when:** `mutatesRepo` (mutação vs leitura, `&&`/`;`/`|`, `git -C x`, `gh pr merge`), `isBranchNameCandidate`, `relTime`, `fitGraph`, `truncate`.
- **Verify:** testes `GG-09 …`, `GG-10 …`, `GG-04 …` verdes.

### T5 — Wiring: comando, carregamento, estado (GG-01, GG-02, GG-05, GG-06)
- **Where:** `hooks/register.tsx`. **Depends:** T2–T4
- **Done-when:** `/gitgraph` abre/recarrega; no-repo; toggle de escopo; carregar mais.
- **Verify:** `tests/pane.test.tsx` (process.run mockado) + `tsc -p .`.

### T6 — Render do painel (GG-03, GG-04, GG-07, GG-08)
- **Where:** `hooks/register.tsx`. **Depends:** T5
- **Done-when:** header, linhas, detalhe expandido, rodapé.
- **Verify:** `pane.test.tsx` em `terminal` e `desktop`: encontra hash/assunto, pressiona linha e vê arquivos.

### T7 — Auto-refresh (GG-09)
- **Where:** `hooks/register.tsx`. **Depends:** T5
- **Done-when:** recarrega após Bash git mutante; poll de assinatura a cada 5s com painel aberto; botão ↻.
- **Verify:** teste: `$.tool.call({tool:'Bash', command:'git commit -m x'})` dispara novo `git log`; `git status` não.

### T8 — Ações (GG-10)
- **Where:** `hooks/register.tsx`. **Depends:** T6
- **Done-when:** copiar hash, checkout (confirmação), cherry-pick (confirmação), criar branch (validação + `check-ref-format` + argv), toast de erro.
- **Verify:** teste: nome inválido não chama `git branch`; nome válido chama `['git','branch',nome,hash]`; checkout só no 2º clique.

### T9 — Gates finais
- `/simplify` → `claude plugin validate .` + `tsc -p .` + `claude plugin test .` → docs (`.specs/codebase`, ROADMAP, STATE).
