# Spec — Ações de Git Flow (`2026-10-22-gitflow-actions`)

## User story
Como dev que usa gitflow, quero iniciar, atualizar, publicar e finalizar feature/bugfix/release/hotfix direto do painel do gitgraph (como a extensão *Git Flow Actions Sidebar* do VS Code), sem decorar os comandos do `git flow`.

## Decisões do dev (2026-10-22)
- **Onde:** barra fixa no rodapé do painel (barra de ícones `⎇`; revisto após teste: ícones, sem a base, formulários abaixo), mais itens no menu de botão direito das branches de trabalho.
- **Motor:** o CLI `git flow` do git-flow-next, respeitando a config do repositório (prefixos, base de cada tipo, tag, estratégias). Sem reimplementar o fluxo em git puro.
- **Finish, ligados por padrão:** `--no-ff`, push depois do finish, mensagem de tag automática, manter a branch (`--keep`).
- **Ajustes do design (2026-10-22):** só git-flow-next (o AVH tem outros comandos e flags e não dá para testar aqui); a mensagem da tag é um campo já preenchido, não um switch, porque sem `-m` o git flow abriria um editor e travaria.

## Requisitos e critérios de aceite

### GF-01 — Barra de ícones no rodapé (revisto após teste do dev, 2026-10-22)
- QUANDO o painel mostra um repositório ENTÃO o rodapé é uma barra de ícones: `⎇` + um botão por tipo (`feature`, `bugfix`, `release`, `hotfix`, ícone + nome, sem a base) e, numa branch de trabalho, `│ finish  rebase|merge  publish`.
- Os formulários (nome do start, opções do finish, conflito, spinner) abrem **abaixo** da barra só enquanto a ação está em andamento.
- No terminal com o painel docked o rodapé fica preso ao pé da janela; inline e nas outras superfícies fecha a lista, depois do último commit.

### GF-02 — Disponibilidade
- QUANDO o `git flow` não está instalado ENTÃO a barra mostra `git flow is not installed` e a dica `brew install gittower/tap/git-flow-next`, sem ações.
- QUANDO o `git flow` instalado não é o git-flow-next ENTÃO mostra `Git Flow actions need git-flow-next`, sem ações.
- QUANDO está instalado mas o repositório não foi inicializado (`gitflow.*` ausente na config) ENTÃO a barra mostra **Start git flow** com os nomes padrão ao lado (`main · develop · feature/ bugfix/ release/ hotfix/`); pede confirmação e roda `git flow init -d`, que cria a `develop`. Sem perguntar nomes (pedido do dev).
- Config do git flow AVH (`gitflow.prefix.*`) é lida como o git-flow-next a lê; config sem nenhum tipo conta como não configurado.
- A barra quebra em mais linhas quando não cabe na largura do painel.
- Os tipos e prefixos vêm da config do repo (`gitflow.branch.<tipo>.prefix`/`parent`/`startpoint`/`tag`/`downstreamstrategy`). Só aparecem os tipos `feature`, `bugfix`, `release` e `hotfix` que existirem na config.

### GF-03 — Start
- Cada tipo da config é um botão na barra; a base de onde parte vem da config e não é mostrada (o dev pediu: todo mundo sabe).
- QUANDO o dev pressiona um tipo ENTÃO aparece um campo `feature/` + nome. Para `release` e `hotfix` o campo já vem com a próxima versão sugerida a partir da maior tag semver (release: minor+1, hotfix: patch+1; sem tag: `0.1.0` / `0.0.1`).
- QUANDO dá Enter ENTÃO roda `git flow <tipo> start <nome>` (argv separado, nunca shell). O nome completo (`<prefixo><nome>`) é validado com `git check-ref-format --branch` antes; nome vazio ou inválido mostra o erro e não roda nada.

