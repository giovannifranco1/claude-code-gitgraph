# Spec — Modais, scroll próprio e pílulas (`2026-11-18-flow-dialog`, branch `feature/pane-modals-scroll`)

## User story
Como dev usando o painel, quero que iniciar, finalizar, fazer rebase/merge ou publicar uma branch do Git Flow abra uma pequena modal sobre o grafo, para ver e decidir a ação num lugar só, em vez de formulários e "Confirm: …?" espalhados no rodapé.

## Decisões do dev (2026-11-18)
- Modal = **quadro flutuante dentro do painel, sobre o grafo** (opção escolhida entre: quadro sobre o grafo, pane de diálogo em aba, diálogo `ask` da engine).
- Contexto técnico: panes de mod são abas (um pane de diálogo esconderia o grafo); o rodapé fixo já usa uma `Box position="absolute"` sobre uma camada de espaços — a modal usa a mesma técnica.

## Requisitos e critérios de aceite

### FD-01 — Modal sobre o grafo
- QUANDO o painel está docked no terminal e uma ação do Git Flow abre (start, finish, update, publish) ENTÃO aparece um quadro com borda arredondada, título da ação, centralizado na janela visível, sobre o grafo (camada de espaços por baixo: o grafo não aparece através).
- A modal tem largura limitada (até 60 colunas, nunca mais que o painel) e altura exata das suas linhas.
- QUANDO o dev aperta `cancel` ENTÃO a modal fecha sem rodar nada.
- QUANDO a ação roda ENTÃO a modal fecha e o spinner aparece no rodapé, como hoje.

### FD-02 — Start e Finish na modal
- Start: título `New <tipo>`, campo do nome (pré-preenchido com a próxima versão em release/hotfix), `start` e `cancel`.
- Finish: título `Finish <branch>`, switches `no-ff`, `push`, `keep branch` (um por linha), mensagem da tag quando o tipo tem tag, `[ Finish ]` e `cancel`.
- Dentro da modal o botão principal roda **no primeiro clique**: a modal já é a confirmação.

### FD-03 — Update confirmado na modal
- QUANDO o dev aperta rebase/merge (modal Git Flow ou menu da branch) ENTÃO abre a modal `Rebase <branch> on <parent>?` / `Merge <parent> into <branch>?` com `[ Rebase|Merge ]` e `cancel` — no lugar do clique duplo com `Confirm: …?`. (Publish saiu: ver FD-06.)

### FD-04 — Fora do terminal docked
- QUANDO o painel não está docked no terminal (inline, desktop, VS Code) ENTÃO os mesmos conteúdos aparecem sob a barra do rodapé, como hoje (sem camada absoluta).

### FD-05 — Texto da modal (pedido do dev)
- Mensagem da tag padrão = só a versão (`0.1.4`), não `Hotfix 0.1.4`.
- Labels dos campos sem `:` (o `Input` já desenha o seu).
- Switches com dois espaços depois do ícone Nerd Font (ele ocupa duas células); linha em branco depois do título e antes dos botões.

### MD-01 — Menu da branch como modal
- QUANDO o painel está docked no terminal e o menu de uma ref abre (clique direito ou `Branch actions:`) ENTÃO ele aparece na mesma modal flutuante: título com a pílula da ref, a lista em grupos, `close` embaixo; moldura na cor da ref.

### MD-02 — Ações do commit como modal
- QUANDO o painel está docked no terminal e o ícone ⋯ dos detalhes é apertado ENTÃO as ações (Checkout, Cherry-pick, Copy hash, Reset) aparecem na modal: título `Commit <hash>`, `close` embaixo; moldura na cor da lane.

### MD-04 — Push, Delete e Rename em modal própria (pedido do dev)
- No terminal docked, **Push branch…**, **Delete branch…** e **Rename…** trocam a lista do menu por uma modal própria (`Push feat`: remotes e `Push to …`; `Delete feat`: switch de force e `Delete`, no primeiro clique; `Rename feat`: o campo do nome). `cancel` volta para a lista.

### MD-05 — Listas sem separador (pedido do dev)
- Menu de branch e ações do commit: grupos separados por uma linha em branco (`<prefix>-gap-<n>`), sem o `┈` da 1.6.1.

### MD-06 — Clique no badge abre o menu (pedido do dev)
- Clique esquerdo (ou direito) num badge abre o menu da ref; de novo, fecha. O texto do commit abre os detalhes. O duplo clique no badge continua fazendo checkout (pedido do dev) e fecha o menu que o primeiro clique abriu; o tempo vem de `$.clock.now()`, que o `mock.clock` controla nos testes.

