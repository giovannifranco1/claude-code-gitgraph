# Changelog

Mudanças do Git Graph (`gitgraph`) por versão, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e com versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [1.9.2] - 2026-11-26

### Corrigido

- Remote recém-adicionado: um remote sem nada buscado ou enviado ainda (o `origin` de um repositório novo no GitHub) não aparecia para o painel, que tirava os remotes dos refs `refs/remotes/…`, então o menu da branch ficava sem **Push branch…** (e a tag sem **Push tag…**) até o primeiro push pelo terminal. Agora os remotes vêm do `git remote`, e um remote adicionado pelo terminal aparece no próximo poll.

## [1.9.1] - 2026-11-26

### Corrigido

- Branch morta: uma release finalizada com `--no-ff` na main e fast-forward na develop (que não tinha andado desde que ela abriu) seguia viva no grafo, porque o tip dela caía na linha de primeiro pai da develop. Agora uma branch mergeada também é morta quando é o lado mergeado de um merge na linha de uma base cuja mensagem a nomeia (`Merge branch 'release/x'`, `Merge remote-tracking branch 'origin/x'`, `Merge pull request #n from owner/x`); outra branch no mesmo commit (uma `homolog`, por exemplo) continua viva.

## [1.9.0] - 2026-11-26

### Adicionado

- Worktrees: o ícone de worktree no header abre a tela **Worktrees**, uma linha por worktree criada à parte, sem a pasta principal do repositório (caminho, branch, `current` na que o painel mostra, arquivos mudados, locked/prunable); clicar numa abre **Copy path** e **Remove…** (confirma; com mudanças, só com **force**; a branch fica). **＋ New worktree** na tela (numa branch que existe, ou numa nova a partir do HEAD), **New worktree…** no menu de uma branch local e **New worktree here…** nas ações de um commit (numa branch nova) abrem o form num modal: nome (a partir da branch), **Path** (acompanha o nome até ser editado; pode ser uma pasta já criada, vazia) e, no commit, a branch nova. **Create** roda o `git worktree add`; **✨ Ask Claude** pede ao Claude para criar com o mesmo comando. Um caminho fora da pasta do repositório avisa o que deixa de funcionar (a sessão do Claude não alcança a pasta) e pede **Create anyway**; dentro do repositório e não ignorada, a pasta vai para o `.git/info/exclude`, para a worktree não aparecer nas Uncommitted changes. A branch aberta noutra worktree ganha o ícone de worktree no badge, e o menu dela **Show worktree**. Nas Settings, **Worktree folder** define onde as worktrees novas deste repositório vão (padrão `.claude/worktrees`).
- Ambiente das worktrees pelo `gitgraph.json`: com a seção `worktrees` na raiz do repositório (a que o `/nano-worktree init` escreve), cada worktree na pasta do contrato ganha, na tela **Worktrees**, o status do ambiente (`● up`, `○ down`, `? unknown`, perguntado ao abrir a tela), um botão **↗ host** por link (abre no navegador), **Up**, **Down**, **Logs** (segue a saída ao vivo abaixo da worktree, com **Stop logs**) e **Check** (as linhas `✓`/`✗`/`–` abaixo dela, com **Hide check** para tirá-las), cada um só quando o contrato declara. Com `new` e `remove` declarados, **Create** e **Remove** rodam o script do projeto em vez do `git worktree`, e o form não pede o Path (o script põe a worktree na pasta dele). Os comandos rodam na worktree principal, sem shell; em falha, o toast mostra a saída. Um contrato inválido ou de versão mais nova aparece em amarelo na tela, e as worktrees seguem sem ele. No grafo, o badge de uma branch com o ambiente da worktree no ar ganha um `●` verde depois da marca de worktree (o status é perguntado de novo num load quando tem mais de 30 s).
- **Reset changes…** nas ações das **Uncommitted changes (N)**, depois de **Commit changes…** e **Stash changes…**: a modal pede o modo, **Mixed** (`git reset`: tira tudo do stage, os arquivos ficam como estão) ou **Hard** (`git reset --hard`: descarta as mudanças dos arquivos rastreados). Abrir a modal não roda nada, escolher o modo é a confirmação. Arquivos novos ficam nos dois modos (sem `git clean`); **cancel** volta para a lista.
- Stashes no grafo: cada stash de `git stash list` é uma linha com um nó `◇` saindo do commit em que foi criado, acima dele e na ordem de data, com o nome (`stash@{0}`) num badge. Clicar abre os arquivos dele (com os novos) e as ações **Apply stash**, **Pop stash** e **Drop stash…** (drop pede um segundo clique). Um stash cujo commit não está carregado aparece com **Load more**.
- Diff de arquivo: clicar num arquivo nos detalhes de um commit ou de um stash abre o diff dele numa tela do painel (como Settings e Changelog), com os hunks em azul, `+` em verde e `-` em vermelho, sem o cabeçalho do git. Num merge, contra o primeiro pai; num stash, contra o commit em que foi criado (um arquivo novo do stash aparece inteiro). Mostra até 1500 linhas; **← graph** (ou Esc) volta com o commit aberto.
- Comparar dois pontos do grafo: **Compare with HEAD** e **Mark for compare** nas ações de um commit (marcado um, os outros ganham **Compare with abc1234**), e **Compare with current branch** no menu de uma branch. A tela da comparação mostra quantos commits cada lado tem a mais (`feat: 3 ahead, 1 behind main`) e os arquivos que mudam de um para o outro; clicar num arquivo abre o diff dele entre os dois, e **← compare** (ou Esc) volta para a comparação. O commit marcado ganha um ícone em azul no fim da coluna Description (o git compare das Octicons com Nerd Font, `①` sem ela), e nas ações dele **Unmark for compare** tira a marca.
- Resolver conflitos com o Claude: com arquivos em conflito, a linha **Uncommitted changes (N)** mostra `Conflicts (N)` em vermelho e as ações dela começam com **✨ Resolve conflicts with Claude**; no conflito de um git flow, **✨ Ask Claude** fica ao lado de **Continue** e **Abort**. O pedido vai para o chat da sessão com os arquivos, de onde veio o conflito (quando o painel sabe) e o repositório; o Claude resolve e dá `git add`, sem commitar nem continuar: isso fica no painel.

