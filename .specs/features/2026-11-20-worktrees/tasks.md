# Worktrees — Tasks da fase WT

Spec: `spec.md` (WT-01..WT-04 + o padrão de pasta). Design: `design.md`. Execução com TDD (teste falhando antes do código). Branch `feature/graph-worktrees`.

Decisões tomadas pelo agente nas perguntas sem resposta (o dev disse "pode desenvolver"): o **Worktree folder** nas Settings entra nesta fase; a dica do `/nano-worktree init` fica para a WE.

Ícone (conferido na cmap da Hack Nerd Font instalada): `custom-folder_git_branch` `U+E5FB`; sem Nerd Font, `⧉`.

## T1 — Módulo puro `hooks/worktree.ts`
- **What:** `WORKTREE_ARGS`, `parseWorktrees`, `branchWorktrees`, `slugOf`, `isValidSlug`, `worktreeDir`, `worktreePath`, `resolvePath`, `isInside`, `pathWarning`, `addArgs`, `removeArgs`, `relativeTo`, `openPrompt`.
- **Where:** `hooks/worktree.ts`, `tests/worktree.test.ts`, tipo `Worktree` em `types/index.d.ts`.
- **Done when:** os testes de cada função passam (porcelain com principal, branch, detached, locked, prunable; slug; caminho dentro/fora; precedência da pasta: config local > `.claude/worktrees`).

## T2 — Load e indicador no badge (WT-01)
- **What:** `git worktree list --porcelain` no batch do load; `Graph.worktrees`; a branch aberta noutra worktree ganha o ícone no badge; o menu dela mostra **Show worktree**.
- **Where:** `hooks/register.tsx` (load), `hooks/badges.ts` (Badge.worktree, `lead`), `hooks/menu.ts`.
- **Depends:** T1. **Done when:** teste do batch de 6 processos; badge com o ícone; menu com Show worktree em vez de New worktree.

## T3 — Tela Worktrees (WT-01, WT-04)
- **What:** ícone no header abre a tela; uma linha por worktree (caminho relativo, branch ou detached, mudados, main/locked/prunable); clicar abre **Open in Claude**, **Copy path**, **Remove…** (a principal sem Remove); mudados por worktree só ao abrir a tela, em paralelo.
- **Depends:** T1, T2. **Done when:** testes de pane: lista, ações, prompt do Open in Claude, cópia do caminho.

## T4 — Remover (WT-03)
- **What:** **Remove…** confirma; com mudanças avisa e exige o switch **force**; `git worktree remove [--force]`; a branch fica.
- **Depends:** T3. **Done when:** testes de pane: sem mudanças roda no segundo clique; com mudanças só com force.

## T5 — Criar (WT-02)
- **What:** **New worktree…** no menu da branch local; **New worktree here…** nas ações do commit (branch nova); form com slug, path (acompanha o slug até ser editado) e, no commit, a branch nova; validações; alerta fora da pasta principal + **Create anyway** (segundo clique); caminho existente bloqueia; `.git/info/exclude` quando o caminho está dentro do repo e não ignorado; `git worktree add`.
- **Depends:** T1, T2. **Done when:** testes de pane dos dois pontos de entrada, do alerta, do exclude e dos args.

## T6 — Pasta padrão nas Settings
- **What:** campo **Worktree folder** nas Settings, salvo em `git config --local gitgraph.worktreeDir`; o form de criar usa essa pasta.
- **Depends:** T1, T5. **Done when:** teste de pane: salvar a pasta e o form usá-la.

## T7 — Docs
- CHANGELOG `[Unreleased]`, README (Features), spec com os critérios da WT marcados.
