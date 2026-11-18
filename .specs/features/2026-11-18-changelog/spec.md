# Spec — Changelog no painel (`2026-11-18-changelog`)

## User story
Como dev que atualiza o mod, quero ver no próprio painel o que mudou em cada versão, com a minha versão marcada, como na aba ☰ Changelog do Upi (clickup-coop-mod).

## Decisões do dev (2026-11-18)
- Entrada por um ícone `☰` no toolbar do header, abrindo uma tela própria (como Settings, com volta para o grafo).
- **Conteúdo do `CHANGELOG.md` em PT-BR** (como o do Upi). O texto da interface em volta (título, `← graph`, `your version`) segue em inglês (regra do CLAUDE.md).

## Requisitos e critérios de aceite

### CL-01 — CHANGELOG.md
- O repositório tem `CHANGELOG.md` na raiz, formato Keep a Changelog (`## [x.y.z] - AAAA-MM-DD`, `### Adicionado|Corrigido|Mudado`, `- item`), da versão mais nova para a mais antiga, cobrindo 1.0.0 → atual.

### CL-02 — Tela de changelog
- QUANDO o dev aperta `☰` no header ENTÃO o painel troca o grafo pela tela `Changelog`: uma caixa por versão (`v1.6.0 · 2026-11-18`), cada grupo em negrito e seus itens com `•`.
- A versão instalada (`version` do `.claude-plugin/plugin.json` do mod) aparece destacada com `· your version`.
- QUANDO o arquivo não pode ser lido ou não tem versões ENTÃO a tela diz `Could not read the mod's CHANGELOG.md`.
- `← graph` volta ao grafo. Linhas de item que continuam recuadas no markdown fazem parte do item.

## Fora do escopo
- Aviso de versão nova publicada (o Upi consulta as tags remotas; aqui não).
