# Busca por hash e texto + ↑/↓ por branch

Feature `feature/graph-search-branch-sync` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## SR-01 — Busca por hash e por texto

**Hoje:** o campo de busca só aceita hash (4 a 40 hex); qualquer outra coisa dá "Invalid hash".

**Quero:** um termo só, procurado ao mesmo tempo:
- no **hash** (prefixo), quando o termo parece um hash;
- no **texto**: mensagem (subject) e autor, sem diferenciar maiúsculas.

Critérios de aceite:
- [ ] `f46e` acha o commit cujo hash começa com `f46e`; `fix(pane)` acha o commit com esse texto na mensagem; o nome de um autor acha o commit dele.
- [ ] Vários resultados: o primeiro abaixo do commit selecionado (ou o primeiro da lista); "find" de novo com o mesmo termo vai para o próximo, em loop. Toast `Match 2/5`.
- [ ] Nenhum resultado entre os commits carregados: toast dizendo que não achou entre os N carregados e sugerindo **Load more**.
- [ ] Termo vazio não faz nada.
- [ ] Placeholder em inglês: `find by hash, message or author`.

## BS-01 — ↑/↓ por branch no badge

**Hoje:** só o rodapé do Git Flow mostra ↑/↓ da branch atual contra o remoto.

**Quero:** o badge de cada branch local publicada mostra quantos commits ela está à frente (↑) e atrás (↓) do remoto dela, como no rodapé.

Critérios de aceite:
- [ ] `feature/x` 2 commits à frente do `origin/feature/x`: o segmento do remoto mostra `origin ↑2`.
- [ ] Atrás: `↓1`; os dois: `↑2 ↓1`; em dia: só `origin`, como hoje.
- [ ] Branch sem remoto: nada muda.
- [ ] A largura do badge conta o ↑/↓ (o corte e o `+N` continuam certos).

## Fora do escopo

- Busca no histórico não carregado (só nos commits carregados; **Load more** amplia).
- ↑/↓ contra outra branch que não o upstream dela.
