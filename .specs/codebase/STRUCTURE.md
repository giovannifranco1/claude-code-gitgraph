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
│   ├── flow.ts                  # git flow: config gitflow.*, tópicos, próxima versão, argv de start/finish/update/publish
│   ├── repos.ts                 # argv do find de repos, parse da lista, repo ativo
│   ├── settings.ts              # git remote -v, git config user.*, validação de remote
│   ├── virtual.ts               # janela visível do scroll, busca por hash
│   ├── pilldraw.tsx             # desenho da pílula (compartilhado)
│   ├── pill.tsx                 # Client: pílula com clique direito/duplo
│   └── spinner.tsx              # Client: spinner animado
├── types/index.d.ts             # contrato de $.state
├── nohooks/.gitkeep             # pasta de hooks vazia para o git flow (o engine desliga hooks com /dev/null)
├── tests/*.test.ts(x)           # testes (claude plugin test .)
├── README.md
└── .specs/                      # spec-driven
```
