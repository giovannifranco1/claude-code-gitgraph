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
│   ├── detect.ts                # pré-validação de nome de branch
│   ├── badges.ts                # pílulas de ref, orçamento de largura, diffstat
│   ├── menu.ts                  # menu de ref (itens + argv), checkout, push por remote
│   ├── settings.ts              # git remote -v, git config user.*, validação de remote
│   ├── virtual.ts               # janela visível do scroll, busca por hash
│   ├── pilldraw.tsx             # desenho da pílula (compartilhado)
│   ├── pill.tsx                 # Client: pílula com clique direito/duplo
│   └── spinner.tsx              # Client: spinner animado
├── types/index.d.ts             # contrato de $.state
├── tests/*.test.ts(x)           # testes (claude plugin test .)
├── README.md
└── .specs/                      # spec-driven
```
