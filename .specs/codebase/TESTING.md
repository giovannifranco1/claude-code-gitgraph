# TESTING
- Runner: `claude plugin test .` — roda `*.test.ts(x)` num ambiente sem fs/rede/processo; `import { test, expect, mock } from 'claude-code/testing'`.
- Lógica pura testada direto (import relativo).
- Render testado com `$.ui.mount({ plugin, surface, component: 'Pane', requestId, props })` + `ui.find` / `ui.press`; o git é simulado com um hook `on('process.run', (_, e) => ({ value: ... }))` que responde por `argv` (ver `tests/pane.test.tsx`); hooks beneath devem ser registrados antes do primeiro uso de `$`.
- Nomes de teste levam o ID do requisito (ex.: `GG-01 ...`).
- Gates extras: `claude plugin validate .` e `tsc -p .`.
