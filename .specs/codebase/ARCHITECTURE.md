# ARCHITECTURE
- **Módulos puros** (sem `$`): `hooks/log.ts` (parse do `git log`), `hooks/lanes.ts` (layout do grafo), `hooks/detect.ts` (detecta comandos git que mudam o repo). Testados por `*.test.ts`.
- **Wiring** em `hooks/register.tsx`: registra `/gitgraph`, roda git, guarda resultado em `$.state`, desenha o `Pane` num hook `ui.render`, reage a `tool.call` do Bash para auto-refresh, trata `ui.press`/`ui.input` via handlers dos elementos.
- **Fluxo:** comando/refresh → `git log` → parse → lanes → `$.state` (graph) → render lê `$.state` e redesenha automaticamente.
