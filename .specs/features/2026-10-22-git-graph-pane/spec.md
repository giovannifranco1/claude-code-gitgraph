# Spec — Git Graph pane (`2026-10-22-git-graph-pane`)

## User story
Como dev usando o Claude Code, quero um painel lateral com o grafo de commits do repositório (como a extensão Git Graph do VS Code), para entender o histórico e acompanhar o que o Claude faz no git sem sair da sessão.

## Requisitos e critérios de aceite

### GG-01 — Abrir o painel
- QUANDO o dev roda `/gitgraph` ENTÃO abre um painel com título "Git Graph" e o grafo do repositório do cwd da sessão é carregado.
- QUANDO `/gitgraph` é rodado com o painel já aberto ENTÃO o painel recarrega (não duplica).

### GG-02 — Fora de um repositório
- QUANDO o cwd não está num repositório git ENTÃO o painel mostra "Não é um repositório git" e nenhuma ação.

### GG-03 — Grafo
- QUANDO o log é carregado ENTÃO cada commit ocupa exatamente uma linha, com `●` na lane do commit e `│` nas lanes que passam.
- QUANDO um commit tem 2+ pais (merge) ENTÃO a linha mostra a ligação horizontal até a lane do pai extra (`─╮`).
- QUANDO duas lanes convergem no mesmo commit (fork) ENTÃO a lane que termina mostra `─╯` ligando à lane do commit.
- Cada lane mantém a mesma cor do início ao fim; cores ciclam numa paleta fixa.
- QUANDO há mais lanes do que cabe na largura ENTÃO o grafo é truncado com `…`.

### GG-04 — Linha do commit
- Cada linha mostra: grafo, hash curto (7), badges de refs, assunto, autor e data relativa (`5m`, `3h`, `2d`, `Oct 9`).
- Badges: `HEAD → main` destacado, branches locais, remotas (`origin/main`) esmaecidas e tags (`🏷 v1.0` / `tag:`).

### GG-05 — Escopo de branches
- Por padrão o log usa todas as refs (`--all`).
- QUANDO o dev pressiona o toggle no header ENTÃO alterna entre "todas" e "só HEAD", e recarrega.

### GG-06 — Limite e paginação
- O log carrega até 300 commits. QUANDO há mais ENTÃO aparece "Carregar mais" que soma +300.

### GG-07 — Mudanças não commitadas
- QUANDO o working tree tem alterações ENTÃO a primeira linha é "Uncommitted changes (N)" ligada ao HEAD.

### GG-08 — Detalhes do commit
- QUANDO o dev pressiona uma linha de commit ENTÃO abaixo dela expande: hash completo, autor <email>, data absoluta, mensagem completa e arquivos alterados com `+adds -dels`.
- QUANDO pressiona o mesmo commit de novo ENTÃO recolhe.

### GG-09 — Auto-refresh
- QUANDO o Claude roda um Bash que altera o repo (refs, HEAD ou working tree — detectado por assinatura `status`+`for-each-ref`, não por heurística do texto do comando), por exemplo um comando git (commit, merge, checkout, rebase, reset, pull, fetch, branch, tag, cherry-pick, stash, revert, `gh pr merge/checkout`…) ENTÃO o painel recarrega após o comando.
- QUANDO o comando git é só leitura (`status`, `log`, `diff`, `show`…) ENTÃO não recarrega.
- QUANDO o repo muda por fora (outro terminal) ENTÃO o painel percebe em até ~5s (comparação de assinatura de refs/HEAD/status) enquanto aberto.
- Há um botão de refresh manual no header.

### GG-10 — Ações
- **Copiar hash:** copia o hash completo para o clipboard e mostra toast.
- **Checkout:** faz checkout da branch local que aponta para o commit; sem branch local, `checkout --detach`. Exige confirmação (segundo clique).
- **Criar branch aqui:** campo de nome; Enter roda `git branch <nome> <hash>` e recarrega.
- **Cherry-pick:** `git cherry-pick <hash>`, exige confirmação; desabilitado para o HEAD.
- QUANDO uma ação falha ENTÃO mostra toast com a primeira linha do stderr e não muda nada além do que o git fez.

## Extensão (2026-10-22, pedido do dev após testar)

### GG-11 — Badges em pílula arredondada
- Cada ref é uma pílula com fundo na cor da lane do commit (remoto sozinho: cinza; tag: dourado `◆`; HEAD solto: vermelho); a branch atual tem `●` e negrito; local + remoto numa pílula só (`main ⇄ origin`).
- QUANDO há Nerd Font (opção `badges` = `auto` com fonte instalada, ou `round`) ENTÃO as pontas são arredondadas (``…``); com `square` (ou sem Nerd Font no `auto`) ENTÃO pontas retas.
- A largura da pílula é a mesma nos dois modos (as colunas não se mexem).

