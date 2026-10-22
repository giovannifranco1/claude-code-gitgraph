# PROJECT — gitgraph

## Visão
Trazer para o Claude Code a experiência da extensão **Git Graph** do VS Code: um painel lateral, ao lado do chat (como `/flow` e `/filetree`), com o grafo de commits do repositório da sessão — lanes coloridas, branches/tags, detalhes do commit e ações rápidas.

## Goals
1. Ver o histórico do repo como grafo sem sair do Claude Code.
2. Acompanhar em tempo real o que o Claude faz no git (commit, merge, checkout…).
3. Ações comuns (checkout, criar branch, cherry-pick, copiar hash) a um clique.

## Stack
Mod de function hooks do Claude Code 2.1.308 (TypeScript/TSX). Git via `$.process.run`.

## Scope
- **Dentro:** painel `/gitgraph`, grafo, detalhes, auto-refresh, ações básicas.
- **Fora (por ora):** diff inline de arquivos, rebase interativo, push/pull, stash UI, múltiplos repos.