### GF-04 — Branch atual
- QUANDO o HEAD é uma branch de trabalho (casa com o prefixo de um tipo) ENTÃO a barra ganha **finish**, **rebase** (ou **merge**) e **publish**.
- **Update** roda `git flow <tipo> update <nome>`; o rótulo segue a estratégia configurada: `rebase` ou `merge` (no menu de branch, `Rebase on develop` / `Merge develop in`).
- **Publish** roda `git flow <tipo> publish <nome>` (rede, sem prompt de senha).
- QUANDO o HEAD não é branch de trabalho ENTÃO essa seção não aparece.

### GF-05 — Finish
- **Finish** abre a confirmação com switches ligados por padrão: `no-ff`, `push after`, `keep branch` (a escolha vale para a sessão). Em tipos com tag, um campo `Tag message:` já vem com `Release 1.2.0` / `Hotfix 1.0.2` e pode ser editado.
- QUANDO confirma ENTÃO roda `git flow <tipo> finish <nome>` com `--no-ff`|`--ff`, `--keep`|`--no-keep` e, em tipos com tag, `-m <mensagem>`. Tudo do git flow roda com `GIT_EDITOR=true` e `GIT_MERGE_AUTOEDIT=no`: nunca abre editor.
- QUANDO `push after` está ligado e o finish deu certo ENTÃO faz `git push --follow-tags <remote> <branches de destino>` (feature/bugfix: a base, ex. `develop`; release/hotfix: `main` e `develop`). Remote: `gitflow.origin`, senão `origin`; sem remote, não faz push e avisa.
- QUANDO o push falha ENTÃO o toast diz que o finish foi feito e o push para `<remote>` falhou, com a primeira linha do erro.

### GF-06 — Conflito
- QUANDO um Finish ou Update para por conflito (o status tem arquivos não resolvidos) ENTÃO abaixo da barra aparece `Conflict: resolve the files, then` com **Continue** e **Abort** (finish: `git flow <tipo> finish --continue|--abort <nome>`; update por rebase: `git rebase --continue|--abort`, com `GIT_EDITOR=true`).

### GF-07 — Menu da branch
- QUANDO o dev clica com o botão direito numa pílula de branch local de trabalho ENTÃO o menu ganha, no topo, `Finish <tipo>`, `Update` (mesmo rótulo de GF-04) e `Publish`, agindo sobre aquela branch. `Finish` abre a confirmação de GF-05 abaixo da barra.

### GF-08 — Segurança e loading
- Toda ação usa o spinner e a trava de GF-12 (uma ação por vez) e recarrega grafo e barra ao terminar.
- Publish, finish e push rodam no modo rede (timeout 120 s, `GIT_TERMINAL_PROMPT=0`).
- Comandos `git flow` rodam com `-c core.hooksPath=<pasta vazia do mod>`: o engine desliga os hooks do repo com `/dev/null`, onde o git-flow-next quebra; a pasta vazia mantém os hooks desligados (decisão do dev).
- Falha mostra toast com a primeira linha do stderr; nada além do que o git fez é alterado.

### Revisões após teste do dev (2026-10-22)
- finish/rebase/publish sem ícone (ícones só nos tipos). A barra fica sempre visível, sem título que abre e fecha (testado e recusado pelo dev).
- Delete não é ação de git flow (o dev recusou `Delete feature`): é o **Delete branch…** do menu de branch (GG-12), que agora pergunta com o switch `force` desligado (`git branch -d`; com force, `-D`) e pede segundo clique.
- **publish** e o **Finish** do formulário pedem segundo clique (o dev publicou sem querer).

## Fora do escopo
- `support/*`, squash, assinatura de tag, delete/rename via `git flow`, init com nomes customizados, listar todas as branches de trabalho na barra (o menu de botão direito cobre as que não são a atual).

## Rastreabilidade
| ID | Status |
|---|---|
| GF-01 | Verified |
| GF-02 | Verified |
| GF-03 | Verified |
| GF-04 | Verified |
| GF-05 | Verified |
| GF-06 | Verified |
| GF-07 | Verified |
| GF-08 | Verified |
