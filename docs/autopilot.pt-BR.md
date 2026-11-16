[English](autopilot.md) | **Português**

# Piloto automático

`/plan-relay-pt-br:run <plano>` conduz um plano inteiro sozinho: uma sessão, a condutora, escolhe as tasks livres e entrega cada uma a um agente em background, registra o que aconteceu num diário e para quando só sobra trabalho que precisa de você. `<plano>` é o nome da pasta em `agent_plans/` (`site-de-receitas`) ou o caminho dela (`agent_plans/site-de-receitas`).

## Como usar

1. Abra uma sessão do Claude Code na raiz do repositório, de preferência em **auto mode**. O pedido de permissão de um agente em background espera por quem está ausente, e a corrida para aí. Na Agents window do VS Code o auto mode é obrigatório («Auto Mode» no seletor de permissões da sessão): lá, um comando sem regra gravada é recusado sem cartão.
2. Rode `/plan-relay-pt-br:run <plano>`. O pré-voo mostra o que precisa de você e faz as perguntas todas de uma vez: quantos agentes ao mesmo tempo, se as tasks `decision` só se preparam para você ou se decidem na hora, que tasks suas quer resolver antes de largar, e o limiar da janela de 5 h. Depois disso é piloto automático.
3. Acompanhe, se quiser, pelo diário `agent_plans/<plano>/notes/run-<AAAA-MM-DD>.md`, ou por `sh agent_plans/<plano>/status.sh`.
4. Para parar, diga «para». A condutora deixa de lançar, espera os agentes em curso e fecha o diário.
5. Para retomar (outro dia, depois de um bastão, depois de decidir o que ficou à espera), rode `/plan-relay-pt-br:run <plano>` outra vez. O pré-voo encontra o diário aberto e o continua.

## O que você recebe no fim

O `## Closing` do diário lista o que precisa de você: as decisões que o piloto tomou sozinho, para revisar; as tasks à sua espera, cada uma com a ação concreta; os commits por fazer push (o piloto nunca faz push); e os imprevistos. Quando a pasta do plano está no `.gitignore`, o diário não vai para commit, e o fecho diz isso.

## Peças opcionais

Nenhuma delas para a corrida; o briefing do pré-voo diz quais faltam e o que muda sem elas.

- **Portão da janela de 5 h:** desligado por padrão, porque cada sonda é uma chamada real que gasta cota. Veja [a janela de 5 h](development.md#5-hour-window) para ligá-lo.
- **Aviso de contexto:** o hook do plugin avisa a condutora perto do limite de contexto (150k tokens, ou `PLAN_RELAY_CONTEXT_LIMIT`), e ela passa o bastão para uma sessão nova pelo diário.
- **Notificações:** com a ferramenta `PushNotification`, os avisos chegam a você fora da sessão; sem ela, ficam no diário e na mensagem final.
