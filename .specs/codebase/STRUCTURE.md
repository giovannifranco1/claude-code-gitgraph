# STRUCTURE
```
gitgraph/
├── .claude-plugin/plugin.json   # manifesto
├── hooks/
│   ├── hooks.json               # { modules: ["./register.tsx"] }
│   ├── register.tsx             # wiring + render
│   ├── log.ts                   # parse do git log
│   ├── lanes.ts                 # layout do grafo
│   ├── format.ts                # datas, truncamento, hash curto
│   └── detect.ts                # pré-validação de nome de branch
├── types/index.d.ts             # contrato de $.state
├── tests/*.test.ts(x)           # testes (claude plugin test .)
├── README.md
└── .specs/                      # spec-driven
```
