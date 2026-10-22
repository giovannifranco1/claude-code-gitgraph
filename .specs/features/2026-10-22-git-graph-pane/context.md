# Contexto — Git Graph pane

## Decisões do dev (discovery 2026-10-22)
| Tema | Decisão |
|---|---|
| Escopo MVP | Grafo + labels, detalhes do commit, auto-refresh, ações (checkout, criar branch, cherry-pick, copiar hash) |
| Branches | Todas (`--all`) por padrão, toggle no header para só a atual |
| Abertura | Só via `/gitgraph` |
| Versionamento | git + git-flow-next no repo do mod |

## Abordagens consideradas para desenhar o grafo
1. **Usar `git log --graph --color` e converter ANSI** — rápido, mas gera linhas de conector extras (`|\`), difícil de alinhar com colunas e de tornar clicável por commit.
2. **Calcular as lanes nós mesmos (escolhida)** — uma linha por commit, glifos `● │ ─ ╮ ╯ ┼`, cor estável por lane; puro e testável; é o que o Git Graph do VS Code faz.
3. **Raster/Image com pixels** — visual mais rico, mas só funciona em alguns terminais e não é clicável por linha.
