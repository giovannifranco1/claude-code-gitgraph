# gitgraph

A **Git Graph** pane for Claude Code, inspired by the Git Graph extension for VS Code: the repository's commit graph beside the chat, like `/filetree` and `/flow`.

```
⎇ main  42 commits  todas as branches  ↻
○          Uncommitted changes (1)
●          a2ccf04 [HEAD → main] main 3                       Ana · 5m
│ ●        e764364 [wip] wip 1                                Ana · 1h
●─┤        fbd68c6 [tag: v1.0] Merge hotfix                   Ana · 2d
●─┼─╮      289f450 Merge feat                                 Ana · 2d
│ ● │      f62632b [hotfix] hotfix 1                          Bia · 3d
```

## Use

`/gitgraph` opens the pane (running it again reloads it).

- **Graph:** one row per commit, a colored lane per line of history, merges `─╮`, forks `─╯`.
- **Refs:** `HEAD → branch`, local branches, remotes (dim), tags.
- **Details:** press a commit to see its author, date, full message and changed files (`+adds -dels`).
- **Actions:** copy hash (`c`), checkout and cherry-pick (press twice to confirm), create a branch at the commit.
- **Header:** `a` toggles all branches / HEAD only, `r` reloads. "Carregar mais" loads 300 more commits.
- **Auto-refresh:** after each Bash call Claude makes and every 5 s while open, the pane checks the repository's refs and status and reloads only when they changed.

## Develop

```
claude plugin validate .
claude plugin test .
tsc -p .
```

Pure logic lives in `hooks/log.ts` (git output parsing), `hooks/lanes.ts` (graph layout), `hooks/format.ts` and `hooks/detect.ts`; `hooks/register.tsx` wires commands, state and rendering. Specs are in `.specs/`.
