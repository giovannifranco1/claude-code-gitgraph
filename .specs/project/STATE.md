# STATE — gitgraph

## Decisões
- 2026-10-22: release 1.0.1: README com imagens, ícone, licença MIT, marketplace.json (pronto para submeter ao diretório: `claude plugin validate --strict` passa).
- 2026-10-22: release 1.1.0: ações de Git Flow (barra no rodapé, menu de branch), Delete branch com force, leitura de config AVH, hooks vazios para o git flow.
- 2026-10-22: release 1.1.1: README com prints reais e GIF de demonstração (no lugar das imagens SVG geradas).
- 2026-10-22: hotfix 1.1.2: painel preto durante push — spinner do rodapé com a mesma key do menu (o Pane recusa key de Client repetida). Lição: duas áreas que mostram `running` precisam de keys distintas; achado só com `claude --debug` (sessão sem hot-reload não mostra o erro).
- 2026-10-27: release 1.2.0: botão `fetch --all` (nuvem) no header; settings, fetch e refresh só com ícone, nessa ordem (refresh por último), com área de clique maior. Teste local de mudanças não publicadas: `claude --plugin-dir .` com a instalação do marketplace desativada.
- 2026-10-27: release 1.3.0: vários repositórios (MR-01..03): busca de repos até 3 níveis, dropdown `repo:` no começo do header, todo git com `cwd` do repo ativo; busca por hash atrás do ícone ⌕. Lição: o `Select` nativo no terminal saiu cortado, destoando e sem disparar a troca; dropdown próprio de Buttons (linhas de altura 1 no header) funciona e combina.
- 2026-10-27: barra do Git Flow sem o ícone ⎇ (pedido do dev) e com 1 coluna entre itens, para caber numa linha a partir de ~77 colunas; larguras medidas em células desenhadas (`buttonWidth`: `[ label ]` dos Buttons com moldura; `iconCells`: ícone Nerd Font = 2).
- 2026-10-27: badges de commits vizinhos continuam colados (decisão do dev): uma linha de grafo entre dois commits com badge foi testada e recusada (ritmo irregular nos merges).
- 2026-10-27: release 1.3.1: barra do Git Flow cabe na largura do painel (sem ícone ⎇, larguras em células desenhadas); duplo clique numa pílula faz checkout sem abrir os detalhes.
- 2026-10-27: reset soft (GG-19) nos detalhes do commit, só `--soft` (pedido do dev); voltar ao commit anterior funciona quando ele ainda tem ref (branch pushado): commits sem ref somem do grafo, como no Git Graph do VS Code. Ações dos detalhes e do menu quebram em linhas via `buttonRows`.
- 2026-10-28: clique simples na pílula volta a abrir os detalhes na hora (a espera de 450 ms para descartar duplo clique ficou lenta para o dev); o duplo clique faz checkout e devolve a seleção de antes do primeiro clique.
- 2026-10-28: release 1.4.0: reset soft do branch atual para um commit (GG-19) nos detalhes, ações dos detalhes quebrando em linhas; clique simples na pílula abre os detalhes na hora.
- 2026-11-10: seletor de repos mostra a branch de cada repo como `<repo> - <branch>` (MR-04), lida ao abrir o seletor; átomo `repos` passou a ter shape (`repos-2`). Release 1.5.0.
- 2026-11-10: release 1.5.1: no seletor de repos, a branch vai numa coluna à direita (`[develop]`, apagada), com o upstream quando há um no remote (`[origin/main]`); o `<repo> - <branch>` da 1.5.0 ficava confuso.
- 2026-11-18: release 1.6.0: menu de ref pelos botões `Branch actions:` no topo dos detalhes (RM-01; a linha `Refs: ⋯` saía vazia no VS Code: filho em array no Button); init/reconfigure do git flow com nomes próprios (FI-01..02: `git flow init -d [-f] --main … --tag …`; antes do `-f` remove `gitflow.branch.<base antiga>`, que o init -f mantém); tela ☰ Changelog (CL-01..02). `CHANGELOG.md` em PT-BR por decisão do dev (exceção à regra de texto de interface em inglês: o chrome da tela segue em inglês). View passou a ter `screen: 'graph' | 'settings' | 'changelog'` no lugar de `isSettings` (shape `view-8`).
- 2026-10-22: release 1.0.0 (tag `1.0.0`), repositório `giovannifranco1/claude-code-gitgraph`.
- 2026-10-22: painel abre só via `/gitgraph` (não disputa espaço com /filetree e /flow).
- 2026-10-22: grafo mostra todas as branches (`--all`) por padrão, com toggle para só a atual.
- 2026-10-22: gitflow clássico (git-flow-next) no repositório do mod.
- 2026-10-22: ações de Git Flow (GF-01..GF-08) no rodapé fixo do painel + menu de branch, via CLI do git-flow-next (sem AVH); finish com `--no-ff`, push, `--keep` e mensagem de tag ligados por padrão.
- 2026-10-22: todo git do mod roda com `GIT_EDITOR=true`, `GIT_MERGE_AUTOEDIT=no` e `GIT_TERMINAL_PROMPT=0` (nunca editor nem prompt); o timeout longo é só para comandos de rede.
- 2026-11-18: hotfix 1.6.1: Nerd Font verificada a cada `/gitgraph`; remote como segmento da pílula num tom escuro da cor dela (`shade`) (no lugar do `⇄`), nome cortado antes do remote, primeira pílula pode usar a coluna Description inteira; ações do commit atrás de um ícone ⋯ nos detalhes (View `isActionsOpen`, atom `view-9`); listas alinhadas à esquerda com separador `┈`; Git Flow usa `preferredRemote` (origin, senão o primeiro) e recebe `-c gitflow.origin=`; menu de ref em lista com grupos (`menuGroups`); cabeçalho com a largura da linha; barra do Git Flow quebra por grupo (`wrapGroups`).

