# Design — Git Graph pane

## Componentes

| Módulo | Tipo | Responsabilidade | Requisitos |
|---|---|---|---|
| `hooks/log.ts` | puro | `LOG_FORMAT`, `parseLog(stdout)` → `Commit[]`, `parseRefs(%D)`, `parseDetail(stdout)` → `CommitDetail`, `withUncommitted(commits, head, n)` | GG-04, GG-07, GG-08 |
| `hooks/lanes.ts` | puro | `layout(commits)` → `Cell[][]` (uma linha por commit) | GG-03 |
| `hooks/detect.ts` | puro | `mutatesRepo(command)`, `isBranchNameCandidate(name)` | GG-09, GG-10 |
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
1. `col` = primeira coluna esperando `c`; senão a primeira livre (`null`); senão nova coluna no fim (cor nova).
2. Outras colunas esperando `c` **terminam** aqui: glifo `╯`, horizontais `─` entre elas e `col` (cor da que termina), coluna fica `null`.
3. `lanes[col]` = 1º pai (ou `null` se raiz).
4. Cada pai extra `p`: se alguma coluna já espera `p`, liga nela (`╮`); senão aloca a primeira livre à direita de `col` (ou nova) com cor nova, glifo `╮`. Horizontais `─` entre `col` e ela.
5. Demais colunas ativas: `│`; atravessadas por horizontal: `┼`. `col`: `●` (ou `○` para o pseudo-commit de mudanças não commitadas).
6. Remove `null`s no fim.
Célula = `{ ch, color }`; cada coluna ocupa 2 caracteres (glifo + `─`/espaço).

## Git (sempre argv, nunca shell)
- raiz: `git rev-parse --show-toplevel` (falha → `no-repo`)
- log: `git log <--all|HEAD> --date-order -n <limit+1> --format=%H%x1f%P%x1f%D%x1f%an%x1f%at%x1f%s%x1e`
- HEAD/branch: `git rev-parse HEAD`, `git branch --show-current`
- sujeira: `git status --porcelain` (linhas)
- detalhe: `git show --numstat --format=%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e <hash>`
- assinatura (poll 5s com painel aberto): `git for-each-ref --format=%(objectname) %(refname)` + HEAD + status
- ações: `git checkout <branch>` | `git checkout --detach <hash>`; `git cherry-pick <hash>`; criar branch: `isBranchNameCandidate` (não vazio, sem `-` inicial, sem espaço) → `git check-ref-format --branch <nome>` (exit 0) → `git branch <nome> <hash>`. O nome é sempre um elemento do argv.
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
- `tool.call {tool:'Bash'}`: após `next`, se `mutatesRepo(command)` e painel aberto → recarrega.
