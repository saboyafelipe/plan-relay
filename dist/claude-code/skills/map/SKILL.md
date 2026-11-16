---
name: map
description: Transforma um documento de plano num mapa de tasks em agent_plans/<nome>/: fases, tasks autossuficientes com arestas de bloqueio, scripts de estado e plan.json. Só o usuário chama, com /plan-relay-pt-br:map <caminho do .md>.
disable-model-invocation: true
argument-hint: "caminho do plano (ou nada, para usar a conversa)"
---

# Map — mapear um plano

Transformar um plano — um documento grande, com várias fases — num **task map**: uma pasta `agent_plans/<nome>/` no projeto onde o plano vira fases, cada fase vira tasks que cabem numa ou duas sessões de agente, e o estado vive no cabeçalho de cada task. Três scripts leem e mudam esse estado, o `plan.json` identifica o plano, e a skill `plan` do plugin, `/plan-relay-pt-br:plan <nome>`, abre cada sessão com o progresso e a escolha da próxima task. O map não cria skill nenhuma.

O modelo está em `<plugin>/template/`: `README.md` (o protocolo, com marcadores `{{…}}`), `_template.md` (a forma de uma task, que no plano se chama `_template.md`), `PHASE.md` (que no plano vira o `PHASE.md` de cada fase) e os scripts `status.sh`, `task.sh` e `map.sh`. Os scripts e o `_template.md` se copiam byte a byte pelo `copy.sh` do modelo; o `README.md` e o `PHASE.md` saem pelo `profile.sh` e se preenchem. O `README.md` e o `PHASE.md` têm blocos por perfil (`{{#full}}…{{/full}}`, `{{#lean}}…{{/lean}}`) que o `profile.sh` do modelo resolve ao copiar, para o plano receber um texto sem ramos mortos. O `selftest.sh` fica no modelo: prova os scripts de um plano sem tocar nele. O texto do modelo existe nas duas línguas: em `<plugin>/template/` o pt-BR, em `<plugin>/template/en/` o inglês, com os mesmos nomes de arquivo; os scripts de `template/en/` são os de `template/` só com a tabela em inglês, e o `copy.sh --lang` escolhe-os.

**O contrato.** Os nomes de arquivo e pasta, as chaves do cabeçalho (`Status:`, `Type:`, `Track:`, `Tier:`, `Repos:`, `Blocked by:`), os valores (`ready`, `draft`, `code`, `decision`…), os marcadores (`## Done when`, `## Log`, `Next step:`) e as chaves do `plan.json` são o que os scripts, a extensão e as skills procuram por nome: escrevem-se em inglês, exatamente como no modelo. O resto do texto — títulos, objetivos, passos, as seções livres da task — segue a língua do plano.

**A raiz do projeto** é a definida no `<plugin>/COMMANDS.md`, que a seção «Comandos» abaixo manda ler. Se essa raiz for o diretório pessoal do usuário, parar e perguntar onde fica o projeto. Todos os caminhos abaixo são relativos a ela; a seção «Comandos» diz como se escrevem.

## Comandos

Antes do primeiro comando, ler `<plugin>/COMMANDS.md` e segui-lo em cada comando desta skill. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão. Sem essa linha, parar antes de qualquer comando e dizer ao usuário: «A linha `plan-relay plugin root:` não está no contexto desta sessão: o hook `SessionStart` do plugin não rodou. Confira se o plugin está instalado e habilitado e abra uma sessão nova.»

As leituras dos `plan.json` são independentes: chamadas paralelas.

## 0. Conferir que o plano ainda não foi mapeado

Com argumento: o caminho do plano relativo à raiz (sem `./`). Ler cada `agent_plans/*/plan.json` e comparar o campo `source` com esse caminho.

Havendo um igual, **parar aqui**: dizer «Este plano já está mapeado em `agent_plans/<nome>/`», e que, para mapeá-lo de novo, o usuário apaga primeiro esse plano: pela extensão Plan Relay ou, sem ela, apagando a pasta `agent_plans/<nome>/` depois de conferir que nada nela falta guardar. Esta skill nunca apaga nem reescreve um plano existente.

**Origem que é uma ideia.** Quando o argumento está em `agent_plans/_ideas/` (`agent_plans/_ideas/<slug>.md`), a origem é uma ideia (na forma do modelo `<plugin>/template/idea.md`): ler o cabeçalho dela, as linhas antes do primeiro `# `.

