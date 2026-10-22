# gitgraph

A **Git Graph** pane for Claude Code, inspired by the Git Graph extension for VS Code: the repository's commit graph beside the chat, like `/filetree` and `/flow`.

```
 ⎇ main   42 commits  ● 1 change        ● all branches   ↻ refresh   ⚙ settings
 ⌕ find commit by hash
Graph   Description                                         Author        Commit
──────────────────────────────────────────────────────────────────────────────────
○       Uncommitted changes (1)
●       ( ● main ⇄ origin ) main 3                          Ana           a2ccf04
│ ●     ( wip ) wip 1                                       Ana           e764364
●─┤     ( ◆ v1.0 ) Merge hotfix                             Ana           fbd68c6
●─┼─╮   Merge feat                                          Ana           289f450
```

## Use

`/gitgraph` opens the pane.

- **Graph:** one row per commit, a colored lane per line of history, merges `─╮`, forks `─╯`.
- **Ref pills** in the lane's color, rounded with a Nerd Font (`badges` option: `auto`, `round`, `square`); a local branch and its remotes share one pill (`main ⇄ origin`); pills that do not fit are shortened, then counted as `+N`.
- **Right-click a pill** for its menu: checkout, rename, push branch (pick remotes, or all), merge into current, rebase current onto it, delete, fetch, copy name. **Double-click** checks it out.
- **Click a commit** for its author, date, message and changed files with a diffstat bar; copy its hash, check it out, cherry-pick it, or create a branch there.
- **Find** a commit by hash (4 to 40 hex digits).
- **Settings:** user name and email for this repository or global; add, edit, fetch and remove remotes.
- **Refresh** reloads everything on screen and flashes `✓ updated`. The pane also reloads after any Bash call that changed the repository and every 5 s while open, checking refs and status first.
- Git actions show a spinner and run one at a time; destructive ones ask for a second press. Push and fetch never wait on a password prompt.

## Develop

```
claude plugin validate .
claude plugin test .
tsc -p .
```

Pure logic lives in `hooks/log.ts` (git output parsing), `hooks/lanes.ts` (graph layout), `hooks/badges.ts`, `hooks/menu.ts`, `hooks/settings.ts`, `hooks/virtual.ts`, `hooks/format.ts` and `hooks/detect.ts`. `hooks/register.tsx` wires commands, state and rendering; `hooks/pill.tsx` and `hooks/spinner.tsx` are `Client` modules drawn on the terminal side. Specs are in `.specs/`.
