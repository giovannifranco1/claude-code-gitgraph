# Diff de arquivo no painel

Feature `feature/graph-file-diff` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## DF-01 — Abrir o diff de um arquivo

**Hoje:** os detalhes de um commit (e de um stash) listam os arquivos com o diffstat, mas não dá para ver o que mudou neles.

**Quero:** clicar num arquivo da lista abre o diff dele numa tela própria do painel (como Settings e Changelog), com **← graph** para voltar.

Critérios de aceite:
- [x] Cada arquivo da lista é clicável, nos detalhes de um commit e de um stash.
- [x] Commit: `git show --format= --diff-merges=first-parent --no-color --no-ext-diff <hash> -- <arquivo>` (num merge, contra o primeiro pai, como o diffstat).
- [x] Stash: `git diff --no-color --no-ext-diff stash@{N}^1 stash@{N} -- <arquivo>`; vazio (arquivo novo do stash) cai para `git show --format= --no-color --no-ext-diff stash@{N}^3 -- <arquivo>`.
- [x] A tela mostra o caminho, de onde é o diff (hash curto ou nome do stash) e as linhas: hunk (`@@`) em destaque, `+` em verde, `-` em vermelho, contexto normal; sem o cabeçalho do git (`diff --git`, `index`, `---`, `+++`).
- [x] Arquivo binário: uma linha dizendo que é binário. Diff vazio: uma linha dizendo que não há mudança para mostrar.
- [x] Diff muito grande: mostra as primeiras 1500 linhas e um aviso de quantas faltam.
- [x] Cada linha tem altura 1 e é cortada na largura do painel (sem quebrar).
- [x] **← graph** (ou Esc) volta para o grafo com o mesmo commit aberto.
- [x] Textos da interface em inglês.

## Fora do escopo

- Diff das Uncommitted changes (vem depois).
- Syntax highlight e diff lado a lado.
