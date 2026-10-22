# ARCHITECTURE
- **Módulos puros** (sem `$`): `hooks/log.ts` (parse do `git log`), `hooks/lanes.ts` (layout do grafo), `hooks/detect.ts` (pré-validação de nome de branch), `hooks/format.ts` (datas, truncamento). Testados por `*.test.ts`.
- **Wiring** em `hooks/register.tsx`: registra `/gitgraph`, roda git, guarda resultado em `$.state`, desenha o `Pane` num hook `ui.render`, após cada `tool.call` do Bash e a cada 5s compara a assinatura do repo (status v2 + for-each-ref) e recarrega só se mudou, trata `ui.press`/`ui.input` via handlers dos elementos.
- **Regra da engine:** `$` nunca vai dentro de objetos; funções de render recebem `$` como 1º parâmetro e um `Ctx` sem `$`.
- **Render virtualizado:** cada passo de scroll re-renderiza o Pane; só as linhas na janela (+15) viram elementos, o resto são espaçadores. Toda linha tem altura explícita (`line()`, `framed()`), o que torna os espaçadores exatos.
- **Cache de grafo por versão:** o render lê `graphVersion` (pequeno) e usa `graphCache` (grafo, `maxCells`, índice hash→linha) em vez de trazer o grafo inteiro do `$.state` a cada passo.
- **Client modules:** `pill.tsx` (pointer: direito abre menu, esquerdo seleciona, duplo faz checkout) e `spinner.tsx` rodam no lado do terminal; só terminal/desktop desenham `Client` (vscode tem stub).
- **UI transitória** fechada num lugar só (`CLOSED`); ações git passam por `runActions` (trava, spinner, toast por falha, recarga).
- **Fluxo:** comando/refresh → `git log` → parse → lanes → `$.state` (graph) → render lê `$.state` e redesenha automaticamente.