- **Delete branch…** de uma branch local com remote ganha o switch **also on origin** (desligado por padrão): ligado, apaga a branch local e depois `git push <remote> --delete <branch>` em cada remote que a tem, parando no primeiro erro (se a local não sai, o remote fica).

### Alterado

- Finish de release e hotfix como no git flow clássico: o git flow faz o merge só na `main` (com a tag), e o painel faz o merge da própria branch na `develop` (`Merge branch 'hotfix/x' into develop`), em vez do merge da `main` na `develop` do git-flow-next. Um hotfix com uma `release/*` aberta entra na release, que leva o fix à develop quando fecha. Um conflito nesse merge mostra **Continue** e **Abort** e, continuando, o painel faz o push e apaga a branch como faltava.
- A linha da branch do checkout fica sempre na primeira lane do grafo, como no Git Graph do VS Code: com uma base mais nova acima (a develop andou), ela não vai mais para a direita.
- A branch do checkout não tem mais o check dentro do badge: um `○` vazado na cor dela fica antes do badge, fora dele (no grafo e no header). Mergeada, ganha o fantasma dentro do badge como as outras.

### Corrigido

- Uma branch enviada sem commit próprio aparecia morta (fantasma e cinza) assim que a base andava, porque o tip dela já estava na base. Agora só aparece morta a branch finalizada, cujo tip ficou fora da linha principal da base (o merge do `finish`). Um merge fast-forward não marca a branch como morta.
- O stash mais recente aparecia como três commits do git (`WIP on…`, `index on…`, `untracked files on…`) com um badge `refs/stash`: o log deixa `refs/stash` de fora.

## [1.8.1] - 2026-11-19

### Corrigido

- O changelog e a versão da 1.8.0: as mudanças dela estavam em `[Unreleased]` e o `plugin.json` (e o badge do README) seguiam em 1.7.2, então a tela de changelog marcava a versão errada como a sua.

## [1.8.0] - 2026-11-19

### Adicionado

