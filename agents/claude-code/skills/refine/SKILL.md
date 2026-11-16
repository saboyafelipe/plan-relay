---
name: refine
description: Afina uma ideia de agent_plans/_ideas/ por sabatina: perguntas em rondas, com opções e uma recomendação; grava as respostas como decisões e propõe a ideia como pronta quando não sobra pergunta. Usar quando pedirem para afinar ou sabatinar uma ideia, ou para responder às perguntas em aberto dela.
argument-hint: "caminho ou slug da ideia (opcional)"
---

# Refine

Uma ideia (`agent_plans/_ideas/<slug>.md`, na forma do modelo `<plugin>/template/idea.md`) guarda o que se quer, o que já se decidiu e o que falta responder. Esta skill faz a sabatina: em cada ronda, pergunta tudo o que já dá para responder, grava cada resposta como decisão e cada pergunta nova que a resposta abriu, até não sobrar pergunta. Aí propõe a ideia como pronta (`ready`), e só a pessoa confirma.

O argumento, se vier, é o caminho ou o slug da ideia.

## Comandos

Antes do primeiro comando, ler `<plugin>/COMMANDS.md` e segui-lo em cada comando desta skill. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão. Sem essa linha, parar e dizer ao usuário que o plugin plan-relay não está carregado nesta sessão: o cabeçalho da ideia só muda pelo script dele.

**O cabeçalho só muda pelo `idea.sh`.** `Status:` e `Open questions:` nunca se escrevem com as ferramentas de edição; o corpo (título, texto, «Decisões», a seção das perguntas) sim. Nos comandos abaixo, `<arquivo>` é o caminho da ideia a partir da raiz, `agent_plans/_ideas/<slug>.md`.

## 1. Achar a ideia

- Com argumento: o arquivo citado, ou `agent_plans/_ideas/<slug>.md`.
- Sem argumento: a ideia desta conversa, se houver; senão, a única de `agent_plans/_ideas/` que não esteja `mapped` (os arquivos que começam por `_` ou `.` não são ideias). Com mais de uma, perguntar qual; com nenhuma, dizer que não há ideia para afinar e que `{{AGENT_PLUGIN_SKILL_PREFIX}}idea` cria uma.

Ler o arquivo inteiro: o cabeçalho, o texto, «Decisões», a seção marcada por `<!-- open-questions -->` e, se houver, a seção `## Handoff` de uma sessão anterior (ela diz onde a sabatina parou).

Pelo `Status:`:

- **`mapped`:** recusar. A ideia já virou o plano da linha `Plan:`; dizer qual e que mudanças daqui em diante vão para o plano (`{{AGENT_PLUGIN_SKILL_PREFIX}}plan`), ou para uma ideia nova.
- **`open`:** `sh <plugin>/scripts/idea.sh status <arquivo> refining`.
- **`refining`:** seguir.
- **`ready`:** dizer que a ideia já está pronta e perguntar se a pessoa quer reabri-la. Só se ela quiser, seguir; a primeira pergunta nova gravada a devolve a `refining` (passo 3).
- Sem `Status:` ou com outro valor: dizer que o cabeçalho está fora do contrato e parar.

**A língua** das perguntas e de tudo o que se grava é a da ideia (a do texto dela), não a desta skill.

## 2. Montar a ronda

A **fronteira** são as perguntas que já dá para responder agora: as da seção marcada cuja resposta não depende de outra pergunta ainda aberta, mais as lacunas que a leitura revelar (o texto diz uma coisa e uma decisão diz outra; algo necessário para virar plano que ninguém perguntou). Uma pergunta que depende de outra fica para a ronda seguinte.

Para cada pergunta da fronteira:

- reescrevê-la para que se responda sem reler a ideia, numa frase;
- quando houver, duas a quatro opções concretas, cada uma com a consequência em poucas palavras, e uma **recomendação** (a opção primeiro, marcada como recomendada, com o porquê). Pergunta aberta de verdade (um nome, um número) vai sem opções.