## Blockers
- (resolvido) Hot-reload de mods foi ativado depois na sessão de criação.

## Lições
- 2026-11-18: os caps Nerd Font (`\ue0b6`/`\ue0b4`, área de uso privado) somem quando o arquivo é reescrito a partir de texto copiado do terminal: editar em volta das constantes `CAP_*`, nunca reescrevê-las, e conferir com `xxd`.
- 2026-11-18: `session.start` dispara uma vez por processo e **não** depois de `/clear`/`/resume`; o `$.state` daquela sessão volta ao inicial. Tudo que o render precisa e é detectado no start (Nerd Font) tem de ser refeito ao abrir o painel.
- 2026-11-18: a engine só aceita passar `$` a funções declaradas no topo do arquivo (não a uma `const` dentro do `register`): o módulo nem carrega e todos os testes do pane quebram.
- 2026-11-18: `metaOf(ctx, '', '')` media o cabeçalho com hash de 0 caracteres (`short('')`): 7 colunas a mais, mais o `EDGE_SAFETY`. Medir o cabeçalho com os mesmos rótulos que ele desenha.
- 2026-11-18: o `find` do kit de testes não junta filhos de um `Text` (`{a}{b}`): texto que o teste lê inteiro vai como uma string só.
- 2026-11-18: a cada release, acrescentar a entrada da versão no `CHANGELOG.md` (a tela ☰ lê o arquivo da pasta do mod e marca a versão do plugin.json).
- 2026-11-10: coluna à direita no seletor de repos: quatro tentativas com o `[branch]` num elemento irmão do Button na linha (`Box` com flex ou `Text`) não desenharam a branch (ou sumiram com o nome) no terminal; o texto **dentro** do Button (filho `Text dimColor`, como na doc do `ButtonProps`) é desenhado. O kit de testes não roda o layout, então não pegou nenhuma. Alinhamento à direita: espaços calculados a partir de `ctx.cols` (`branchColumn`), dentro do próprio Button.
- 2026-10-27: a barra do rodapé estourava a borda direita porque media os Buttons com moldura só pelo label: no terminal eles são `[ label ]` (+4 células). Toda largura de item deve contar o que é desenhado.
- 2026-10-27: no terminal o fundo de um badge ocupa a célula inteira: badges em linhas vizinhas sempre se tocam; não existe meia linha de espaço.
- 2026-10-22: a engine recusa carregar o módulo se `$` for colocado num objeto (bound/spread/destructuring de um ctx): passe `$` como parâmetro e chame `$.noun.event(...)` direto.
- 2026-10-22: em `git -C ... commit` encadeado com `;` após `tsc`, o commit sai mesmo com erro de tipo — encadear gates com `&&`.
- 2026-10-22: o kit de testes não exporta `On`; usar `Parameters<TestBody>[1]`.
- 2026-10-22: `git show --numstat` em merge não lista arquivos sem `--diff-merges=first-parent`.