- Com `Status: mapped`, **parar aqui** e dizer o plano da linha `Plan:` («Esta ideia já virou o plano `agent_plans/<nome>/`»): `mapped` é final, e mudanças daqui em diante vão para esse plano. Mapear de novo faz outro plano, com nome novo, e só se a pessoa pedir isso com essas palavras; nesse caso, seguir como uma ideia nova, sem tocar no plano antigo.
- Com `open`, `refining` ou `ready`, seguir. Guardar o `Open questions:` para o passo 3: um inteiro, ou desconhecido quando a linha falta ou o valor não é número.
- Sem `Status:` ou com outro valor: dizer que o cabeçalho está fora do contrato e parar.

O `source` do `plan.json` é o caminho da ideia, e a ideia fica onde está.

**Pronto quando**: nenhum `plan.json` tem este `source` (ou não há `agent_plans/`) e, numa ideia, o `Status:` não é `mapped`; ou a skill parou com o nome do plano existente. Sem argumento, o passo não se aplica.

## 1. Ler o plano e o repositório

Ler o plano por inteiro (o argumento, ou a conversa). Ler o `CLAUDE.md` ou `AGENTS.md` do repositório e a memória do projeto, quando houver: as convenções que eles fixam (idioma, commits, regras de segurança, o que é proibido) entram no protocolo do plano.

Para cada arquivo, comando ou sistema que o plano cita como existente, conferir que existe. Um plano afirma fatos que o código desmente; uma premissa errada vira decisão em aberto, nunca task construída sobre ela.

**Pronto quando**: o plano está lido, as convenções estão listadas, e cada premissa citada foi conferida ou está marcada como em aberto.

## 2. Desenhar o mapa

- **Nome da pasta:** ASCII minúsculo com hífens, recusado se já existir `agent_plans/<nome>/`. Havendo colisão, escolher outro nome e dizer por quê.
- **Fases:** em ordem, cada uma com o que entrega e por que vem nessa posição. A fase 0 é a fundação: decisões, pedidos a outras equipes (os que demoram vêm aqui, para rodarem em paralelo), pesquisas de que as outras dependem. Validar sobre o que já funciona antes de construir em cima.
- **Tasks:** cada uma cabe numa ou duas sessões e tem `Type:` (`code`, `research`, `prototype`, `decision`, `human`, `review`), `Track:`, `Tier:` nas que nascem `ready` e não são `human` (pelos critérios da seção «Níveis» do `README.md` do plano; o `draft` recebe o dele quando for detalhado), `Repos:` quando o trabalho cruza repositórios, e arestas `Blocked by:` só para o que genuinamente a trava.
- **Perfil:** `full` ou `lean`; vai para o `profile` do `plan.json`. `full` é o modelo completo: `spec/`, `research/`, `prototypes/`, `review` no fecho de toda fase, tasks adiante em `draft` e test-first. `lean` é para o plano pequeno: sem `spec/`, `research/` nem `prototypes/` (as decisões ficam numa seção «Decisões» do `PLAN.md`), `review` no fecho de fase só quando a entrega pede, todas as tasks escritas por inteiro, e sem test-first imposto. **A regra da proposta:** `lean` quando o desenho tem até duas fases e até dez tasks e nenhuma delas é `research` nem `prototype`; senão, `full`. A proposta é só proposta: quem aprova o desenho confirma ou troca o perfil.
- **Fecho de fase:** no `full`, toda fase termina numa task `review` que confere o que a fase aprendeu e detalha a fase seguinte; no `lean`, só a fase cuja entrega pede essa conferência.
- **Rascunho:** no `full`, as duas primeiras fases ficam com as tasks escritas por inteiro e as seguintes em `draft` (objetivo, arestas e notas para o detalhe), porque o que se aprende antes vai mudá-las; no `lean`, todas as tasks se escrevem por inteiro.
- **Língua do plano:** a do documento de origem ou, sem documento, a da conversa. O `language` do `plan.json` só aceita `pt-BR` ou `en`: para português, `pt-BR`; para inglês ou qualquer outra língua, `en`. Em outra língua (espanhol, alemão…), o texto que não é contrato se escreve nessa língua, o modelo vem de `<plugin>/template/en` e o `language` fica `en`, para os scripts responderem em inglês; as chaves do contrato continuam em inglês, como sempre. O desenho diz isso quando acontece.

