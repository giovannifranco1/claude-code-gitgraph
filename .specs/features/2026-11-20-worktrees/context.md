# Worktrees — contexto e decisões

Discovery de 2026-11-20 com o dev. Tamanho: **Complex** (dois entregáveis — o mod e uma skill —, domínio novo, uma referência externa).

## Referência

O projeto **phren** (`~/www/phren`) já roda worktrees com ambiente próprio: `docs/worktrees.md` e o script `bin/wt` (≈1000 linhas). Nele cada worktree, em `.claude/worktrees/<slug>`, tem subdomínio (`<slug>.phren.localhost`, via Traefik + nginx), banco próprio (`phren_<slug>`), worker de fila próprio, Vite num container e `REDIS_PREFIX`/`HORIZON_PREFIX` no `.env`; o painel `bin/wt` faz `up`, `down`, `list`, `logs`, `shell`. O doc lista armadilhas que **falham em silêncio** (worktree escrevendo no banco principal, job consumido pelo worker errado, nginx servindo o código do principal) e os guards que o script tem contra cada uma.

## Decisões

1. **Caminho C — separar por responsabilidade** (aprovado pelo dev).
   - **gitgraph (básico, qualquer repo):** worktrees do git — listar, criar a partir de uma branch ou commit, remover, mostrar quais branches estão abertas numa worktree.
   - **gitgraph (modo avançado):** se o repo declara um contrato de ambiente, cada worktree ganha as ações que ele declara (up, down, logs, check, links). O gitgraph só roda comandos declarados; não sabe de Docker, banco ou Vite.
   - **Skill de setup (separada):** monta num projeto a infraestrutura de ambiente por worktree e escreve o contrato. É trabalho de uma vez por projeto, dependente de stack — por isso skill, não UI.
   - Descartados: **A** (tudo no gitgraph: acoplaria o mod à stack do phren) e **B** (tudo em skill: sem UI para o dia a dia).
2. **A segurança não depende de a skill acertar** (preocupação do dev: "e se a skill errar o setup?"):
   - **a skill analisa o projeto antes** (decisão do dev): arquitetura, estrutura, infraestrutura — o projeto pode não usar Docker, não ter MySQL, usar Oracle — e decide como o ambiente vai funcionar ali; apresenta o plano (isolado × compartilhado) e só constrói com o OK do dev; o que não dá para isolar fica dito, não escondido;
   - a skill **adapta um modelo testado** quando a stack bate (o `bin/wt` do phren como referência, com seus guards), em vez de gerar do zero; para uma stack conhecida, um **template por stack** (ex.: "Laravel + Docker + Vite") só com variáveis; sem template que sirva, adapta a partir da análise;
   - o setup **só termina com prova**: cria uma worktree de teste, sobe e confere os itens de isolamento que o plano definiu para aquele projeto (ex.: URL servindo o código da worktree, banco/schema ≠ principal, prefixo de fila/cache ≠ principal), derruba e remove — qualquer falha para a skill e mostra o problema;
   - o contrato tem um **`check`** que roda os mesmos guards a qualquer momento; o gitgraph mostra o resultado por worktree;
   - a skill escreve arquivos numa branch (diff revisável), nunca mexe no ambiente principal sem o dev;
   - o gitgraph mostra a saída de qualquer comando que falhe e não roda nada destrutivo sozinho.
3. **Fora de `bin/wt`** (pedido do dev: "não fica legal nesse caminho"). Decidido com o dev:
   - o **script de ambiente** fica na raiz do repo, versionado, com um nome que diga o que é (o dev sugeriu algo como `wt.sh` ou `worktree_run.sh`; a skill gera **`worktree.sh`** por padrão). Continua usável pela linha de comando, sem o gitgraph: `./worktree.sh up <slug>`;
   - a **integração com o gitgraph** é um **`gitgraph.json`** na raiz do repo, versionado, com uma seção `worktrees` (onde ficam as worktrees, o script e os comandos que ele expõe). O nome do script vem dele, então cada projeto escolhe o seu.
4. **A skill de setup é um projeto separado, um plugin da Nano, no repositório próprio `~/www/nano-worktree`** (decisão do dev, 2026-11-20): nem parte do gitgraph, nem dentro do monorepo do marketplace (`~/www/nano-claude-plugins`). Consequências:
   - o `gitgraph.json` é um contrato entre dois projetos e leva um campo `version`; o gitgraph diz quais versões entende e avisa, sem quebrar, quando vê uma mais nova;
   - a skill é invocada como **`/nano-worktree init`**: inicializa o projeto, construindo a estrutura e os scripts (o script de ambiente na raiz); no `init` **pergunta se quer já adicionar o `gitgraph.json`** — a integração é opcional, e o script funciona sozinho sem ela;
   - a skill também tem **comandos determinísticos**, ex.: `/nano-worktree new <nome>` (ou "abra uma nova worktree"): chamam o script do projeto, sem o Claude improvisar os passos;
   - **uma fonte só para criar e remover:** o script do projeto expõe `new` e `remove`, e o contrato do `gitgraph.json` pode declará-los; com eles declarados, o gitgraph, a skill e a linha de comando criam e removem worktrees do mesmo jeito (sem eles, o gitgraph usa o `git worktree` direto, como na fase WT);
   - este repositório entrega a especificação do contrato (o que o gitgraph lê); a skill tem spec própria no projeto dela, e o que está em WS aqui é só o que o gitgraph espera receber dela.
5. **Ordem de entrega: WT → WE → WS.** Primeiro a worktree básica (útil em qualquer repo), depois o modo avançado (testado contra o phren migrado para `gitgraph.json`), por último a skill que gera tudo isso em projetos novos.

## Restrições descobertas

- **O mod não muda o diretório da sessão** (`$.session.cwd()`/`root()` só leem). "Abrir no Claude" uma worktree tem que ser um pedido ao Claude via `$.prompt.submit`, não uma troca direta.
- **Hook `WorktreeCreate`:** quando o Claude Code cria uma worktree (ex.: agente com `isolation: 'worktree'`), um hook pode assumir a criação (`worktreePath`). Abre a possibilidade de o ambiente subir também nas worktrees que o Claude cria — fica para depois.
- Worktrees em `.claude/worktrees/` (a pasta do Claude Code e a do phren) — o phren depende disso (bind mount `./:/var/www`).

## Em aberto

- Migração do phren: renomear `bin/wt` para `worktree.sh` na raiz e escrever o `gitgraph.json` (manter `bin/wt` como atalho por um tempo?).
- Como o `nano-worktree` chega ao marketplace da Nano (o `marketplace.json` de `nanoincub/claude-plugins` hoje aponta só para pastas locais `./plugins/*`; um plugin de outro repositório entra por uma fonte `github`).
