# Design — Git Graph pane

## Componentes

| Módulo | Tipo | Responsabilidade | Requisitos |
|---|---|---|---|
| `hooks/log.ts` | puro | `LOG_FORMAT`, `parseLog(stdout)` → `Commit[]`, `parseRefs(%D)`, `parseDetail(stdout)` → `CommitDetail`, `parseStatus(v2)`, `remotesOf(for-each-ref)`, `withUncommitted(commits, head, n)` | GG-04, GG-07, GG-08 |
| `hooks/lanes.ts` | puro | `layout(commits)` → `Cell[][]` (uma linha por commit) | GG-03 |
| `hooks/detect.ts` | puro | `isBranchNameCandidate(name)` | GG-10 |
| `hooks/format.ts` | puro | `relTime(now, t)`, `absTime(t)`, `fitGraph(cells, max)`, `truncate(s, n)` | GG-03, GG-04 |
| `hooks/register.tsx` | wiring | comando, git via `$.process.run`, estado, render do `Pane`, auto-refresh, ações | todos |
| `types/index.d.ts` | contrato | tipos + `PluginState['gitgraph']` | — |

## Estado (`$.state`, plugin `gitgraph`)
- `graph: Graph` — `{ status: 'idle'|'loading'|'ready'|'no-repo'|'error', rows: GraphRow[], head, branch, dirty, hasMore, error? }`
- `view: View` — `{ scope: 'all'|'head', limit, selected: string|null, confirm: string|null, isOpen }`
- `detail: CommitDetail|null` — detalhes do `selected`

Render só lê; escrita nos handlers (`onPress`, `onSubmit`) e eventos.

## Algoritmo de lanes (GG-03)
`lanes: (string|null)[]` = hash que cada coluna espera; `colors: number[]` = cor da coluna.
Para cada commit `c`:
1. `col` = primeira coluna esperando `c`; senão a primeira livre; senão nova coluna (cor nova).
2. Outras colunas esperando `c` terminam aqui (ficam `null`) e entram em `links`.
3. `lanes[col]` = 1º pai (ou `null` se raiz). Cada pai extra: coluna que já o espera, ou a primeira livre à direita de `col` (cor nova); entra em `links`.
4. Cada célula de lane guarda direções: **cima** (ativa antes da linha), **baixo** (ativa depois), **esq/dir** (dentro do vão horizontal entre `col` e cada link). O glifo vem de uma tabela de 16 entradas (`│ ─ ╯ ╰ ╮ ╭ ┤ ├ ┴ ┬ ┼`). `col` desenha `●` (ou `○` para mudanças não commitadas).
Assim cruzamentos e coluna reaproveitada na mesma linha (`┤`) saem sem caso especial.

## Git (sempre argv, nunca shell)
- load (1 lote paralelo, 3 processos): `git log <--all|HEAD> --date-order -n <limit+1> --format=…`, `git status --porcelain=v2 --branch` (HEAD, branch, sujeira; exit ≠ 0 → `no-repo`), `git for-each-ref --format=%(objectname) %(refname)` (remotes + assinatura)
- detalhe: `git show --numstat --diff-merges=first-parent --format=… <hash>`
- assinatura = status v2 + for-each-ref. `poll` (a cada 5s com painel aberto **e** após cada Bash) compara e só recarrega se mudou. Flag `busy` evita poll e load simultâneos.
- ações: `git checkout <branch>` | `git checkout --detach <hash>`; `git cherry-pick <hash>`; criar branch: `isBranchNameCandidate` → `git check-ref-format --branch <nome>` → `git branch <nome> <hash>`. O nome é sempre um elemento do argv.
- Concorrência: contador de geração; só o load mais recente grava no estado.

## Render (Pane `gitgraph`)
- Header: `⎇ <branch>`, contagem, botões `[todas|HEAD]` (hotkey `a`) e `[↻]` (hotkey `r`).
- Linha: `Button plain key=<hash>` com filhos `Text`: grafo colorido, hash (dim), badges, assunto, autor/data (dim, se couber). Largura do grafo ≤ 1/3 de `bodyColumns`.
- Detalhe (abaixo do selecionado): hash, autor <email>, data, corpo, arquivos (máx. 50) e ações: `Copiar hash`, `Checkout <x>` (2 cliques), `Cherry-pick` (2 cliques, oculto no HEAD), `Input` "nova branch".
- Rodapé: `Carregar mais` se `hasMore`.
- Paleta de lanes: `#4fc1ff #c586c0 #ce9178 #4ec9b0 #dcdcaa #f48771 #b5cea8 #d7ba7d`.

## Eventos
- `session.start`: registra `/gitgraph`, inicia `$.clock.every(5000)`.
- `command.run {command:'gitgraph'}`: `view.isOpen=true`, `$.ui.open`, recarrega.
- `ui.close {id}`: `view.isOpen=false`.
- `tool.call {tool:'Bash'}`: após `next`, roda `poll` (recarrega só se a assinatura mudou).
