# Spec — Inicializar Git Flow com nomes próprios (`2026-11-18-flow-init-custom`)

## User story
Como dev cujo repositório usa outra nomenclatura de Git Flow (`master` em vez de `main`, `feat/`, `fix/`, `rel/`…), quero inicializar (ou reconfigurar) o git flow pelo painel escolhendo os nomes, sem cair nos padrões `main · develop · feature/ …`.

## Decisões do dev (2026-11-18)
- **Formulário + reconfigurar:** o `Start git flow` do rodapé abre um formulário; repositórios já inicializados ganham `Reconfigure git flow` na tela de Settings.
- Base técnica: `git flow init -d --main … --develop … --feature … --bugfix … --release … --hotfix … [-t …] [-f]` (git-flow-next 1.1.0, testado: não abre prompt).

## Requisitos e critérios de aceite

### FI-01 — Formulário de init
- QUANDO o repo não tem git flow configurado (git-flow-next instalado) ENTÃO o rodapé mostra `Set up git flow…` e `Use defaults` (o `init -d` de hoje, confirmado); `Set up git flow…` abre, sob a barra, um formulário com: branch principal, branch de desenvolvimento, prefixos de feature, bugfix, release e hotfix, e prefixo de tag (opcional).
- O formulário vem preenchido com o detectado no repo:
  - principal: `main` se existir, senão `master` se existir, senão `main`;
  - desenvolvimento: `develop` se existir, senão `dev` se existir, senão `develop`;
  - cada prefixo: a forma curta (`feat/`, `fix/`, `rel/`, `hot/`) quando já há branch com ela e nenhuma com a longa; senão a longa (`feature/`, `bugfix/`, `release/`, `hotfix/`).
- QUANDO o dev aperta `Initialize` (confirmado) ENTÃO roda `git flow init -d` com os valores do formulário e o rodapé passa a mostrar as ações com os novos prefixos.
- QUANDO um nome de branch é inválido, ou um prefixo está vazio/tem espaço ENTÃO nada roda e um toast diz qual campo está inválido.
- `cancel` fecha o formulário.

### FI-02 — Reconfigurar
- QUANDO o git flow já está configurado ENTÃO a tela de Settings tem a seção `Git Flow` com a configuração atual (`main · develop · feature/ bugfix/ release/ hotfix/`) e o botão `Reconfigure…`, que abre o mesmo formulário preenchido com a configuração atual.
- QUANDO o dev confirma ENTÃO o mod apaga as seções `gitflow.branch.<base>` de bases antigas que não são mais a principal nem a de desenvolvimento (o `init -f` não as remove) e roda `git flow init -d -f` com os novos valores.

## Fora do escopo
- Prefixo de support e presets github/gitlab.
- Renomear branches existentes para a nova nomenclatura.
