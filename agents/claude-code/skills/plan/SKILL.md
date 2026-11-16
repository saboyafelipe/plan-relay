---
name: plan
description: Ponto de entrada de um plano de agent_plans/: progresso, o que está em andamento e o que roda em paralelo; executa ou retoma uma task (F1-03…); cria task ou subtask; cancela, desiste e reabre. Usar quando perguntarem o que há para fazer num plano, quando nomearem uma task, ou pedirem para continuar, criar, cancelar, desistir de ou reabrir uma task.
argument-hint: "<plano> [ID]"
---

# Plan

Uma skill para todos os planos do projeto: `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <plano> [ID]`. O plano vive em `agent_plans/<plano>/`; o protocolo está no `README.md` dessa pasta e é a única fonte. Esta skill escolhe o plano e o ramo e põe o protocolo para andar.

**A raiz do projeto** é a definida no `<plugin>/COMMANDS.md`, que a seção «Comandos» abaixo manda ler. Os caminhos abaixo são relativos a ela.

## Comandos

A primeira chamada desta skill é `Read` de `<plugin>/COMMANDS.md`, e ele vale para cada comando dela. Na prática: cada chamada `Bash` é um comando só, copiado de um passo abaixo com `<plano>` por extenso; um arquivo se lê com `Read`. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão; sem essa linha, seguir mesmo assim, com um comando literal por chamada. `<plano>` se troca pelo nome da pasta antes de rodar, por extenso em cada chamada.

## 0. Escolher o plano

O argumento é `<plano> [ID]`. `<plano>` é o nome de uma pasta de `agent_plans/` (`site-de-receitas`) ou o caminho dela (`agent_plans/site-de-receitas`, com ou sem `/` no fim); um plano é uma pasta com `plan.json`.

- **Com `<plano>`:** ler `agent_plans/<plano>/plan.json` com `Read`. Não existindo, dizer que o plano não foi achado, listar os que existem (como no caso «sem argumento») e parar.
- **Só um ID** (o primeiro argumento tem a forma `F<n>-<nn>`, como `F1-03` ou `F1-03.1`, e não é pasta de `agent_plans/`): é o ID de uma task; o plano se escolhe como no caso «sem argumento».
- **Sem argumento:** `ls agent_plans` numa chamada e, para cada pasta, `Read` de `agent_plans/<pasta>/plan.json`, em chamadas paralelas; uma pasta sem `plan.json` não é plano.
  - Um plano só: usar esse.
  - Mais de um: rodar `sh agent_plans/<plano>/status.sh --json` de cada um (chamadas paralelas) e perguntar com a ferramenta de pergunta ao usuário (`{{AGENT_ASK_TOOL}}`), cabeçalho `Plano`, «Que plano quer abrir?»: uma opção por plano (até quatro; os demais nomeados na resposta, para escolher em «Other»), rótulo o `name` do `plan.json`, descrição `done`/`total` (`pct` %) e quantas tasks `in-progress`. Sem a ferramenta, ver «Sem cartão».
  - Nenhum: dizer que o projeto não tem plano e que um documento vira plano com `{{AGENT_PLUGIN_SKILL_PREFIX}}map <caminho do .md>`; parar.

Abaixo, `<plano>` é o nome da pasta escolhida.

Um pedido de conduzir o plano sozinho, em piloto automático, não é desta skill: dizer que é o `{{AGENT_PLUGIN_SKILL_PREFIX}}run <plano>`, que só o usuário chama, e parar.

*Feito quando* há um plano escolhido com `plan.json`, ou a skill parou dizendo por quê.

## O estado