### GG-25 — Fetch em modal (pedido do dev)
- No terminal docked, o fetch (☁) abre uma modal sem título: spinner + `Fetching remote(s)…` enquanto roda, centralizados, sobre `[ Dismiss ]` centralizado. Ao terminar, a modal fecha; se falhar, fica com o erro em vermelho. O toast do resultado sai sempre (pedido do dev). Genérico em `withRunning(…, asNotice)` / `runActions(…, asNotice)`; só o fetch usa por ora.

### MD-03 — Fora do terminal docked
- Menu e ações continuam no quadro sob a linha / nos detalhes, como antes.

### GG-20 — Largura do grafo pela janela
- A coluna Graph tem a largura das linhas na janela visível (mais a folga de scroll), não a do trecho mais largo carregado; a linha corta o grafo pela coluna (`…`), nunca passa dela.

### GG-21 — Scroll próprio no terminal docked (sem tremer)
- No terminal docked o mod segura o `ui.scroll` da engine (sem `next`) e rola as próprias linhas: o pane fica parado na altura dele, cabeçalho e rodapé fixos, só a janela de linhas muda (`scrollTop` em `$.state`). Fora do docked, a engine rola como antes.
- A busca por hash centraliza o commit até o próximo scroll.

### GG-22 — Pílulas por segmentos
- Branch: `[nome][remote]` (remote num tom escuro da cor dela, texto claro).
- Branch em checkout: `[alvo nome][remote]`, um check em círculo (Nerd Font `\uf058`, sem Nerd Font `✔`) antes do nome, no tom escuro da lane (o mesmo do segmento do remote) — no lugar da bolinha preta (pedido do dev: pouco destaque; ✔, pin, segmento claro e ícone branco testados e recusados).
- Tag: `[ícone][versão]` — ícone de tag (Nerd Font `\uf02b`, sem Nerd Font `◆`) num segmento na cor da tag, o ícone no tom escuro dela (como o alvo da branch atual); a versão num segmento nesse tom escuro, texto claro (pedido do dev, como no Git Graph do VS Code).

### GG-23 — Colunas opcionais (pedido do dev)
- Settings ganha a seção **Columns** com switches `author` e `hash`; desligados, somem das linhas e do cabeçalho, e a Description fica com o espaço.
- Vale para todos os repositórios e fica salvo entre sessões no store do mod (`columns`); o render lê de `$.state`, carregado no início da sessão e a cada `/gitgraph`.

### FD-06 — Git Flow numa modal aberta pelo rodapé (pedido do dev)
- O rodapé vira uma linha só: uma linha separadora em cima e o botão `⑂ Git Flow` sozinho na linha de baixo (traços ao lado do botão recusados pelo dev), com o contexto depois dele: a branch de git flow em checkout (`Git Flow · feature/login`), ou `not installed` / `needs git-flow-next` / `not set up`; nada numa branch comum. Ele abre a modal **Git Flow**: uma linha por tipo (feature, bugfix, release, hotfix) com `start` e, no tipo da branch atual, `rebase`/`merge` e `finish`. Publish sai de todo lugar: **Push branch…** do menu já publica (pedido do dev).
- Sem git flow instalado/configurado, a modal diz por quê e oferece o set-up (o formulário de init vira a modal `Set up git flow`).
- O rodapé só cresce com uma ação rodando (spinner) ou um conflito (Continue/Abort).

### FD-07 — Mais dados no rodapé (pedido do dev)
- Numa branch de git flow, depois do nome: a base de onde ela sai (`from develop`) e como está com o upstream: `↑2 ↓1 github` (só os números diferentes de zero), `in sync with github`, ou `not published` sem upstream. Tudo do `git status --porcelain=v2 --branch` que o painel já roda (`parseSync`): nenhum processo a mais.

### GG-24 — Branch só no remote com fantasma (pedido do dev)
- Uma branch que só existe no remote (já mergeada e apagada aqui) aparece como a tag: `[fantasma][origin/feature/x]`, o ícone (Nerd Font `\u{f02a0}`, Material Design; o `\uf6e2` do Font Awesome não existe no Nerd Fonts 3; sem Nerd Font `◌`) num segmento cinza no tom escuro dele, o nome no segmento escuro.

## Fora do escopo
- Init/Reconfigure do Git Flow e Continue/Abort de conflito continuam no rodapé.
- Pane de diálogo separado e `$.ui.ask`.
