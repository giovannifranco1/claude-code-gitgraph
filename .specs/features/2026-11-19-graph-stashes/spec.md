# Stashes no grafo

Feature `feature/graph-stashes` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## SH-01 — Cada stash é uma linha do grafo

**Hoje:** o `git log --all` inclui `refs/stash`, então o stash mais recente aparece como três commits de lixo ("WIP on…", "index on…", "untracked files on…") com um badge `refs/stash`; os outros stashes não aparecem.

**Quero:** cada stash de `git stash list` vira uma linha do grafo, saindo do commit em que foi criado (como o Git Graph do VS Code).

Critérios de aceite:
- [x] O log não traz mais `refs/stash` nem os commits internos do stash (index/untracked).
- [x] Cada stash aparece como uma linha com um nó próprio (`◇`), ligado ao commit base por uma lane, acima dele e na ordem de data entre os commits.
- [x] A linha mostra o nome do stash (`stash@{0}`) num badge e a mensagem dele.
- [x] Stash cujo commit base não está entre os carregados não aparece (Load more o traz).

## SH-02 — Ações do stash

Critérios de aceite:
- [x] Clicar na linha de um stash abre as ações dele (como as Uncommitted changes): **Apply stash**, **Pop stash** e **Drop stash…**, e a lista dos arquivos dele com o diffstat.
- [x] **Apply** roda `git stash apply stash@{N}`, **Pop** roda `git stash pop stash@{N}`.
- [x] **Drop** é destrutivo: pede confirmação antes de rodar `git stash drop stash@{N}`.
- [x] Um apply/pop que para em conflito avisa com o erro do git.
- [x] Textos da interface em inglês.

## Fora do escopo

- Criar branch a partir de um stash (`git stash branch`).
- Diff de arquivo do stash (vem com a feature de diff).
