# STATE — gitgraph

## Decisões
- 2026-10-22: release 1.0.1: README com imagens, ícone, licença MIT, marketplace.json (pronto para submeter ao diretório: `claude plugin validate --strict` passa).
- 2026-10-22: release 1.1.0: ações de Git Flow (barra no rodapé, menu de branch), Delete branch com force, leitura de config AVH, hooks vazios para o git flow.
- 2026-10-22: release 1.0.0 (tag `1.0.0`), repositório `giovannifranco1/claude-code-gitgraph`.
- 2026-10-22: painel abre só via `/gitgraph` (não disputa espaço com /filetree e /flow).
- 2026-10-22: grafo mostra todas as branches (`--all`) por padrão, com toggle para só a atual.
- 2026-10-22: gitflow clássico (git-flow-next) no repositório do mod.
- 2026-10-22: ações de Git Flow (GF-01..GF-08) no rodapé fixo do painel + menu de branch, via CLI do git-flow-next (sem AVH); finish com `--no-ff`, push, `--keep` e mensagem de tag ligados por padrão.
- 2026-10-22: todo git do mod roda com `GIT_EDITOR=true`, `GIT_MERGE_AUTOEDIT=no` e `GIT_TERMINAL_PROMPT=0` (nunca editor nem prompt); o timeout longo é só para comandos de rede.

## Blockers
- (resolvido) Hot-reload de mods foi ativado depois na sessão de criação.

## Lições
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

## Deferred ideas
- /simplify 2026-10-22 (pulado, registrado): trocar os booleanos de formulário da View por uma união discriminada; detectar duplo clique dentro do pill.tsx; `loadSettings` com `--show-scope --get-regexp`; `framed` somando alturas de `{node, height}`; dividir `renderSettings`.
- /simplify 2026-10-22 (git flow, pulado): Continue/Abort também para merge/rebase do menu (detectar pelo status); memoizar o rodapé entre passos de scroll; `run` genérico no `MenuItem`.
- Ver ROADMAP M2.

## Preferences
