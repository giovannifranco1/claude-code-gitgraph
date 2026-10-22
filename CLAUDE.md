# gitgraph — mod do Claude Code

Painel lateral (estilo extensão Git Graph do VS Code) que mostra o grafo de commits do repositório da sessão.

## Stack

- Mod de function hooks do Claude Code (TypeScript/TSX, sem DOM e sem Node — tudo via `$`)
- Tipos da API: `.claude-plugin/types/claude-code/index.d.ts` (gerado pela engine, não editar)

## Comandos

- Validar: `claude plugin validate .`
- Type-check: `tsc -p .`
- Testes: `claude plugin test .`

## Convenções

- Idioma das specs/docs: PT-BR. Código e identificadores em inglês.
- Lógica pura (parse, lanes, detecção) em módulos sem `$`, cobertos por `*.test.ts`.
- `register.tsx` só faz wiring: estado, eventos, render.
- Estado que o render lê vive em `$.state` (declarado em `types/index.d.ts`), nunca em variável de módulo.
- Branching: gitflow clássico (git-flow-next). Scopes de commit: `graph`, `pane`, `actions`, `specs`.

## Referência .specs/

Documentação estruturada do projeto. Consultar antes de tomar decisões.

### Projeto
- `.specs/project/PROJECT.md` — Visão, goals, stack, scope
- `.specs/project/ROADMAP.md` — Features planejadas e milestones
- `.specs/project/STATE.md` — Decisões, blockers, lições

### Codebase
- `.specs/codebase/STACK.md` — Stack tecnológica e dependências
- `.specs/codebase/ARCHITECTURE.md` — Padrões arquiteturais e fluxo de dados
- `.specs/codebase/CONVENTIONS.md` — Convenções de código e naming
- `.specs/codebase/STRUCTURE.md` — Estrutura de diretórios
- `.specs/codebase/TESTING.md` — Infraestrutura e padrões de teste
- `.specs/codebase/INTEGRATIONS.md` — Integrações externas
- `.specs/codebase/CONCERNS.md` — Tech debt, riscos e áreas frágeis

### Features
- `.specs/features/YYYY-MM-DD-[feature]/spec.md` — Requisitos e critérios de aceite
- `.specs/features/YYYY-MM-DD-[feature]/design.md` — Arquitetura e componentes
- `.specs/features/YYYY-MM-DD-[feature]/tasks.md` — Tasks atômicas de implementação
