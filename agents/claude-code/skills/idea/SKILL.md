---
name: idea
description: Cria uma ideia, um plano ainda por mapear, em agent_plans/_ideas/<slug>.md, a partir da conversa ou de um documento citado, com as perguntas que ficaram em aberto. Usar quando pedirem para anotar, guardar ou criar uma ideia.
argument-hint: "assunto ou caminho de um documento (opcional)"
---

# Idea

Uma ideia é o que vem antes de um plano: o que se quer, o que já se decidiu e o que ainda falta responder. Esta skill grava uma em `agent_plans/_ideas/<slug>.md`, na forma do modelo `<plugin>/template/idea.md`, para que ela seja afinada e mapeada depois sem esta conversa.

O argumento, se vier, é o assunto ou o caminho de um documento. Sem argumento, a ideia é a desta conversa.

## Comandos

Antes do primeiro comando, ler `<plugin>/COMMANDS.md` e segui-lo em cada comando desta skill. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão. Sem essa linha, parar e dizer ao usuário que o plugin plan-relay não está carregado nesta sessão: a ideia depende do modelo e do script dele.

## 1. Juntar

- **A fonte.** Com um documento citado, lê-lo; senão, a conversa. Não inventar: o que não foi dito não entra como decidido.
- **O título:** uma linha que diz o que se quer.
- **O texto:** o que se quer e por quê, o problema, o que já existe. Curto e concreto.
- **Decisões:** o que a fonte já fixou, um item por decisão, com o porquê e quem decidiu quando se souber.
- **Perguntas em aberto:** o que a fonte deixou sem resposta e precisa de resposta antes de virar plano. Uma pergunta por item, que se responda sem reler a conversa.

**A língua** da ideia é a da conversa (não há `plan.json` numa ideia): o texto, o título e os títulos das seções. As chaves do cabeçalho e o marcador `<!-- open-questions -->` ficam como estão, em qualquer língua.

## 2. Escolher o slug

ASCII minúsculo com hífen, curto, tirado do título (`exportar-csv`). Sem acento, espaço nem outro símbolo; não começa por `_` nem `.`. Quem diz se `agent_plans/_ideas/<slug>.md` já existe é o `copy.sh` do passo 3 (sai 1 sem copiar), ou um `Glob`; não listar a pasta pelo shell antes. Se já existir, não sobrescrever: perguntar ao usuário se a conversa é sobre aquela ideia (então editá-la, não criar outra) ou que outro slug usar.

## 3. Escrever

1. Copiar o modelo na língua da ideia: `sh <plugin>/template/copy.sh --lang <língua> idea.md agent_plans/_ideas/<slug>.md`, com `pt-BR` numa conversa em português e `en` numa em inglês (ou em outra língua, que o modelo não tem). Sai 1 sem copiar quando o destino existe: voltar ao passo 2.
2. A hora: `date -u +%Y-%m-%dT%H:%MZ`, sozinho numa chamada, e a saída vai em `Created:`.
3. Preencher com as ferramentas de edição: o título na linha `# `, o texto no lugar do primeiro parágrafo, as decisões na seção das decisões, as perguntas na seção marcada por `<!-- open-questions -->`, um item `- ` por pergunta. Trocar os textos entre `<` e `>` do modelo; numa língua que o modelo não tem, traduzir também os títulos das seções. Não escrever `Open questions:` à mão.
4. Contar: `sh <plugin>/scripts/idea.sh sync agent_plans/_ideas/<slug>.md`. Ele escreve no cabeçalho o número de itens da seção marcada.

O `Status:` fica `open`. Esta skill não faz commit: `agent_plans/` pode estar fora do git, e quem decide é o usuário.

## 4. Dizer ao usuário

Em poucas linhas: o caminho do arquivo, quantas perguntas ficaram em aberto (a saída de `sh <plugin>/scripts/idea.sh count agent_plans/_ideas/<slug>.md`) e o que vem depois: afinar a ideia com `{{AGENT_PLUGIN_SKILL_PREFIX}}refine agent_plans/_ideas/<slug>.md`, que faz as perguntas em rondas e grava as respostas, e, quando não sobrar nenhuma, mapear a ideia num plano com `{{AGENT_PLUGIN_SKILL_PREFIX}}map agent_plans/_ideas/<slug>.md`. Para continuar a conversa noutra sessão, `{{AGENT_PLUGIN_SKILL_PREFIX}}handoff` escreve a passagem no próprio arquivo da ideia.

**Pronto quando** `agent_plans/_ideas/<slug>.md` existe com título, `Created:` preenchido, `Status: open` e `Open questions:` igual à contagem do `idea.sh count`.
