# CONVENTIONS
- Identificadores em inglês, camelCase; tipos em PascalCase; constantes em UPPER_SNAKE.
- Funções puras e pequenas; sem classes.
- Estado de render em `$.state` (atoms tipados em `types/index.d.ts`); variáveis de módulo só para caches efêmeros.
- Todo `Button` em lista tem `key` único (hash do commit).
- Commits: Conventional Commits, scopes `graph`, `pane`, `actions`, `specs`.