- Busca por hash **e** por texto: o mesmo campo acha o commit pelo começo do hash, pela mensagem ou pelo autor (sem diferenciar maiúsculas). Com vários resultados, o campo fica aberto com o termo e o toast diz `Match 2/5`; buscar de novo vai para o próximo, em loop. Sem resultado entre os commits carregados, sugere **Load more**.
- ↑/↓ no badge de cada branch local publicada: quantos commits ela está à frente e atrás do remoto dela (`feat` + `origin ↑2 ↓1`; com o remoto em outro commit, só `↑2`). A conta vem de um `git for-each-ref` rodado junto com o load, não no poll de 5 s (contar é caro), e é refeita a cada push, pull ou commit, que já recarregam o painel.
- Ações das mudanças não commitadas, como as de uma branch: clicar na linha **Uncommitted changes (N)** abre a lista (no terminal docked, numa modal; nas outras superfícies, sob a linha) com **Commit changes…** e **Stash changes…**, e cada uma abre a sua própria modal; **cancel** (ou Esc) volta para a lista. **Stash changes…** pede uma mensagem opcional e roda `git stash push --include-untracked` (arquivos novos entram também); sem mensagem, o git dá o nome.
- **Commit changes…** em duas etapas. Primeiro os arquivos: cada mudança com o que mudou (**M** modificado, **A** novo, **D** apagado, **R** renomeado) e um ☑/☐, e **Stage all changes** para marcar ou desmarcar todos (começa tudo marcado); **Next** segue. Depois a mensagem: o Claude (haiku) lê o diff **só dos arquivos escolhidos** e os últimos commits do repo e escreve no estilo deles; ela aparece inteira, sem edição, numa modal mais larga. **Commit** (o Enter) commita só esses arquivos (`git add -A -- <arquivos>` + `git commit -- <arquivos>`, o resto continua como mudança), **✨ suggest again** pede outra, **← files** volta à escolha e **cancel** descarta tudo.
- `Staged (N)` em vermelho ao lado de **Uncommitted changes (N)**: quantos arquivos já estão em stage. Vem do mesmo `git status` do load.

### Alterado

- Botões de ação centralizados no rodapé de todas as modais (commit, stash, push, delete, rename, Git Flow, aviso de erro).
- **Enter** aplica a ação principal das modais: o foco já começa no botão de **push**, **delete**, **finish**, **continue** e **update** (e no **Dismiss** de um erro); nas modais com campo (commit, rename, nome da branch), o Enter envia o campo.
- Header sem o `⎇`: a branch atual aparece como o badge dela no grafo, com o ✔ antes do nome, em negrito e na cor da lane (HEAD destacado: o hash curto).

### Corrigido

- `Esc` (e `Enter`) nas modais: ao abrir uma modal, o painel pede o teclado (se o prompt estiver vazio), porque o `Esc` só chega à modal com o painel focado; antes, uma modal aberta pelo clique num badge deixava o teclado no prompt e o `Esc` não fazia nada. Depois de um `Esc` que volta de um formulário para a lista, o painel pede o teclado de novo.

## [1.7.2] - 2026-11-19

### Corrigido

- Tags na cor da branch `main` (a base principal do git flow, ou `main`/`master`), não mais em amarelo fixo; o amarelo fica só enquanto a `main` não está entre os commits carregados.
- Branch remota mergeada é detectada pelo git (`for-each-ref --merged` nas bases que existem aqui), não só pelos commits carregados: um merge antigo também vira fantasminha, sem precisar de **Load more**.
- Textos secundários (autor, hash, avisos, cabeçalho da lista, Settings, Changelog) num cinza fixo (`#808080`), não no `dimColor` (o "esmaecido" do terminal), que em muitos temas quase não aparece.

## [1.7.1] - 2026-11-18

### Corrigido

- `Esc` fecha a modal aberta (aviso do fetch, Git Flow, menu da branch e os forms dele, ações do commit) e as telas de Settings e Changelog, voltando ao grafo; o painel continua aberto. Sem modal aberta, `Esc` só devolve o teclado ao prompt, como antes. Com uma modal aberta, o `×` do painel também fecha a modal primeiro.
- Header sem texto além da branch: saem a contagem de commits e o `● N changes` (que aparecia cortado, `● 4 ch…`); as mudanças continuam na linha **Uncommitted changes** do grafo.
- **all branches** desligado mostra todas as branches locais (`--branches`), não só a branch atual; as branches remotas (`origin/*`) e os commits que só existem no remote somem, e o `· origin` continua no badge da branch local publicada. Ligado, continua local + remoto (`--all`).
- No máximo dois badges de branch (local ou remota) por commit na coluna Description, mais as tags, que não contam no limite; as demais branches entram no `+N`. Os badges depois do primeiro têm mais espaço antes de serem cortados: a descrição do commit reserva 10 colunas, não mais 20.
- Badge de branch remota (`origin/x` num commit diferente do da local) no tom escuro da cor da branch local, com texto claro (o mesmo tom do segmento `origin` do badge local), não mais em cinza; só a branch morta continua cinza, com o fantasminha.
- Branch remota mergeada numa base (`main`/`develop`, as do git flow) aparece morta (fantasminha e cinza), mesmo que a branch local ainda exista. No mesmo commit da local, as duas viram um badge só, desenhado como o badge da branch atual: fantasminha e nome no cinza, e o remoto no tom escuro do cinza (`👻 feature/a` + `origin`, sem separador). Não contam as próprias bases nem uma branch recém-criada, ainda no topo da base.
- Cores das lanes: uma branch nova nunca pega a cor de uma lane ainda aberta (ex.: um hotfix saindo da `main` azul não é azul), mesmo depois de a paleta dar a volta.
- Commits de merge com o texto em cinza (descrição, autor e hash, em `#808080`), como o Git Graph do VS Code; o grafo e os badges mantêm as cores.

