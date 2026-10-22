# STATE — gitgraph

## Decisões
- 2026-10-22: release 1.0.1: README com imagens, ícone, licença MIT, marketplace.json (pronto para submeter ao diretório: `claude plugin validate --strict` passa).
- 2026-10-22: release 1.0.0 (tag `1.0.0`), repositório `giovannifranco1/claude-code-gitgraph`.
- 2026-10-22: painel abre só via `/gitgraph` (não disputa espaço com /filetree e /flow).
- 2026-10-22: grafo mostra todas as branches (`--all`) por padrão, com toggle para só a atual.
- 2026-10-22: gitflow clássico (git-flow-next) no repositório do mod.

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

## Deferred ideas
- /simplify 2026-10-22 (pulado, registrado): trocar os booleanos de formulário da View por uma união discriminada; detectar duplo clique dentro do pill.tsx; `loadSettings` com `--show-scope --get-regexp`; `framed` somando alturas de `{node, height}`; dividir `renderSettings`.
- Ver ROADMAP M2.

## Preferences
