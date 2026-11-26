# Worktrees no Git Graph

Feature de 2026-11-20. Tamanho: **Complex**. Decisões e contexto: `context.md`.

Três partes, entregáveis em fases: **WT** (worktree básica, qualquer repo), **WE** (ações de ambiente declaradas pelo projeto) e **WS** (skill de setup do ambiente).

## WT-01 — Ver as worktrees

- [x] O painel lê `git worktree list --porcelain` no load e mostra as worktrees do repo (caminho, branch ou HEAD destacado, se está suja), numa lista acessível pelo header.
- [x] Uma branch aberta numa worktree (que não a atual) tem um indicador no badge dela; o menu da branch diz em qual worktree ela está.
- [x] A worktree principal (a pasta do próprio repositório) não aparece na lista, que mostra só as worktrees criadas à parte (pedido do dev, 2026-11-22); sem nenhuma, diz "No worktrees yet". Ela não pode ser removida.

## WT-02 — Criar uma worktree

- [x] **New worktree…** no menu de uma branch local (worktree nessa branch) e nas ações de um commit (worktree numa branch nova a partir dele).
- [x] Um formulário pede o slug (preenchido a partir do nome da branch) e, para commit, o nome da branch nova; valida o slug (`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`) e o nome da branch (`git check-ref-format`).
- [x] O form tem o campo **Path**, preenchido com `<dir>/<slug>` (`dir` vem do `gitgraph.json`; sem ele, `.claude/worktrees`) e acompanhando o slug enquanto o dev não editar o caminho à mão. Aceita caminho relativo à worktree principal ou absoluto (`~` expandido).
- [x] Caminho **fora da pasta da worktree principal**: alerta em amarelo no form, dizendo o que deixa de funcionar — a sessão do Claude não alcança a pasta (o **Open in Claude** esbarra em permissão até a pasta ser adicionada à sessão) e, com `gitgraph.json`, o ambiente do projeto não serve a worktree. O botão vira **Create anyway** e pede um segundo clique.
- [x] Caminho que já existe (e não é uma pasta vazia): erro no form, nada roda.
- [x] Cria com o comando nativo, `git worktree add <path> <branch>` ou `git worktree add -b <nova> <path> <commit>`. O caminho pode ser uma pasta que já existe, se estiver vazia.
- [x] **✨ Ask Claude** (opcional, pedido do dev): em vez de rodar, manda ao Claude o pedido de criar a worktree com o mesmo comando nativo (e o `.git/info/exclude`, dentro do repo); o form fecha e nada roda no painel.
- [x] Caminho dentro do repo e não ignorado pelo git: acrescenta a pasta ao `.git/info/exclude` (local) antes do `add`, para a worktree não aparecer como arquivo novo nas Uncommitted changes da principal; o toast avisa.
- [x] Uma branch já aberta noutra worktree não oferece criar outra (o git recusaria).

## WT-06 — Criar pela tela, num modal (pedido do dev, 2026-11-20)

- [x] O form de criar é um **modal** sobre o que o painel mostra (o grafo ou a tela Worktrees); a listagem e as ações ficam na tela Worktrees. Criado, o painel vai para a tela Worktrees com a nova selecionada.
- [x] A tela Worktrees tem **＋ New worktree**: o modal pede a **Branch** — uma branch local que existe recebe a worktree; um nome novo vira branch nova a partir do HEAD (`git worktree add -b <nova> <path> HEAD`).
- [x] Avisos e erros longos quebram em linhas dentro do modal.

## WT-03 — Remover uma worktree

- [x] **Remove worktree…** pede confirmação; com mudanças não commitadas, avisa e só remove com um `force` explícito (`git worktree remove [--force]`).
- [x] Remover não apaga a branch.
- [x] Com contrato e worktree no ar (`status`), oferece rodar o `down` antes.

## WT-04 — Copiar o caminho

- [x] **Copy path** copia o caminho absoluto.
- ~~**Open in Claude**~~: retirado a pedido do dev (2026-11-20) — o mod não troca o diretório da sessão, e um pedido ao Claude para "passar a trabalhar lá" não é o fluxo que ele quer.

## WT-05 — Pasta padrão nas Settings

- [x] As Settings têm **Worktree folder**: a pasta onde as worktrees novas deste repositório vão, salva em `git config --local gitgraph.worktreeDir` (vazio: o padrão `.claude/worktrees`).
- [x] O form de criar usa essa pasta. Na fase WE, o `dir` do `gitgraph.json` tem prioridade sobre ela.

## WE-01 — O contrato de ambiente

- [x] O painel lê o `gitgraph.json` da raiz da worktree principal (versionado no repo) e usa a seção `worktrees`.
- [x] A seção declara: `version`, `dir` (onde ficam as worktrees) e comandos opcionais `new`, `remove`, `up`, `down`, `logs`, `check`, `status` e `links`, com `{slug}` e `{path}` como placeholders (e `{branch}`/`{base}` no `new`, pedido do nano-worktree; um placeholder vazio sai do comando). Os comandos chamam o script do projeto (ex.: `./worktree.sh up {slug}`); o nome do script é do projeto.
- [x] `version` mais nova que a que o gitgraph entende: aviso no painel, modo avançado desligado, básico segue.
- [x] Contrato inválido (JSON quebrado, campo de tipo errado, comando sem placeholder obrigatório) aparece como erro no painel; o modo avançado fica desligado, o básico segue.

