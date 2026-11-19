# Reset das mudanças não commitadas

Feature `feature/actions-reset-uncommitted` (a partir da `develop`, 2026-11-19). Tamanho: Medium.

## RS-01 — Reset nas ações das Uncommitted changes

**Hoje:** a lista de ações da linha **Uncommitted changes (N)** tem **Commit changes…** e **Stash changes…**.

**Quero:** um terceiro item, **Reset changes…**, que abre a sua modal (como as outras) com dois modos, como no Git Graph do VS Code:
- **Mixed**: `git reset` — tira tudo do stage, os arquivos ficam como estão.
- **Hard**: `git reset --hard` — descarta as mudanças dos arquivos rastreados.

Critérios de aceite:
- [x] A lista mostra **Reset changes…** depois de **Stash changes…**; abre a modal **Reset changes** com uma linha explicando cada modo.
- [x] **Mixed** roda `git reset` e avisa `Unstaged the changes`.
- [x] **Hard** roda `git reset --hard` e avisa `Discarded the changes`.
- [x] Nada roda só por abrir a modal: escolher o modo é a confirmação. **cancel** (ou Esc) volta para a lista.
- [x] Arquivos novos (untracked) não são apagados em nenhum modo (sem `git clean`).
- [x] Textos da interface em inglês.

## Fora do escopo

- `git clean` (apagar arquivos novos).
- Reset de arquivos escolhidos um a um.
