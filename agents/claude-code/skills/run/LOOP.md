# Bastão em laço

Numa retomada (`run.open` em `true`), o aviso «acima do limite» que chega antes do primeiro lançamento desta sessão pode querer dizer que só reler o estado já custa mais que o limite. Antes de passar o bastão, olhar o `## Tasks` do diário: se depois da última linha «Retomada às <HH:MM>» (num plano `en`, «Resumed at <HH:MM>») de uma sessão anterior — ou, sem nenhuma, em todo o `## Tasks` — não há entrada `### <HH:MM> <ID> - <RESULT>`, a sessão anterior também não lançou nada. Isso é o laço: outro bastão bateria no limite no mesmo ponto, sem fim. O sinal é a contagem dessas entradas, não o texto do `## Handoff`.

No laço, não escrever outro `## Handoff` e não chamar a skill `handoff`:

1. Acrescentar ao `## Tasks` a linha «bastão em laço: limite <n>k menor que o custo da retomada (aviso aos <m>k)», com os números do aviso. O diário continua sem `## Closing` e com o `## Handoff` que já tinha.
2. Numa raiz git, fazer commit do diário como no passo 3 do «Fecho» da skill `run`.
3. Parar e dizer ao dono, com `PushNotification` e na mensagem final: o contexto em que o aviso chegou e o limite; que o limite é baixo demais para conduzir este plano, porque só retomar já o ultrapassa; e que suba `PLAN_RELAY_CONTEXT_LIMIT` (ou o tire, para valer o padrão de 150k) no ambiente antes de rodar `{{AGENT_PLUGIN_SKILL_PREFIX}}run <pasta>` de novo.

A primeira sessão, que recebe o aviso no pré-voo antes de existir diário, não é laço: segue a regra «No pré-voo» da seção «Bastão» da skill `run` e passa o bastão. O laço só se reconhece na sessão seguinte. Sem laço, o bastão segue a seção «Bastão».
