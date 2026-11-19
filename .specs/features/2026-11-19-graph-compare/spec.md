# Comparar dois pontos do grafo

Feature `feature/graph-compare` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## CP-01 — Abrir uma comparação

Critérios de aceite:
- [x] Nas ações (⋯) de um commit que não é o HEAD: **Compare with HEAD** compara esse commit com o HEAD.
- [x] Nas ações de um commit: **Mark for compare** marca o commit (toast `Marked abc1234 for compare`); nas ações de outro commit aparece **Compare with abc1234**. A marca fica até ser usada.
- [x] No menu de uma branch local que não é a atual e de uma branch remota: **Compare with current branch** compara a branch atual com ela.

## CP-02 — A tela da comparação

Critérios de aceite:
- [x] Uma tela própria do painel (como o diff), com **← graph**: título `Compare A ↔ B` (nome da branch ou hash curto).
- [x] Quantos commits cada lado tem que o outro não tem: `B: 3 ahead, 1 behind A`, de `git rev-list --left-right --count A...B`.
- [x] Os arquivos que mudam de A para B com o diffstat (`git diff --numstat A B`), no mesmo formato dos detalhes do commit.
- [x] Clicar num arquivo abre o diff dele entre A e B (`git diff --no-color --no-ext-diff A B -- <arquivo>`); **← compare** (ou Esc) volta para a comparação, e de lá **← graph** volta para o grafo.
- [x] Sem diferença: a tela diz que os dois pontos têm o mesmo conteúdo.
- [x] Textos da interface em inglês.

## Fora do escopo

- Destacar no grafo os commits do intervalo.
- Comparar com o working tree (mudanças não commitadas).
