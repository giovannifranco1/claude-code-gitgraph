# Spec — Vários repositórios (`2026-10-27-multi-repo`)

## User story
Como dev que abre o Claude Code numa pasta com mais de um repositório git (um workspace com `api/` e `web/`, ou um repo com outro clone dentro), quero escolher no painel qual repositório o grafo mostra, sem sair da sessão nem trocar de pasta.

## Decisões do dev (2026-10-27)
- **Cenários:** pasta da sessão que não é repo mas tem repos dentro; e repos aninhados soltos dentro do repo da sessão. **Submódulos ficam de fora.**
- **Profundidade:** repos até 3 níveis abaixo da pasta da sessão (`./a`, `./a/b`, `./a/b/c`).
- **Seletor:** um campo de seleção (não abas), sem indicador de mudanças pendentes nos outros repos.
- **Revisão após teste (2026-10-27):** o `Select` nativo saiu cortado, destoando e sem trocar de repo no terminal. Virou um dropdown próprio de Buttons, **no começo da primeira linha do header** (antes da branch, como o `Repo:` da extensão do VS Code). A busca por hash saiu da linha fixa e abre por um ícone `⌕` no toolbar (all branches · ⌕ · ⚙ · ☁ · ↻); achar o commit fecha a busca.

## Requisitos e critérios de aceite

### MR-01 — Descoberta
- QUANDO o painel abre (e no refresh) ENTÃO o mod procura repositórios: a própria pasta da sessão, se for repo, mais toda pasta até 3 níveis abaixo que tenha um diretório `.git`.
- Pastas `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv` e outras ocultas não são percorridas. Um `.git` **arquivo** (submódulo, worktree) não conta como repo.
- Os repos são listados pelo caminho relativo à pasta da sessão, em ordem alfabética, com o repo da própria pasta primeiro (`.`).
- QUANDO a busca falha ENTÃO o painel segue só com o repo da sessão, como hoje.

### MR-02 — Seletor
- QUANDO há 2 ou mais repos ENTÃO a primeira linha do header começa com o botão `repo: <ativo> ▾`; clicar abre abaixo uma linha por repo (`●` no ativo), e clicar num repo troca e fecha. Com 1 repo (ou nenhum) o header fica igual ao de hoje.
- QUANDO a pasta da sessão é repo ENTÃO ele é o ativo ao abrir; QUANDO não é ENTÃO o ativo é o primeiro repo encontrado (em vez de `not a git repository`).
- QUANDO o dev escolhe outro repo ENTÃO o painel fecha detalhes, menu e formulários, volta ao topo e recarrega grafo, rodapé de Git Flow e (se aberta) a tela de settings para o repo escolhido.
- A escolha vale para a sessão (`$.state`).

### MR-03 — Todo git no repo ativo
- QUANDO há um repo ativo ENTÃO todo git do mod (grafo, detalhes, ações, Git Flow, settings, fetch, poll de 5 s e o reload após cada Bash) roda com `cwd` = repo ativo.
- QUANDO o repo ativo some da lista numa nova descoberta ENTÃO o painel volta ao repo padrão.

## Fora do escopo
- Submódulos (decisão do dev).
- Status/indicador dos repos não ativos (decisão do dev: só o select).
- Repos fora da pasta da sessão.

## Design (inline — escopo Medium)
- **`hooks/repos.ts` (puro, sem `$`):** `FIND_ARGS` (argv do `find`, com prune das pastas ignoradas e `-maxdepth 4`), `parseRepos(stdout)` → lista ordenada de caminhos relativos (`.` primeiro) e `pickActive(list, current)`. Coberto por `tests/repos.test.ts`.
- **Estado:** átomo `repos` (`{ list: string[]; active: string; isPicking: boolean }`) declarado em `types/index.d.ts`; `View` não muda.
- **`git()`** passa `cwd: active` a `$.process.run`.
- **Header:** botão `repo` no começo da primeira linha e, aberto (`isPicking` no átomo), uma linha de 1 de altura por repo; tudo conta na altura do header (virtualização).
- **Descoberta** roda no abrir do painel e no `refreshAll`, nunca no poll.