O estado é o que os scripts do plano dizem, nunca o que a memória ou a conversa dizem:
- `sh agent_plans/<plano>/status.sh --json` — o estado inteiro num objeto JSON, lido pelas chaves (a saída em texto, sem `--json`, é para pessoas e não se interpreta):
  - `progress` — `done`, `total`, `pct`, `in_progress`, `draft`; `phases[]` com `dir`, `title`, `done`, `total` e, só na fase que ficou abandonada, `abandoned: true`.
  - `tasks[]` — `id`, `title`, `status`, `type`, `group`, `unblocks`, `started`, `next_step`, `waiting_on`, `file`; só quando o cabeçalho tem a chave, `replaced_by`, `given_up_by` e `given_up_with`. O `group` diz o que fazer com a task: `in-progress`, `available` (livre para uma sessão), `owner` (livre, mas `decision` ou `human`: precisa de você), `blocked`, `draft`, `done`, `cancelled` (trocada por outra), `abandoned` (o dono desistiu), `invalid`.
  - `parallel` — os IDs que podem rodar em sessões ao mesmo tempo, sem repos em comum entre si nem com as em andamento.
- `sh agent_plans/<plano>/task.sh claim <ID>`, `close <ID>`, `release <ID>`, `cancel <ID>`, `giveup <ID>` ou `reopen <ID>` — a única forma de mudar `Status:`.
- `sh agent_plans/<plano>/map.sh` — reescreve o `MAP.md` depois de criar ou renomear tasks.

**As opções** são as tasks com `group` `available`, da que mais desbloqueia (`unblocks`) para a que menos, seguidas das `owner`, na mesma ordem.

**Sem cartão:** onde a ferramenta de pergunta não existe, a mesma pergunta vai em texto, com as mesmas opções em lista numerada, na ordem dada, a primeira marcada como recomendada; a escolha vem pelo ID (ou pelo nome do plano) na conversa. Nada entra na lista que o cartão não teria.

Com um pedido de cancelar uma task, ramo 5; de desistir dela ou abandoná-la, ramo 6; de reabri-la ou desfazer a desistência, ramo 7. Senão: com um ID no argumento, ramo 2; com «continua», «continue» ou «retoma» sem ID, ramo 3; com um pedido de criar task ou subtask, ramo 4; sem nada disso, ramo 1.

## Ramo 1 — sem task nomeada: briefing e escolha

1. Rodar `sh agent_plans/<plano>/status.sh --json`.
2. Escrever o briefing, curto, como texto da resposta, antes do cartão. O cartão não o substitui: há onde ele mostre só a pergunta e o rótulo de cada opção, sem a descrição nem «Other» (a Agents window do VS Code).
   - **Progresso:** `done` de `total` (`pct` %), e uma linha por fase com `done`/`total`.
   - **Em andamento:** cada task `in-progress`, há quanto tempo (desde `started`) e o `next_step`. Uma sem `started` ou com `next_step` nulo é um aviso.
   - **Em paralelo:** os IDs de `parallel`, com os prompts `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <plano> <ID>` para outras sessões.
   - **Precisa de você:** cada task `owner`, com a ação concreta tirada do objetivo dela.
   - **Atenção:** cada task `invalid` (cabeçalho fora do contrato) e cada ID em `waiting_on` marcado `(?)`, que não existe como arquivo.
3. Mostrar o cartão de escolha com a ferramenta de pergunta ao usuário (`{{AGENT_ASK_TOOL}}`): uma pergunta de escolha única, cabeçalho `Task`, «Que task quer iniciar nesta sessão?».
   - Opções: as primeiras quatro opções, na ordem acima; a primeira com « (Recomendada)» no fim do rótulo.
   - Rótulo: `<ID>` e um título curto, em toda opção, também na recomendada (`F1-01 Índice de ingredientes (Recomendada)`): o rótulo se basta sem a descrição. Descrição: o título completo, `desbloqueia <n>`, o tipo, e «precisa de você» quando o grupo é `owner`.
   - Mais de quatro opções: nomear as restantes no briefing; escolhem-se em «Other» ou, onde o cartão não o tem, pelo ID na conversa.
   - Nenhuma opção: sem cartão; dizer o que está em andamento e o que se desbloqueia a seguir.
   - Sem a ferramenta: ver «Sem cartão».
4. Com a resposta, seguir o ramo 2.

