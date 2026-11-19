# Resolver conflitos com o Claude

Feature `feature/actions-resolve-conflicts` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## CR-01 — Pedir ao Claude para resolver os conflitos

**Hoje:** um merge, rebase, cherry-pick, stash apply ou finish do git flow que para em conflito deixa os arquivos com marcadores; o painel só oferece **Continue** e **Abort** (no git flow).

**Quero:** um botão que manda para o chat da sessão um pedido de resolver os conflitos, com a lista dos arquivos.

Critérios de aceite:
- [x] Com arquivos em conflito, a linha **Uncommitted changes (N)** mostra `Conflicts (N)` em vermelho, e a lista de ações dela começa com **✨ Resolve conflicts with Claude**.
- [x] No conflito de um git flow (onde aparecem **Continue** e **Abort**), um botão **✨ Ask Claude** ao lado.
- [x] O pedido vai para o chat via `$.prompt.submit` e diz: os arquivos em conflito; de onde vem o conflito, quando o painel sabe (o `finish`/`rebase`/`merge` do git flow e a branch); o repositório, quando não é a pasta da sessão; que o Claude resolva mantendo o que os dois lados queriam, tire os marcadores e dê `git add` em cada arquivo; e que **não** faça commit nem continue/aborte a operação (isso fica no painel).
- [x] Toast `Asked Claude to resolve N conflicted files` (`file` no singular).
- [x] Sem arquivos em conflito, nada disso aparece.
- [x] Textos da interface em inglês.

## Fora do escopo

- Rodar o continue sozinho depois que o Claude terminar.
