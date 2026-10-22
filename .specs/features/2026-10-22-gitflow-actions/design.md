# Design — Ações de Git Flow

## Componentes

### `hooks/flow.ts` (lógica pura, sem `$`)
- `flowCliOf(versionStdout, exitCode)` → `'next' | 'other' | 'none'`.
- `parseFlowConfig(stdout)` → `FlowConfig | null` a partir de `git config --get-regexp ^gitflow\.`: tipos `feature|bugfix|release|hotfix` presentes (prefixo, parent, startpoint, tag, downstreamstrategy), bases (parent, autoupdate) e o remote (`gitflow.origin`, senão `origin`). `null` sem `gitflow.branch.*`.
- `topicOf(branch, config)` → `{ type, name }` quando a branch casa com um prefixo.
- `nextVersion(tags, kind)` → próxima semver (release minor+1, hotfix patch+1), mantendo o `v` da maior tag.
- Argv: `startArgs`, `finishArgs(topic, opts, tagMessage)`, `updateArgs`, `publishArgs`, `finishPushArgs(topic, config, remote)` (`push --follow-tags <remote> <parent> <bases com autoupdate filhas do parent>`), `continueArgs`/`abortArgs(conflict)`.
- `defaultTagMessage(topic)` → `Release 1.2.0`; `updateLabel(type)` → `Rebase on develop` | `Merge develop in`.
- `hasConflicts(statusStdout)` → linhas `u ` do porcelain v2.

### Estado (`types/index.d.ts`)
- Novo atom `flow: FlowInfo | null` — `{ cli, config, tags }`, carregado ao abrir a gaveta, no refresh e após ações de flow (não entra no batch de `load`: a config quase nunca muda e o poll continua com 2 processos).
- `View.flow: FlowView` — `isOpen`, `starting` (tipo com o campo aberto), `finishing` (tópico em confirmação), `opts` (`noFf`, `push`, `keep`, da sessão), `tagMessage`, `conflict`.

### `register.tsx` (wiring)
- `git()` ganha `env` extra; ações de flow rodam no modo rede + `GIT_EDITOR=true`, `GIT_MERGE_AUTOEDIT=no`.
- `runSteps` (sequencial, para na 1ª falha) para finish+push; a trava/spinner de `runActions` é extraída para `withRunning` e compartilhada.
- Falha de finish/update com conflito no status → `view.flow.conflict`.
- `renderFlow` → `{ node, height }`: régua, gaveta (se aberta) e a barra. Terminal: Box `position="absolute"` em `top = offset + bodyRows - height`, raiz com `minHeight = bodyRows` e um espaçador do mesmo `height` no fim da lista. Outras superfícies: no fluxo, abaixo do header.
- Menu de branch: itens de flow no topo para branches de trabalho (`Finish` abre a confirmação na gaveta).