*Feito quando* o briefing cobre cada task `in-progress` e cada opção, e houve escolha (ou não havia o que escolher).

## Ramo 2 — task nomeada: executar ou retomar

1. Ler `agent_plans/<plano>/README.md` inteiro e a task.
2. `ready`: `sh agent_plans/<plano>/task.sh claim <ID>`; se recusar, mostrar a razão e voltar ao ramo 1. `in-progress`: retomar do `Next step:`; se o `## Log` não é desta linha de trabalho, perguntar antes de continuar. `cancelled`: dizer que foi cancelada e, com `Replaced by:`, oferecer a substituta. `abandoned`: dizer que o dono desistiu dela e que reabrir é o ramo 7, só se ele pedir.
3. Abrir a entrada da sessão no `## Log` da task, como manda o passo «Reclamar» da «Sessão de trabalho» do README, antes de qualquer outra edição.
4. Seguir a «Sessão de trabalho» do README, de «Ler» a «Autocrítica».
5. «Fechar»: completar a entrada do `## Log` e rodar `sh agent_plans/<plano>/task.sh close <ID>`. Sessão interrompida: `Next step:` no `## Log`, `Status:` como está.
6. Rodar `sh agent_plans/<plano>/status.sh --json` e dizer o que ficou livre por causa desta task.

*Feito quando* o `task.sh close` aceitou, ou a task está `in-progress` com um `Next step:` concreto.

## Ramo 3 — "continua" sem ID

Uma task `in-progress`: ramo 2 com ela. Várias: cartão com as `in-progress` (até quatro, rótulo com o ID e há quanto tempo; sem a ferramenta, «Sem cartão»). Nenhuma: ramo 1.

## Ramo 4 — criar uma task ou subtask

Seguir «Subtasks» do README do plano; uma task nova que não é subtask entra na fase certa com o próximo número livre. A task nova, salvo `human`, leva `Tier:` pelos critérios da seção «Níveis» do README do plano (num plano `en`, «Tiers»; num plano mapeado antes dela, os de «Níveis» em `<plugin>/template/README.md` ou, num plano `en`, «Tiers» em `<plugin>/template/en/README.md`). Fechar com `map.sh` e com o `status.sh --json` sem task `invalid` nem ID marcado `(?)` em `waiting_on`.

## Cancelar, desistir e reabrir

Dois atos com donos diferentes:
- **Cancelar** é do agente: troca uma task por outra sem perder trabalho. Dá `cancelled`.
- **Desistir** é do dono: tira a task do plano junto com tudo o que dependia dela, em cascata. Dá `abandoned`.

O motivo vai entre aspas duplas, num comando literal (`--reason "Sem máquina Windows disponível"`), sem `$`, crases nem aspas duplas dentro. Quem confere o motivo é o `task.sh`: um motivo que não vale é recusado com «O motivo não é válido.», sem mudar nada; aí pedir outro motivo.

## Ramo 5 — cancelar uma task

Quando a task deixou de fazer sentido como está escrita: o trabalho mudou de forma, foi absorvido por outra, ou a premissa caiu. Cancelar não é desistir: se o dono não quer o trabalho feito, é o ramo 6.

1. Ler a task e escrever o motivo numa frase.
2. Decidir se o trabalho ainda precisa ser feito noutra forma. Se precisa, criar a substituta pelo ramo 4, com o objetivo corrigido; ela normalmente herda o `Blocked by:` da antiga.
3. Rodar `sh agent_plans/<plano>/task.sh cancel <ID> --reason "<motivo>"`, com `--replaced-by <substituta>` quando houver. Recusas:
   - **dependentes vivas** (a mensagem as nomeia): o verbo nunca cancela em cascata. Sem substituta, criá-la pelo ramo 4. Em cada dependente nomeada, trocar no `Blocked by:` o ID antigo pelo da substituta (com `Edit`, só essa linha). Rodar de novo com `--replaced-by`;
   - **motivo inválido:** reescrever o motivo;
   - **outra recusa** (a task está `done`, `cancelled` ou `abandoned`; a substituta não serve): mostrar a mensagem e parar.