**Pronto quando**: o nome não colide, toda task tem tipo, trilha e arestas, nenhuma aresta forma ciclo, o caminho crítico está identificado, a língua está escolhida e o perfil está proposto pela regra.

## 3. Submeter o desenho

Apresentar: o nome da pasta (`agent_plans/<nome>/`), as fases com a entrega de cada uma, a lista de tasks por fase (ID, título, tipo, bloqueado por), o caminho crítico, o que fica em `draft`, a língua e o perfil proposto, com a razão pela regra (por exemplo: «perfil proposto: `lean` — duas fases, sete tasks, nenhuma `research` nem `prototype`»). Numa ideia com `Open questions:` acima de 0 ou desconhecido, o desenho diz quantas perguntas sobram (ou que o número é desconhecido) e sugere afinar a ideia antes com `/plan-relay-pt-br:refine`, sem recusar: a pessoa pode aprovar mesmo assim, e as perguntas viram decisões em aberto no mapa. Perguntar se a ordem das fases está certa, se a granularidade está certa, se as arestas travam só o que devem, se a língua do plano é a certa, e se o perfil fica o proposto ou passa ao outro. Terminar a resposta aí e esperar.

**Pronto quando**: o usuário aprovou explicitamente, numa mensagem depois do desenho; o perfil é o que ele confirmou (o proposto, se ele aprovou sem trocar). Até lá não se cria nenhum arquivo nem pasta; uma sessão sem quem responda (`claude -p`) termina com o desenho.

## 4. Escrever a pasta

Tudo vive em `agent_plans/<nome>/`, salvo indicação em contrário. `{{PLAN_PATH}}` é `agent_plans/<nome>`. `<língua>` é a do desenho aprovado (`pt-BR` ou `en`), e `<modelo>` é a pasta do texto nessa língua: `<plugin>/template` num plano `pt-BR`, `<plugin>/template/en` num plano `en`.

1. Os três scripts e o `_template.md`, byte a byte, numa chamada que também cria a pasta:

   ```
   sh <plugin>/template/copy.sh --lang <língua> agent_plans/<nome>
   ```

   O `copy.sh` põe `status.sh`, `task.sh` e `map.sh` sem alterar e o `_template.md` da língua como `_template.md`. Nada de `cp` nem de reescrever esses arquivos com a ferramenta de escrita: o `<plugin>` fica fora do projeto, e a permissão recusa um `cp` de lá. Se ele sair com 1, um dos arquivos já existe: parar e dizer qual, sem sobrescrever.
2. `README.md` com os blocos do perfil confirmado já resolvidos, numa chamada (`<perfil>` é `full` ou `lean`):

   ```
   sh <plugin>/template/profile.sh <perfil> <modelo>/README.md agent_plans/<nome>/README.md
   ```

   Depois, no arquivo escrito: `{{PLAN_NAME}}` pelo nome da pasta, `{{PLAN_PATH}}` por `agent_plans/<nome>`, e `{{CONVENTIONS}}` pelas convenções do passo 1, uma por item, cada uma com a razão quando ela não é óbvia.
3. `PLAN.md`: o que é (com link para o plano de origem, que fica onde está), princípios, a tabela de fases, o caminho crítico, e o que fica fora de escopo e por quê. No `lean`, também a seção «Decisões», com as decisões que o plano já tomou, uma por entrada, com data e razão.
4. Só no `full`: `spec/decisions.md` com as decisões que o plano já tomou, uma por entrada, com data e razão; e na `spec/` o que o plano descreve como alvo, no presente.
5. `notes/` com um `README.md` de duas linhas sobre o que vive ali; no `full`, também `research/` e `prototypes/`, cada uma com o seu.
6. Por fase, `phase-<N>-<slug>/PHASE.md` gerado do `PHASE.md` do modelo pelo `profile.sh`, como o `README.md` (`sh <plugin>/template/profile.sh <perfil> <modelo>/PHASE.md agent_plans/<nome>/phase-<N>-<slug>/PHASE.md`, depois de `mkdir -p agent_plans/<nome>/phase-<N>-<slug>` numa chamada própria), e preenchido; e uma task por arquivo, `<ID>-<slug>.md`, a partir do `_template.md`, com o título `# <ID> - <título>`. IDs `F<fase>-<NN>`. Cada «Ler antes» aponta para arquivos reais; cada item do `## Done when` é verificável por comando ou artefato.
7. `plan.json`, com `created` pela saída de `date -u +%Y-%m-%dT%H:%MZ`, `source` igual ao do passo 0 (`null` quando o plano veio da conversa), `language` e `profile` do desenho aprovado, e `scripts_version` igual ao número da linha `# scripts_version: <N>` no topo do `status.sh` copiado (o número, sem aspas):

   ```json
   {
     "contract": 1,
     "name": "<nome>",
     "source": "<caminho do plano relativo à raiz>",
     "created": "<AAAA-MM-DDTHH:MMZ>",
     "language": "<pt-BR ou en>",
     "profile": "<full ou lean, o confirmado no passo 3>",
     "scripts_version": <N>
   }
   ```

