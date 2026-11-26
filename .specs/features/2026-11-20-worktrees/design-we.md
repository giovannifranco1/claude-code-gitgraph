# Worktrees — Design da fase WE (contrato `gitgraph.json`)

Escopo: **WE-01, WE-02** do `spec.md`. O contrato é o que o nano-worktree escreve (`~/www/nano-worktree/.specs/features/2026-11-20-nano-worktree-plugin/plan.md`, decisões 1 e 2):

```json
{ "worktrees": { "version": 1, "dir": ".claude/worktrees",
  "new": "./worktree.sh new {slug} {branch} {base}", "remove": "./worktree.sh remove {slug}",
  "up": "./worktree.sh up {slug}", "down": "./worktree.sh down {slug}",
  "logs": "./worktree.sh logs {slug}", "check": "./worktree.sh check {slug}",
  "status": "./worktree.sh status {slug}", "links": ["https://{slug}.<host>"] } }
```

Saídas: `status` → 1ª linha `up` | `down` | `unknown`, exit 0; `check` → uma linha por item `✓` / `✗` / `–`, exit 0 sem `✗`, 1 com algum; os demais exit 0 ok, 1 falha, 2 uso inválido.

## 1. Ler o contrato

- No `load`, depois do `git worktree list`, o painel lê `<principal>/gitgraph.json` com `$.fs.read` (um arquivo, sem processo; sem arquivo = sem contrato, modo básico).
- `parseContract(text)` (puro) devolve `{ contract, problem }`:
  - sem a seção `worktrees`: nada (o arquivo pode ter outras seções);
  - JSON quebrado, campo de tipo errado, comando sem `{slug}`: `problem`, contrato desligado;
  - `version` maior que 1: `problem` dizendo para atualizar o gitgraph, contrato desligado.
- O `problem` aparece na tela Worktrees, em amarelo, abaixo do header. O básico (WT) segue igual.

## 2. Rodar um comando

- O comando é um template; `commandArgv(template, vars)` (puro) parte por espaço, troca `{slug}`, `{path}`, `{branch}`, `{base}` em cada pedaço e **descarta pedaços que ficaram vazios** (o `{branch} {base}` opcional do `new`). Roda por `$.process.run` **sem shell** (argv), no diretório da principal, timeout de 10 min. Sem shell, um nome de branch não injeta nada.
- O slug de uma worktree é o nome da pasta dela quando ela está no `dir` do contrato (`envSlug`). Fora do `dir` (criada à mão noutro lugar), ela não tem ações de ambiente.
- Falha: o spinner sai e a notice/toast mostra a 1ª linha do stderr (ou stdout), sem cores ANSI, como as ações do git.

## 3. Na tela Worktrees

```
⧉ Worktrees                                              ← graph
＋ New worktree   also from a branch's menu or a commit's actions

  .claude/worktrees/login      feature/login  3 changed   ● up
      ↗ login.app.test   Up   Down   Logs   Check   Copy path   Remove…
      ✓ banco isolado
      ✗ prefixo redis: igual ao principal
```

- **Status:** ao abrir a tela, `status` roda em paralelo em cada worktree com slug (junto com o `git status`); a linha mostra `● up` (verde), `○ down` ou `? unknown`. Depois de Up/Down, roda de novo para aquela worktree. Só o `status` roda sozinho (WE-02).
- **No grafo (WE-03):** o status fica no `Graph` (`envStatus`, por caminho, mantido entre loads); `withWorktrees` marca `isUp` no badge e o pill desenha um `●` verde depois da marca de worktree (+2 células no `badgeWidth`). Um load pergunta de novo, sem esperar, quando o último status tem mais de 30 s.
- **Ações** (cada uma só se o contrato declarar): um botão `↗ <host>` por link (abre no navegador com `open`, ou `xdg-open` fora do macOS), **Up**, **Down**, **Logs**, **Check**; depois **Copy path** e **Remove…** como hoje.
- **Check:** roda e mostra as linhas abaixo das ações, `✓` verde, `✗` vermelho, `–` cinza; com elas na tela o botão vira **Hide check** (tira as linhas, sem rodar de novo).
- **Logs:** segue a saída ao vivo (`$.process.spawn`) num bloco de 12 linhas abaixo das ações, com **Stop**; fechar a tela, trocar de worktree ou Stop encerra o processo.

## 4. Criar e remover pelo contrato

- Com `new` declarado, **Create** roda o `new` do contrato em vez do `git worktree add`: `{slug}` do form, `{branch}`/`{base}` do alvo (branch existente: `{branch}` = ela, `{base}` vazio; commit: branch nova a partir do hash; tela: a branch digitada, `{base}` = `HEAD` quando nova). O campo **Path** some: o script põe a worktree em `<dir>/<slug>`.
- Com `remove` declarado, **Remove** roda o `remove` do contrato; com force, acrescenta `--force` (o CLI do nano-worktree aceita).
- `dir` do contrato tem prioridade sobre o de Settings (WT-05).

## 5. Dados e estado

**Módulo puro novo `hooks/contract.ts`** (`tests/contract.test.ts`): `CONTRACT_FILE`, `parseContract`, `commandArgv`, `envSlug`, `envVars`, `parseEnvStatus`, `parseCheck`, `linkUrls`, `stripAnsi`, `hostOf`.

**Tipos:** `Contract`; `Graph` ganha `contract: Contract | null` e `contractProblem: string | null`; estado novo `worktreeEnv` (`status` por caminho, `check` da worktree aberta, `logs` ao vivo).

## Reuse

`withRunning` (spinner + notice + toast + reload), `openWorktrees` (o `status` entra no mesmo `Promise.all` do `git status`), `pathWarning(main, path, hasContract)` (já fala do ambiente), `formTarget` (o alvo vira as vars do `new`).