Fazer a ronda toda de uma vez pela ferramenta `{{AGENT_ASK_TOOL}}`, só com as perguntas que têm opções: a ferramenta recusa a chamada inteira quando uma pergunta tem menos de duas, e a pessoa não vê nenhuma. As perguntas abertas vão em texto, na mesma resposta, antes do cartão, numeradas; a resposta vem na conversa e se grava no passo 3 com as outras. Se a ferramenta limitar quantas perguntas cabem numa chamada, usar chamadas seguidas, gravando (passo 3) depois de cada uma. A pessoa pode responder «não sei agora» ou pular: a pergunta continua aberta.

**Sem a ferramenta de pergunta estruturada** (um agente que não a tem, ou que segue sozinho depois de um tempo): não esperar a resposta. Escrever as perguntas da ronda na seção marcada, cada uma com as opções e a recomendação no próprio item, rodar `sh <plugin>/scripts/idea.sh sync <arquivo>` e terminar o turno dizendo à pessoa para responder no chat ou no arquivo; a próxima mensagem dela continua no passo 3.

## 3. Gravar

Com as ferramentas de edição, no corpo da ideia:

1. **Cada resposta vira decisão:** um item em «Decisões» com o quê, por quê (o motivo dado, ou o da recomendação aceita) e quem decidiu (a pessoa). A pergunta respondida sai da seção marcada.
2. **Perguntas novas** que as respostas abriram entram na seção marcada, um item `- ` por pergunta, que se responda sem reler a conversa.
3. Uma resposta que muda o que o texto da ideia diz corrige o texto também.

Depois, sempre: `sh <plugin>/scripts/idea.sh sync <arquivo>`, que escreve em `Open questions:` a contagem da seção marcada. Se a ideia estava `ready` e a ronda gravou pergunta nova: `sh <plugin>/scripts/idea.sh status <arquivo> refining`.

Para saber quantas sobraram, `sh <plugin>/scripts/idea.sh count <arquivo>`; não contar a olho.

## 4. Repetir ou fechar

- **Sobrou pergunta:** nova ronda (passo 2), a não ser que a pessoa queira parar.
- **Zero perguntas:** propor a ideia como pronta, com um resumo curto das decisões desta sessão, e perguntar pela `{{AGENT_ASK_TOOL}}` se ela confirma. Só com o sim: `sh <plugin>/scripts/idea.sh status <arquivo> ready`. Sem o sim, a ideia fica `refining`; perguntar o que falta e voltar ao passo 2 com isso.

## 5. Parar no meio

Quando a pessoa para antes de zerar as perguntas, ou a sessão precisa terminar (o contexto está acabando, um hook manda passar o bastão), terminar a gravação em curso (passo 3, com o `sync`) e escrever o bastão na seção `## Handoff` do próprio arquivo da ideia, pelo procedimento de `{{AGENT_PLUGIN_SKILL_PREFIX}}handoff` (o caso da conversa sobre uma ideia). O `Next step:` dele diz qual ronda vem e quais perguntas estão na fronteira. O `Status:` fica `refining`.

Esta skill não faz commit: `agent_plans/` pode estar fora do git, e quem decide é o usuário.

## 6. Dizer ao usuário

Em poucas linhas: o caminho da ideia, o estado (`refining` ou `ready`), quantas perguntas sobraram (a saída do `idea.sh count`) e o que vem depois. Com `ready`: mapear num plano com `{{AGENT_PLUGIN_SKILL_PREFIX}}map <arquivo>`. Com perguntas: rodar `{{AGENT_PLUGIN_SKILL_PREFIX}}refine <arquivo>` de novo, ou responder no próprio arquivo e rodar o `idea.sh sync`.

**Pronto quando** cada resposta da sessão está em «Decisões», cada pergunta aberta está na seção marcada, `Open questions:` é a saída do `idea.sh count`, e o `Status:` só passou a `ready` com a confirmação da pessoa.
