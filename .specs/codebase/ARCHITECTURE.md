# ARCHITECTURE
- **Módulos puros** (sem `$`): `hooks/log.ts` (parse do `git log`), `hooks/lanes.ts` (layout do grafo), `hooks/detect.ts` (pré-validação de nome de branch), `hooks/format.ts` (datas, truncamento). Testados por `*.test.ts`.
- **Wiring** em `hooks/register.tsx`: registra `/gitgraph`, roda git, guarda resultado em `$.state`, desenha o `Pane` num hook `ui.render`, após cada `tool.call` do Bash e a cada 5s compara a assinatura do repo (status v2 + for-each-ref) e recarrega só se mudou, trata `ui.press`/`ui.input` via handlers dos elementos.
- **Regra da engine:** `$` nunca vai dentro de objetos; funções de render recebem `$` como 1º parâmetro e um `Ctx` sem `$`.
- **Fluxo:** comando/refresh → `git log` → parse → lanes → `$.state` (graph) → render lê `$.state` e redesenha automaticamente.