### GG-12 — Menu de branch (botão direito), como o Git Graph do VS Code
- QUANDO o dev clica com o botão **direito** numa pílula ENTÃO abre, abaixo da linha, o menu daquela ref; clique **esquerdo** na pílula seleciona o commit.
- O mesmo menu é acessível por botões `⋯ <ref>` no detalhe do commit (teclado e superfícies sem `Client`).
- **Branch local:** Checkout (não na atual), Renomear… (campo; `git branch -m <velho> <novo>`, nome validado como em GG-10), **Push branch…** (abre a escolha de remotes: um `☑/☐` por remote + `todos`; começa com os remotes que a branch rastreia, senão `origin`, senão o primeiro; **Enviar** roda `git push -u <remote> <branch>` por remote marcado e reporta cada falha pelo remote; sem remote marcado não há Enviar), Merge na atual, Rebase da atual sobre esta (não na atual), Excluir (`git branch -d`, não na atual), Copiar nome.
- **Branch remota:** Checkout (cria local rastreando: `git switch --track <remote>/<b>`), Fetch (`git fetch <remote> <b>`), Merge na atual, Excluir no remoto (`git push <remote> --delete <b>`), Copiar nome.
- **Tag:** Push tag… (`git push <remote> refs/tags/<tag>`, mesma escolha de remotes), Excluir tag (`git tag -d`), Copiar nome.
- Ações que mudam o repo ou o remoto pedem confirmação (2º clique; o push confirma pelo Enviar).
- QUANDO uma ação está rodando ENTÃO os botões de ação dão lugar a um spinner com o que está acontecendo (`Enviando feat para origin, github…`) e um segundo clique não dispara nada. Rede (push/fetch) com `GIT_TERMINAL_PROMPT=0` e timeout maior; falha → toast com stderr.
- Tudo via argv; nomes de ref nunca passam por shell.

### GG-13 — Configurações do repositório (como o "Repository Settings" do Git Graph)
- QUANDO o dev pressiona `⚙ configurações` (atalho `s`) no header ENTÃO o painel mostra as configurações no lugar do grafo; `← grafo` volta.
- **Usuário:** mostra `user.name`/`user.email` do repositório (`--local`) e global (`--global`). Escopo escolhido por botão (padrão: este repositório). QUANDO o dev envia um nome/e-mail ENTÃO roda `git config --<escopo> user.<chave> <valor>`; vazio ENTÃO `git config --<escopo> --unset user.<chave>`. E-mail precisa ter `@`.
- **Remotes:** lista `nome → URL` (de `git remote -v`). Por remote: Fetch (`git fetch <r>`), Editar URL (`git remote set-url <r> <url>`), Excluir (confirmação; `git remote remove <r>`). Adicionar: nome + URL → `git remote add <nome> <url>`.
- Nome de remote: letras, números, `.`, `_`, `-`, `/`, sem `-` inicial. URL: não vazia, sem espaço, sem `-` inicial. Inválido ENTÃO toast e nada roda.
- Ações usam o mesmo loading de GG-12 e recarregam grafo e configurações ao terminar.

### GG-14 — Duplo clique na pílula faz checkout
- QUANDO o dev clica duas vezes (≤ 450 ms) numa pílula de branch local ENTÃO roda `git checkout <branch>` sem confirmação (o gesto já é explícito), com o spinner de GG-12.
- Branch remota ENTÃO `git switch --track <remote>/<b>`. Branch atual, tag ou HEAD solto ENTÃO nada roda (toast explica).
- O primeiro clique continua abrindo o commit.

### GG-15 — Scroll leve (virtualização)
- Medido: 300 commits ≈ 450 ms e ~2.400 elementos por render, e cada passo de scroll re-renderiza o painel.
- QUANDO o painel desenha ENTÃO só as linhas na janela (`scroll.offset` .. `+bodyRows`) e uma margem são elementos; o resto vira espaçadores da mesma altura, então a posição do scroll não muda.
- Linhas de commit têm 1 linha; detalhe e menu têm altura explícita (o conteúdo que sobra é cortado).
- A tabela não mostra mais a coluna Data; a data fica no detalhe.

### GG-16 — Busca de commit por hash
- No topo há um campo de busca. QUANDO o dev envia 4–40 dígitos hex ENTÃO o primeiro commit carregado cujo hash começa com isso é selecionado (detalhe aberto) e o painel rola até ele.
- QUANDO não está entre os carregados ENTÃO `git rev-parse --verify --quiet <q>^{commit}` diz se existe: existe ENTÃO toast "fora dos N carregados"; não existe ENTÃO toast "nenhum commit". Outra entrada ENTÃO toast de hash inválido e nada roda.

### GG-17 — Refresh atualiza tudo e dá feedback
- QUANDO o dev pressiona refresh ENTÃO recarrega grafo/status, o detalhe do commit selecionado e as configurações (se abertas).
- Enquanto roda: spinner ao lado e o botão diz `refreshing…`; um segundo clique não dispara outro refresh.
- Ao terminar: o botão mostra `✓ updated` em verde por ~1,5 s e volta a `refresh`.
