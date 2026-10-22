# Spec — Git Graph pane (`2026-10-22-git-graph-pane`)

## User story
Como dev usando o Claude Code, quero um painel lateral com o grafo de commits do repositório (como a extensão Git Graph do VS Code), para entender o histórico e acompanhar o que o Claude faz no git sem sair da sessão.

## Requisitos e critérios de aceite

### GG-01 — Abrir o painel
- QUANDO o dev roda `/gitgraph` ENTÃO abre um painel com título "Git Graph" e o grafo do repositório do cwd da sessão é carregado.
- QUANDO `/gitgraph` é rodado com o painel já aberto ENTÃO o painel recarrega (não duplica).

### GG-02 — Fora de um repositório
- QUANDO o cwd não está num repositório git ENTÃO o painel mostra "Não é um repositório git" e nenhuma ação.

### GG-03 — Grafo
- QUANDO o log é carregado ENTÃO cada commit ocupa exatamente uma linha, com `●` na lane do commit e `│` nas lanes que passam.
- QUANDO um commit tem 2+ pais (merge) ENTÃO a linha mostra a ligação horizontal até a lane do pai extra (`─╮`).
- QUANDO duas lanes convergem no mesmo commit (fork) ENTÃO a lane que termina mostra `─╯` ligando à lane do commit.
- Cada lane mantém a mesma cor do início ao fim; cores ciclam numa paleta fixa.
- QUANDO há mais lanes do que cabe na largura ENTÃO o grafo é truncado com `…`.

### GG-04 — Linha do commit
- Cada linha mostra: grafo, hash curto (7), badges de refs, assunto, autor e data relativa (`5m`, `3h`, `2d`, `Oct 9`).
- Badges: `HEAD → main` destacado, branches locais, remotas (`origin/main`) esmaecidas e tags (`🏷 v1.0` / `tag:`).

### GG-05 — Escopo de branches
- Por padrão o log usa todas as refs (`--all`).
- QUANDO o dev pressiona o toggle no header ENTÃO alterna entre "todas" e "só HEAD", e recarrega.

### GG-06 — Limite e paginação
- O log carrega até 300 commits. QUANDO há mais ENTÃO aparece "Carregar mais" que soma +300.

### GG-07 — Mudanças não commitadas
- QUANDO o working tree tem alterações ENTÃO a primeira linha é "Uncommitted changes (N)" ligada ao HEAD.

### GG-08 — Detalhes do commit
- QUANDO o dev pressiona uma linha de commit ENTÃO abaixo dela expande: hash completo, autor <email>, data absoluta, mensagem completa e arquivos alterados com `+adds -dels`.
- QUANDO pressiona o mesmo commit de novo ENTÃO recolhe.

### GG-09 — Auto-refresh
- QUANDO o Claude roda um Bash com comando git que altera o repo (commit, merge, checkout, rebase, reset, pull, fetch, branch, tag, cherry-pick, stash, revert, `gh pr merge/checkout`…) ENTÃO o painel recarrega após o comando.
- QUANDO o comando git é só leitura (`status`, `log`, `diff`, `show`…) ENTÃO não recarrega.
- QUANDO o repo muda por fora (outro terminal) ENTÃO o painel percebe em até ~5s (comparação de assinatura de refs/HEAD/status) enquanto aberto.
- Há um botão de refresh manual no header.

### GG-10 — Ações
- **Copiar hash:** copia o hash completo para o clipboard e mostra toast.
- **Checkout:** faz checkout da branch local que aponta para o commit; sem branch local, `checkout --detach`. Exige confirmação (segundo clique).
- **Criar branch aqui:** campo de nome; Enter roda `git branch <nome> <hash>` e recarrega.
- **Cherry-pick:** `git cherry-pick <hash>`, exige confirmação; desabilitado para o HEAD.
- QUANDO uma ação falha ENTÃO mostra toast com a primeira linha do stderr e não muda nada além do que o git fez.