- 2026-10-22: no vscode a tabela de elementos tem um `Client` stub (desenha Box vazia): detectar Client pela superfície (terminal/desktop).
- 2026-10-22: no vscode o `Button` descarta filhos aninhados (arrays/strings): manter só o texto clicável dentro do Button.
- 2026-10-22: linha flex que passa da largura espreme tudo: `flexShrink={0}` no que não pode encolher + orçamento de largura.
- 2026-10-22: cada passo de scroll re-renderiza o Pane (300 commits ≈ 2.400 elementos): virtualizar com alturas explícitas.
- 2026-10-22: no kit de testes, `ui.scroll` é evento (mock responde `{}`), e `$.ui.scroll` por `key` não tem implementação.
- 2026-10-22: a API do Pane não tem rodapé fixo: no terminal docked o rodapé é uma Box `position="absolute"` em `offset + bodyRows - altura`, sobre uma camada de espaços (não há cor de fundo do tema), com `minHeight = bodyRows` na raiz; nas outras superfícies fica abaixo do header.
- 2026-10-22: o kit de testes não deixa registrar hooks (`setup`) duas vezes no mesmo teste: um teste por caso.
- 2026-10-22: o engine roda o git dos mods com os hooks do repo desligados (`core.hooksPath=/dev/null`); o git-flow-next falha com isso (`stat /dev/null/pre-flow-feature-start: not a directory`). Decisão do dev: comandos `git flow` recebem `-c core.hooksPath=<mod>/nohooks`, pasta vazia do mod — nenhum hook roda e o git-flow-next não quebra. Testado com git-flow-next real sob o ambiente do engine. O fake de git dos testes não pega isso.
- 2026-10-22: `$.state` sobrevive a reload/atualização do mod: ao adicionar campo a um valor guardado (View ganhou `flow`), dar `{ shape }` novo ao atom (e `Shaped<T>` no contrato), senão o render quebra com o valor antigo (painel preto). O kit de testes não simula valor antigo no estado.
- 2026-10-27: o Ghostty (e fontes Nerd não-Mono) desenha um ícone Nerd Font com 2 células quando a célula seguinte é espaço: num Button só de ícone com padding, o glifo fica deslocado para a direita no hover. Label com Nerd Font é ` ícone  ` (dois espaços depois), via `iconLabel`; o fallback plain fica ` ícone `. O `Button` não tem padding: a área de clique é a largura do label.

## Deferred ideas
- /simplify 2026-10-27 (pulado): `cellWidth` genérico por code point no lugar de `.length` nos itens da barra.
- /simplify 2026-10-22 (pulado, registrado): trocar os booleanos de formulário da View por uma união discriminada; detectar duplo clique dentro do pill.tsx; `loadSettings` com `--show-scope --get-regexp`; `framed` somando alturas de `{node, height}`; dividir `renderSettings`.
- /simplify 2026-10-22 (git flow, pulado): Continue/Abort também para merge/rebase do menu (detectar pelo status); memoizar o rodapé entre passos de scroll; `run` genérico no `MenuItem`.
- /simplify 2026-11-18 (pulado): nomes de remote via `git config --get-regexp` em vez do `git remote` extra no `loadFlow`; checar a fonte só quando o estado foi perdido; `openForm` único para push/delete/rename; campo `group` no `MenuItem` em vez de `GROUP_OF` por id.
- Bloco escuro entre pílulas vizinhas no modo quadrado (print de 2026-11-18): não reproduzido; reavaliar.
- Ver ROADMAP M2.

## Preferences