4. `sh agent_plans/<plano>/map.sh` e `sh agent_plans/<plano>/status.sh --json`, sem task `invalid` nem `(?)` em `waiting_on`.
5. Dizer o que foi cancelado, a substituta e as dependentes religadas.

*Feito quando* o `task.sh cancel` aceitou e cada dependente que citava a task cita a substituta.

## Ramo 6 — desistir de uma task (só a pedido do dono)

O agente nunca desiste por conta própria e nunca propõe a desistência como passo seu: se achar que uma task devia sair do plano, diz por quê, e quem decide é o dono. Este ramo só roda quando o dono pediu, nesta conversa, para desistir de uma task nomeada.

1. Rodar `sh agent_plans/<plano>/task.sh giveup <ID> --json`. É a prévia: não muda nada. Recusou (a raiz não está `ready` nem `draft`, ou cairiam tasks que já começaram ou terminaram): mostrar a mensagem e parar.
2. Mostrar o grafo inteiro, desenhado a partir do JSON e não da saída em texto:
   - **em destaque, no topo:** o total, que é o número de itens de `falls` («Desistir da F4-07 abandona 6 tasks»), e cada fase de `abandoned_phases` («a fase `phase-9-zcode` fica inteira abandonada»);
   - **uma linha por item de `falls`, na ordem dada:** recuo de dois espaços por `depth`, `<id> — <title> (<phase>)`, «rascunho» quando `status` é `draft`, e «também depende de X, Y» quando `also_depends_on` não está vazio.
3. Pedir o motivo, se o pedido não o trouxe.
4. Pedir o «sim» com a ferramenta de pergunta ao usuário (`{{AGENT_ASK_TOOL}}`), cabeçalho `Desistir`. A pergunta se lê sozinha: «Desistir da <ID> e de mais <n> tasks (<fases abandonadas, se houver>), com o motivo «<motivo>»?». Opções: «Sim, desistir» e «Não». Sem a ferramenta, pedir na conversa e aceitar só um «sim» explícito. Qualquer outra resposta: parar sem mudar nada.
5. Rodar `sh agent_plans/<plano>/task.sh giveup <ID> --reason "<motivo>" --yes`. Se recusar o motivo, voltar ao passo 3; o «sim» vale para o mesmo grafo. Outra recusa: o plano mudou depois da prévia; voltar ao passo 1.
6. `sh agent_plans/<plano>/map.sh` e `sh agent_plans/<plano>/status.sh --json`, e dizer o que caiu e como desfazer (ramo 7).

*Feito quando* o dono viu o grafo, deu o «sim» e o `task.sh giveup --yes` aceitou; ou a skill parou sem mudar nada.

## Ramo 7 — reabrir uma desistência

Reabrir desfaz uma decisão do dono: só a pedido dele. Uma task `cancelled` não se reabre.

1. Rodar `sh agent_plans/<plano>/status.sh --json`. A task tem de estar `abandoned`. Com `given_up_with`, ela caiu junto com outra: dizer que se reabre a raiz (o valor de `given_up_with`) e seguir com ela, se o dono confirmar.
2. Mostrar o que volta: a raiz e cada task com `given_up_with` igual a ela. As que estavam canceladas ou abandonadas antes ficam como estão.
3. Pedir o «sim» com `{{AGENT_ASK_TOOL}}`, cabeçalho `Reabrir`: «Reabrir a <ID> e mais <n> tasks?», opções «Sim, reabrir» e «Não». O `reopen` não tem prévia nem `--yes`: a confirmação é esta.
4. Rodar `sh agent_plans/<plano>/task.sh reopen <ID>`; depois `map.sh` e `status.sh --json`, e dizer o que voltou a `ready` ou `draft`.

*Feito quando* o `task.sh reopen` aceitou, ou a skill parou sem mudar nada.
