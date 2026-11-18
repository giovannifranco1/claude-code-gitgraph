# Changelog

Mudanças do Git Graph (`gitgraph`) por versão, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e com versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Ações em modal: no terminal docked, iniciar, finalizar, fazer rebase/merge e publicar com o Git Flow, o menu de uma branch e as ações de um commit abrem num quadro flutuante sobre o grafo. O botão principal da modal roda no primeiro clique (a modal já é a confirmação, no lugar do `Confirm: …?`); `cancel`/`close` fecha sem rodar nada.
- Rodapé do Git Flow enxuto, só o botão sob uma linha: `⑂ Git Flow · feature/login · from develop · ↑2 ↓1 github` abre a modal **Git Flow**, com uma linha por tipo (`start` e, no tipo da branch atual, `rebase`/`merge` e `finish`). Diz também quando o git flow não está instalado ou configurado. Publish fica no menu da branch.
- Ações do commit (Checkout, Cherry-pick, Copy hash, Reset … here) atrás do ícone ⋯ na linha do assunto, nos detalhes.
- Colunas opcionais: em Settings, **Columns** liga e desliga `author` e `hash` na lista; vale para todos os repositórios e fica salvo entre sessões.
- Branch que só existe no remote (já mergeada e apagada aqui) aparece com um ícone de fantasma num segmento à esquerda, como a tag.

### Alterado

- Pílulas por segmentos: a branch em checkout tem um check antes do nome, no tom escuro da cor dela (no lugar da bolinha preta); a tag tem o ícone de etiqueta num segmento na cor dela e a versão no tom escuro.
- A coluna do grafo tem a largura das linhas na tela, não a do trecho mais largo do histórico: onde há poucas branches, a Description começa logo depois do grafo.
- Mensagem padrão da tag no finish é só a versão (`0.1.4`), não `Hotfix 0.1.4`.

### Corrigido

- O rodapé não treme mais ao rolar no terminal docked: ali o painel rola as próprias linhas, com cabeçalho e rodapé fixos.
- Campos sem `::` duplicado (`Tag message`, `New name`, `Email`…).
- Switches com espaço entre o ícone Nerd Font e o texto.

## [1.6.1] - 2026-11-18

### Corrigido

- As pílulas voltam a ser redondas (e os ícones Nerd Font a aparecer) depois de `/clear` ou `/resume`: a fonte é verificada de novo a cada `/gitgraph`.
- O remote de uma branch é um segmento colado à pílula, num tom escuro da cor dela e texto claro (` develop ` ` origin `), no lugar do `⇄ origin`. Sem espaço, o nome da branch encurta antes e o remote só sai por último: antes ele sumia em nomes longos (`feature/…`, `hotfix/…`) e o push parecia não atualizar a branch.
- A primeira pílula usa a coluna Description inteira antes de cortar o nome com `…`.
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

- Um clique simples na pílula abre os detalhes na hora; um duplo clique faz checkout e desfaz a seleção do primeiro clique.
- As ações dos detalhes quebram em linhas em vez de sair cortadas.

## [1.3.1] - 2026-10-27

### Corrigido

- A barra do Git Flow cabe na largura do painel.
- Duplo clique numa pílula faz checkout sem abrir os detalhes.

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

- Painel Git Graph (`/gitgraph`): grafo de commits com lanes, pílulas de branch/tag/remote, detalhes do commit com arquivos, auto-refresh e scroll virtualizado.
- Ações: checkout, criar branch, cherry-pick e copiar hash; menu de ref (botão direito ou duplo clique) com checkout, rename, push por remote, merge, rebase e delete.
- Configurações do repositório (usuário local/global, remotes), busca por hash e refresh com feedback.