## WE-02 — Ações de ambiente

- [x] Cada worktree ganha as ações que o contrato declara: **Up**, **Down**, **Logs**, **Check**, e os **links** (abrir no browser).
- [x] Com `new` (e `remove`) declarados, **New worktree…** e **Remove…** do gitgraph chamam esses comandos em vez do `git worktree add/remove` direto: o gitgraph, o `/nano-worktree new` e a linha de comando criam e removem worktrees do mesmo jeito (mesmo caminho, mesmo preparo de ambiente).
- [x] Cada comando roda no diretório da worktree principal, com o slug no lugar do placeholder; o painel mostra o spinner e, em falha, a saída do comando (como as ações do git hoje).
- [x] `status` (se declarado) diz se a worktree está no ar; o painel mostra no ar / parada / desconhecido.
- [x] `check` mostra ✓ ou o problema que os guards acharam, por worktree.
- [x] Nenhum comando do contrato roda sozinho, exceto `status`: ao abrir a tela Worktrees, depois de Up/Down e num load quando o último status tem mais de 30 s (WE-03), sem segurar o load.

## WE-03 — Ambiente no ar no badge do grafo

- [x] No grafo, o badge de uma branch aberta noutra worktree ganha um `●` verde depois da marca de worktree quando o ambiente dela está `up`. Parado ou desconhecido: nada (parado é o normal, não erro; sem vermelho).
- [x] O status é o último conhecido, guardado entre loads; um load pergunta de novo quando ele tem mais de 30 s. Sem contrato ou sem `status` declarado, o badge fica igual ao do WT-01.

## WS-01 — Skill de setup do ambiente (projeto separado: `~/www/nano-worktree`)

> Feita **fora deste repositório**, em `~/www/nano-worktree`, com spec própria no projeto dela. Os critérios abaixo são o que o gitgraph espera receber dela; servem de ponto de partida para aquela spec.

- [ ] Invocada como **`/nano-worktree init`** (decisão do dev): inicializa o projeto, construindo a estrutura e os scripts do ambiente por worktree.
- [ ] Além do `init`, **comandos determinísticos** (decisão do dev), ex.: `/nano-worktree new <nome>` (também pedido em linguagem natural, como "abra uma nova worktree"). Determinístico quer dizer: chamam o script do projeto (`./worktree.sh new <slug>`, `up`, `down`, `list`, `remove`…) com os argumentos certos, sem o Claude improvisar os passos.
- [ ] No `init`, **pergunta se quer já adicionar o `gitgraph.json`** (a integração com o gitgraph é opcional): sim, escreve a seção `worktrees` apontando para o script gerado; não, o script funciona sozinho pela linha de comando e o `gitgraph.json` pode ser adicionado depois.
- [ ] **Antes de construir, analisa o projeto** (decisão do dev): arquitetura, estrutura e infraestrutura — se usa Docker ou não, qual banco (MySQL, Postgres, Oracle…), servidor web, filas, cache, build de front — e decide como o ambiente por worktree vai funcionar **naquele** projeto.
- [ ] Apresenta ao dev o que encontrou e o plano (o que cada worktree terá isolado e o que fica **compartilhado**, como a tabela do phren) e só constrói depois do OK.
- [ ] Onde o isolamento não é possível ou não compensa (ex.: um Oracle compartilhado sem permissão de criar schema), o plano diz isso explicitamente, em vez de fingir isolamento.
- [ ] Parte de um **modelo testado** quando a stack bate (o do phren como referência para Laravel + Docker + Vite; outros templates por stack); quando nenhum serve, adapta a partir da análise — os guards e a verificação continuam obrigatórios nos dois casos.
- [ ] Escreve o script (`worktree.sh` por padrão, na raiz) e, se o dev quiser, a seção `worktrees` do `gitgraph.json`, numa branch de trabalho (diff revisável); não mexe no ambiente principal sem o dev.
- [ ] O script gerado tem os guards do modelo (ex.: chaves proibidas no `.env` principal, banco conectado ≠ principal antes de migrar, `vendor` nunca symlink).
- [ ] **Verificação obrigatória** antes de dizer que terminou, com os itens que o plano definiu para aquele projeto (ex.: URL responde servindo o código da worktree, banco/schema conectado ≠ principal, prefixo de fila/cache ≠ principal, `check` verde): cria uma worktree de teste, `up`, confere cada item, `down`, remove. Qualquer falha: para e mostra.

## Fora do escopo (agora)

- Hook `WorktreeCreate` para subir o ambiente nas worktrees que o próprio Claude Code cria.
- Clonar dados do banco principal para a worktree.
- Apagar o banco da worktree ao removê-la (o phren deixa isso manual de propósito).