## [1.7.0] - 2026-11-18

### Adicionado

- Ações em modal: no terminal docked, iniciar, finalizar e fazer rebase/merge com o Git Flow, o menu de uma branch (e o push, o delete e o rename dele, cada um na sua modal) e as ações de um commit abrem num quadro flutuante sobre o grafo. O botão principal da modal roda no primeiro clique (a modal já é a confirmação, no lugar do `Confirm: …?`); `cancel`/`close` fecha sem rodar nada.
- Rodapé do Git Flow enxuto, só o botão sob uma linha: `⑂ Git Flow · feature/login · from develop · ↑2 ↓1 github` abre a modal **Git Flow**, com uma linha por tipo (`start` e, no tipo da branch atual, `rebase`/`merge` e `finish`). Diz também quando o git flow não está instalado ou configurado.
- Colunas opcionais: em Settings, **Columns** liga e desliga `author` e `hash` na lista; vale para todos os repositórios e fica salvo entre sessões.
- Branch que só existe no remote (já mergeada e apagada aqui) aparece com um ícone de fantasma num segmento à esquerda, como a tag.
- O fetch (☁) mostra uma modal no meio do painel enquanto roda (spinner e "Fetching remote(s)…", centralizados, sobre um botão **Dismiss**). Ao terminar, a modal fecha e o toast avisa; se falhar, a modal fica com o erro. No terminal docked; nas outras superfícies, só o toast.

### Alterado

- Sai o **Publish** do Git Flow (rodapé e menu da branch): **Push branch…** já publica a branch.
- Listas (menu de branch, ações do commit) sem o separador `┈`: os grupos ficam separados por uma linha em branco.
- Um clique (esquerdo) num badge abre o menu da branch, e outro clique fecha; o texto do commit abre os detalhes. O duplo clique no badge continua fazendo checkout (e fecha o menu que o primeiro clique abriu); o clique direito continua abrindo o menu.
- Badges por segmentos: o da branch em checkout tem um check antes do nome, no tom escuro da cor dele (no lugar da bolinha preta); o da tag tem o ícone de etiqueta num segmento na cor dele e a versão no tom escuro.
- A coluna do grafo tem a largura das linhas na tela, não a do trecho mais largo do histórico: onde há poucas branches, a Description começa logo depois do grafo.
- Mensagem padrão da tag no finish é só a versão (`0.1.4`), não `Hotfix 0.1.4`.

### Corrigido

- O rodapé não treme mais ao rolar no terminal docked: ali o painel rola as próprias linhas, com cabeçalho e rodapé fixos.
- Campos sem `::` duplicado (`Tag message`, `New name`, `Email`…).
- Switches com espaço entre o ícone Nerd Font e o texto.

## [1.6.1] - 2026-11-18

### Corrigido