8. `sh agent_plans/<nome>/map.sh`.

**Pronto quando**: `sh agent_plans/<nome>/status.sh --json` tem cada task com `group` diferente de `invalid` e nenhum ID marcado `(?)` em `waiting_on`, e no topo `language`, `profile` e `scripts_version` iguais aos do `plan.json`; o `MAP.md` não acusa ciclo, nenhum `{{` ficou no `README.md`, o `plan.json` passa em `jq .`, e cada caminho de «Ler antes» existe.

## 5. Provar numa cópia

`sh <plugin>/template/selftest.sh agent_plans/<nome>` copia a pasta para um diretório temporário e prova lá, numa só chamada: `status.sh` sem `(?)` nem estado inválido, `status.sh --json` válido e coerente com o texto, `map.sh` sem ciclo, `claim` recusado numa task bloqueada, `claim` numa livre grava `Started:` e o `status.sh` mostra a duração, `close` recusado com `## Done when` por marcar, `release` devolve a `ready`, o `profile` do `--json` igual ao do `plan.json` e, num plano `lean`, nenhuma pasta `spec/`, `research/` ou `prototypes/`. A cópia é apagada no fim; a pasta real não muda.

Uma falha é um defeito do mapa (aresta, cabeçalho, `Status:`) a corrigir antes de entregar — nunca um motivo para provar na pasta real.

Mostrar o `status.sh` real (a saída em texto, para a pessoa ler) e dizer como começar: `/plan-relay-pt-br:plan <nome>` para o briefing e a escolha, `/plan-relay-pt-br:plan <nome> <ID>` para uma task.

**Pronto quando**: o selftest termina em «tudo certo», e `/plan-relay-pt-br:plan <nome>` é o que a resposta ensina para mostrar o briefing.

## 5a. Marcar a ideia

Só quando a origem é uma ideia. Depois da prova na cópia, o cabeçalho dela passa a `mapped`, com o caminho do plano em `Plan:`, pelo script (nunca com as ferramentas de edição):

```
sh <plugin>/scripts/idea.sh status agent_plans/_ideas/<slug>.md mapped agent_plans/<nome>
```

**Pronto quando**: o cabeçalho da ideia tem `Status: mapped` e `Plan: agent_plans/<nome>` (sem `/` no fim), ou a origem não é uma ideia.

## 6. Commit do plano

Só quando a raiz é um repositório git (o `git rev-parse --show-toplevel` do início respondeu) e as convenções do passo 1 não o proíbem; senão, pular. Antes, `git check-ignore -q agent_plans/<nome>`: saiu com 0, a pasta do plano está no `.gitignore`, não há commit, e a resposta diz por quê. O plano versiona-se com o código (seção «Versionamento» do `README.md` do plano), e o primeiro commit é este: só a pasta do plano, por caminho, cada comando na sua chamada:

```
git add agent_plans/<nome>
git commit -m "<nome>: task map"
```

Numa origem que é ideia, antes do commit: `git check-ignore -q agent_plans/_ideas/<slug>.md`. Saiu com 1 (o projeto versiona as ideias): `git add agent_plans/_ideas/<slug>.md`, por caminho, para a marca `mapped` ir no mesmo commit do plano. Saiu com 0: a ideia fica fora do commit.

Nada de push: isso é do dono.

**Pronto quando**: `git status --short agent_plans/<nome>` não mostra nada, ou o passo não se aplica e a resposta final diz por quê.
