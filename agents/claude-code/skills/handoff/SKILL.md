---
name: handoff
description: Passa o bastão: registra onde a sessão parou (o que foi feito, o que está em curso, as decisões, o próximo passo) para uma sessão nova continuar sem esta conversa. Usar quando pedirem para passar o bastão ou continuar noutra sessão, e quando o aviso de contexto do plan-relay ou o piloto mandarem.
argument-hint: "foco da próxima sessão (opcional)"
---

# Handoff

A próxima sessão não vê esta conversa. Tudo o que ela precisa para continuar tem de estar escrito num arquivo que ela vai ler, e o usuário tem de saber o comando exato que a abre. Esta skill escreve essa passagem e diz o comando.

O argumento, se vier, é o **foco**: o que a próxima sessão deve continuar. Sem argumento, o foco é o trabalho em curso nesta sessão.

## Comandos

A primeira chamada desta skill é `Read` de `<plugin>/COMMANDS.md`, e ele vale para cada comando dela. Na prática: cada chamada `Bash` é um comando só, copiado de um passo abaixo; um arquivo se lê com `Read`. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão; sem essa linha, seguir mesmo assim, com um comando literal por chamada: a passagem não espera pelo plugin.

## 1. O que registrar

Antes de escrever, terminar o passo em curso (um arquivo editado pela metade, um teste a meio) ou desfazê-lo; não abrir nada novo. Depois juntar, curto e concreto:

- **Feito:** o que esta sessão concluiu, com os arquivos tocados e os commits (hash e primeira linha), se houver.
- **Em curso:** o que ficou começado e em que ponto exato parou — o arquivo, a função, o teste que está red.
- **Decisões:** o que se decidiu e por quê, incluindo cada resposta que o usuário deu nesta sessão e que a próxima precisa saber. Uma pergunta que ficou sem resposta também vai aqui, marcada como aberta.
- **Next step:** uma ação que a próxima sessão consegue começar sem perguntar nada — «rodar `sh x/check.sh` e corrigir o caso Y», não «continuar o trabalho».
- **Ler primeiro:** os arquivos que a próxima sessão precisa ler antes de agir, se não forem óbvios pelo destino.

Para os arquivos tocados e os commits, cada um na sua chamada: `git status --short` e `git log --oneline -n 10`. Nada de segredos, tokens nem senhas na passagem.

## 2. Onde escrever

Escolher o primeiro caso que se aplica:

1. **Condutora de um plano** (esta sessão roda o `{{AGENT_PLUGIN_SKILL_PREFIX}}run <pasta>`): no diário da corrida aberto, `<pasta>/notes/run-<AAAA-MM-DD>.md` (o mais recente sem `## Closing`; é o `run.log` do `sh <pasta>/status.sh --json` quando `run.open` é `true`), numa seção `## Handoff` no fim. Se o diário já tiver uma ou mais seções `## Handoff` (cada uma vai do título até o próximo `## ` ou o fim do arquivo), apagá-las todas e escrever uma só: vale só a passagem mais recente. Além dos itens acima: os trabalhadores ainda em curso e as respostas do pré-voo (paralelo, decisões, janela de 5 h). O diário sem `## Closing` é o que faz o próximo pré-voo retomar.
   - Retomada: `{{AGENT_PLUGIN_SKILL_PREFIX}}run <pasta>`.
2. **Sessão de trabalho numa task de um plano** (esta sessão reclamou ou retomou uma task em `agent_plans/<nome>/`): na entrada desta sessão no `## Log` da própria task, no formato do `README.md` do plano, terminando em `- Next step: …`. O `Status:` continua `in-progress`; não rodar `task.sh close` nem `release`.
   - Retomada: `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <nome> <ID>`, a skill `plan` do plugin. Um trabalhador lançado pelo `{{AGENT_PLUGIN_SKILL_PREFIX}}run` não chega aqui: escreve o `Next step:` e devolve `RESULT: INTERRUPTED`.
3. **Conversa sobre uma ideia** (um arquivo em `agent_plans/_ideas/`): numa seção `## Handoff` no fim do próprio arquivo da ideia. Se já existir uma, substituí-la: vale só a passagem mais recente.
   - Retomada: abrir uma sessão nova e pedir «continue a ideia `agent_plans/_ideas/<arquivo>.md` a partir da seção Handoff».
4. **Nenhum dos três:** numa pasta nova dentro da pasta temporária do sistema. Criá-la com `mktemp -d` (a saída é o caminho) e escrever ali `handoff.md`, começando por um título com o foco e a data.
   - Retomada: abrir uma sessão nova no mesmo diretório e pedir «continue a partir de `<caminho>/handoff.md`». A pasta temporária pode ser limpa pelo sistema; dizer isso ao usuário.

A seção `## Handoff` (casos 1, 3 e 4) tem esta forma, com os marcadores como estão, também num plano em outra língua (`Next step:` é o que a retomada procura):

```
## Handoff — <AAAA-MM-DD HH:MM UTC>
- Foco: …
- Feito: …
- Em curso: …
- Decisões: …
- Next step: …
- Ler primeiro: …
```

Esta skill não faz commit nem push: quem a chamou decide (o `{{AGENT_PLUGIN_SKILL_PREFIX}}run` faz commit do diário depois dela).

## 3. Dizer ao usuário

A última mensagem da sessão diz, em poucas linhas:

- onde a passagem ficou (o caminho do arquivo e a seção);
- o comando ou o pedido exato que a próxima sessão usa para retomar, copiado do caso escolhido;
- que esta sessão deve parar aqui e que a próxima começa do zero.

**Pronto quando** o arquivo do destino tem a passagem com um `Next step:` que se começa sem perguntar nada, e a resposta final dá o caminho e o comando de retomada.