- Os badges voltam a ser redondos (e os ícones Nerd Font a aparecer) depois de `/clear` ou `/resume`: a fonte é verificada de novo a cada `/gitgraph`.
- O remote de uma branch é um segmento colado ao badge, num tom escuro da cor dele e texto claro (` develop ` ` origin `), no lugar do `⇄ origin`. Sem espaço, o nome da branch encurta antes e o remote só sai por último: antes ele sumia em nomes longos (`feature/…`, `hotfix/…`) e o push parecia não atualizar a branch.
- O primeiro badge usa a coluna Description inteira antes de cortar o nome com `…`.
- Git Flow num repo sem `origin` (ex.: remote `github`): finish, publish e o push depois do finish usam o remote do repo.
- Menu de branch em lista, um item por linha e grupos separados por linha; o formulário (push, delete, rename) abre logo abaixo do item.
- Cabeçalho `Author`/`Commit` alinhado com as colunas (antes deslocado e com `Commit` cortado).
- Barra do Git Flow não quebra mais no meio: sem espaço, as ações da branch (finish, rebase, publish) descem juntas para a linha de baixo.
- As ações do commit (Checkout, Cherry-pick, Copy hash, Reset … here) saem do fim dos detalhes e ficam atrás de um ícone ⋯ na linha do assunto: ele abre a mesma lista do menu de branch.
- Listas (menu de branch, ações do commit) alinhadas à esquerda, com separador fino `┈` do tamanho do item mais longo.

## [1.6.0] - 2026-11-18

### Adicionado

- Changelog no painel: o ícone ☰ no header mostra o que mudou em cada versão, com a sua marcada.
- Git Flow com nomes próprios: **Set up git flow…** abre um formulário (branch principal, de desenvolvimento, prefixos de feature/bugfix/release/hotfix e prefixo de tag) já preenchido com o que o repo usa (`master`, `dev`, `feat/`, `fix/`…). **Use defaults** continua com os nomes padrão.
- Settings mostra os nomes do Git Flow configurado e **Reconfigure…** para trocá-los.

### Corrigido

- O menu de uma branch ou tag abre sem botão direito: os detalhes do commit têm, no topo, a linha **Branch actions:** com um botão por ref. Antes, a linha `Refs: ⋯` ficava no fim e saía vazia no VS Code.

## [1.5.1] - 2026-11-10

### Corrigido

- No seletor de repositórios, a branch de cada repo vai numa coluna à direita (`[develop]`, apagada), com o upstream quando há um no remote (`[origin/main]`). O `<repo> - <branch>` da 1.5.0 ficava confuso.

## [1.5.0] - 2026-11-10

### Adicionado

- O seletor de repositórios mostra a branch em que cada repo está.

## [1.4.0] - 2026-10-28

### Adicionado

- Reset soft do branch atual para um commit, nos detalhes do commit (confirmado). O commit deixado para trás continua no grafo enquanto um ref o mantém, para voltar.

### Corrigido

- Um clique simples no badge abre os detalhes na hora; um duplo clique faz checkout e desfaz a seleção do primeiro clique.
- As ações dos detalhes quebram em linhas em vez de sair cortadas.

## [1.3.1] - 2026-10-27

### Corrigido

- A barra do Git Flow cabe na largura do painel.
- Duplo clique num badge faz checkout sem abrir os detalhes.

## [1.3.0] - 2026-10-27

### Adicionado

- Vários repositórios: o painel acha repos até 3 níveis abaixo da pasta da sessão e um dropdown `repo:` no começo do header troca entre eles. Todo git roda no repo escolhido.
- Busca por hash atrás do ícone ⌕ no header.

## [1.2.0] - 2026-10-27

### Adicionado

- Botão `fetch --all` (nuvem) no header.

### Mudado

- Settings, fetch e refresh viram ícones, com área de clique maior.

## [1.1.2] - 2026-10-22

### Corrigido

- O painel não fica mais preto durante um push.

## [1.1.1] - 2026-10-22

### Mudado

- README com prints reais e um GIF de demonstração.

## [1.1.0] - 2026-10-22

### Adicionado

- Ações de Git Flow (git-flow-next) no rodapé do painel e no menu de branch: start, finish, update e publish de feature, bugfix, release e hotfix, com continue/abort em conflito.
- Delete branch com opção de forçar.
- Leitura da configuração do git flow AVH.

## [1.0.1] - 2026-10-22

### Adicionado

- README com imagens, ícone, licença MIT e manifesto de marketplace.

## [1.0.0] - 2026-10-22

### Adicionado

- Painel Git Graph (`/gitgraph`): grafo de commits com lanes, badges de branch/tag/remote, detalhes do commit com arquivos, auto-refresh e scroll virtualizado.
- Ações: checkout, criar branch, cherry-pick e copiar hash; menu de ref (botão direito ou duplo clique) com checkout, rename, push por remote, merge, rebase e delete.
- Configurações do repositório (usuário local/global, remotes), busca por hash e refresh com feedback.
