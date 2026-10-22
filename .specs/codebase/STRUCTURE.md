# STRUCTURE
```
gitgraph/
├── .claude-plugin/plugin.json   # manifesto
├── hooks/
│   ├── hooks.json               # { modules: ["./register.tsx"] }
│   ├── register.tsx             # wiring + render
│   ├── log.ts                   # parse do git log
│   ├── lanes.ts                 # layout do grafo
│   └── detect.ts                # comandos git que mudam o repo
├── types/index.d.ts             # contrato de $.state
├── tests/*.test.ts(x)           # testes (claude plugin test .)
└── .specs/                      # spec-driven
```
