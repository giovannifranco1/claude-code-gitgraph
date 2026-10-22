# CONCERNS
- API de mods é early access: pode mudar entre releases; tipos regenerados pela engine.
- Repos grandes: limitar `git log` (padrão 300 commits) para não estourar render (100k chars por árvore).
- Ações que mudam o repo (checkout/cherry-pick) com working tree suja podem falhar: mostrar stderr em toast, nunca forçar.
- Lanes em histórico com muitos merges podem ficar largas: truncar colunas do grafo pela largura do painel.
