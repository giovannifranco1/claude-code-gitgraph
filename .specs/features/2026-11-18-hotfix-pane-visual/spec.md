# Spec — Hotfix 1.6.1: bugs visuais do painel e remote do Git Flow (`2026-11-18-hotfix-pane-visual`)

## Contexto
Relatos do dev usando o painel no repo phren (remote `github`, sem `origin`), 2026-11-18.

## Requisitos e critérios de aceite

### GG-11 — Pílulas redondas depois de `/clear` ou `/resume`
- QUANDO o dev roda `/gitgraph` ENTÃO a detecção de Nerd Font roda de novo (não só no `session.start`, que não dispara após `/clear`/`/resume`).

### GG-04 — Remote visível, em segmento próprio
- O remote de uma branch é um segmento colado à pílula, num tom escuro da cor dela (`shade(bg, 0.45)`) e texto claro, no lugar do `⇄ origin` (pedido do dev; preto e branco testados e recusados).
- QUANDO a pílula não cabe ENTÃO o nome da branch é encurtado com `…` mantendo o segmento do remote; só abaixo de 6 letras o remote sai.

### GG-11 — Nome completo da branch
- A primeira pílula pode ocupar a coluna Description inteira (até o Author) antes de cortar o nome; as demais respeitam o mínimo do assunto e viram `+N`.

### GF-09 — Remote do Git Flow sem `origin`
- QUANDO não há `gitflow.origin` e o repo não tem `origin` ENTÃO o remote é o primeiro do repo (mesma regra do push: `preferredRemote`).
- Os comandos `git flow` recebem `-c gitflow.origin=<remote>` e o push depois do finish vai para esse remote.

### GG-12 — Menu de branch em lista
- QUANDO o menu de uma ref abre ENTÃO cada item ocupa uma linha (lista com `entryList`/`entryRow`, compartilhada), em grupos separados por uma linha `─`: Git Flow · checkout/push/merge/rebase/fetch · rename/copy · delete.
- O item ativo (formulário aberto ou armado para confirmar) aparece com `▸` e em destaque; o formulário (push, delete, rename) abre logo abaixo do item.

### GG-19 — Ações do commit atrás de um ícone
- Os botões do fim dos detalhes saem; um ícone ⋯ (Nerd Font `\uf142`) no fim da linha do assunto abre/fecha a lista: Checkout · Cherry-pick ┈ Copy hash ┈ Reset … here (pedido do dev).
- A lista fecha ao abrir outro commit e depois de uma ação rodar (como o menu de branch). Fica o campo New branch here.
- Listas alinhadas à esquerda: item ativo em destaque com `◂` depois; separador `┈` do tamanho do maior rótulo.

### GG-15 — Cabeçalho alinhado
- QUANDO o painel tem ≥ 70 colunas ENTÃO o cabeçalho tem a largura de uma linha e `Author`/`Commit` ficam sobre as colunas de autor e hash (antes deslocados ~8 colunas e `Commit` cortado).

### GF-01 — Barra do Git Flow sem quebrar grupo
- QUANDO a barra cabe numa linha ENTÃO `tipos │ ações`; QUANDO não cabe ENTÃO os tipos ficam numa linha e as ações da branch (finish, rebase, publish) em outra, sem separador, nunca divididas entre linhas com o outro grupo.

## Fora do escopo
- Bloco escuro entre pílulas vizinhas no modo quadrado: não reproduzido no kit de testes (sem layout); reavaliar com as pílulas redondas de volta.
