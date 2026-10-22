# CONCERNS
- API de mods é early access: pode mudar entre releases; tipos regenerados pela engine.
- Repos grandes: limitar `git log` (padrão 300 commits) para não estourar render (100k chars por árvore).
- Ações que mudam o repo (checkout/cherry-pick) com working tree suja podem falhar: mostrar stderr em toast, nunca forçar.
- Auto-refresh custa 2 processos git (status + for-each-ref) por chamada Bash e a cada 5s, só com o painel aberto. Em repos enormes, `status` pode pesar.
- Detecção de Nerd Font só olha fontes instaladas, não a fonte do terminal: opção `badges: square` contorna.
- Altura fixa por linha corta conteúdo longo no detalhe (8 linhas de mensagem, 20 arquivos).
- `$.ui.scroll` até a busca não é coberto por teste (o kit não implementa).
- Lanes em histórico com muitos merges podem ficar largas: truncar colunas do grafo pela largura do painel.
