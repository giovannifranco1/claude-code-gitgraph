# Spec — Menu de ref sem botão direito (`2026-11-18-ref-menu-buttons`)

## User story
Como dev que usa o painel numa ferramenta onde o botão direito não chega ao mod (VS Code, alguns terminais), quero abrir o menu de uma branch/tag por um botão visível nos detalhes do commit, sem depender do clique direito na pílula.

## Decisões do dev (2026-11-18)
- Botões em destaque **no topo dos detalhes**, um por ref do commit, abrindo o mesmo menu do clique direito.
- Contexto: os detalhes já tinham uma linha `Refs: ⋯ develop` no fim, discreta e com filho em array no `Button` (o VS Code descarta: o botão saía vazio).

## Requisitos e critérios de aceite

### RM-01 — Botões de ref no topo dos detalhes
- QUANDO um commit com refs (branch local, remota, tag; não o `HEAD` destacado) está aberto nos detalhes ENTÃO, logo abaixo da linha do autor, aparece uma linha `Branch actions:` seguida de um Button com moldura por ref, rotulado `<ref> ▾`.
- QUANDO o dev aperta um desses botões ENTÃO abre o mesmo menu do clique direito (o mesmo `openMenu`); apertar de novo fecha.
- QUANDO os botões não cabem numa linha ENTÃO quebram em mais linhas, sem cortar nenhum (mesma conta de largura dos botões de ação).
- QUANDO o commit não tem refs ENTÃO a linha não aparece.
- O rótulo é uma única string dentro do `Button` (o VS Code descarta filhos aninhados).
- A linha antiga `Refs: ⋯ <ref>` do fim dos detalhes sai.

## Fora do escopo
- `⋯` em cada linha do grafo (opção não escolhida).
