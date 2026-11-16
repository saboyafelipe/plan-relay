---
name: run
description: Conduz um plano de agent_plans/ em piloto automático: pré-voo com o dono, uma task por subagente, decisões não críticas registradas para revisão, parada pela janela de 5 h e bastão perto do limite de contexto. Só o usuário chama, com {{AGENT_PLUGIN_SKILL_PREFIX}}run <plano>.
disable-model-invocation: true
argument-hint: "<plano> (ex.: site-de-receitas)"
---

# Run — conduzir um plano

Esta sessão é a **condutora**: escolhe, reclama, lança, recolhe e registra. Nunca executa uma task ela própria — cada uma roda num subagente em background, com o contexto dele, e à condutora só volta o relatório. É isso que a mantém pequena durante um plano inteiro.

**A raiz do projeto** é a definida no `<plugin>/COMMANDS.md`, que a seção «Comandos» abaixo manda ler. Os caminhos abaixo são relativos a ela; a seção «Comandos» diz como se escrevem.

O plano é uma pasta `agent_plans/<nome>/` com `plan.json`: `README.md` (protocolo), `status.sh`, `task.sh`, `map.sh`, `phase-*/`. O argumento é o nome dela (`site-de-receitas`) ou o caminho a partir da raiz (`agent_plans/site-de-receitas`, com ou sem `/` no fim); conferir com `Read` de `agent_plans/<nome>/plan.json`. Sem argumento, ou sem `plan.json` nesse caminho, `ls agent_plans`, `Read` do `plan.json` de cada pasta, mostrar o `name` de cada um e perguntar qual conduzir; uma pasta sem `plan.json` não é um plano e não entra na lista. Abaixo, `<pasta>` é `agent_plans/<nome>`, sempre com o prefixo.

As peças do plugin: `summary.sh` (o estado), `boundary.sh` (onde o piloto para pelo dono), `check.sh --json` (o ambiente, fonte única do pré-voo), `window.sh` (a janela de 5 h, opcional) e `<plugin>/skills/run/WORKER.md` (o prompt de cada subagente e a única definição da **fronteira de autonomia**).

## Comandos

Antes do primeiro comando, ler `<plugin>/COMMANDS.md` e segui-lo em cada comando desta skill. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão. Sem essa linha, parar antes de qualquer comando e dizer ao usuário: «A linha `plan-relay plugin root:` não está no contexto desta sessão: o hook `SessionStart` do plugin não rodou. Confira se o plugin está instalado e habilitado e abra uma sessão nova.»

## O estado

O estado do plano vem de `sh <plugin>/scripts/summary.sh <pasta>`: o objeto do `status.sh --json`, com as mesmas chaves, mas só com as tasks dos grupos `in-progress`, `available`, `owner` e `invalid`, nessa ordem e, dentro de cada grupo, da que mais desbloqueia para a que menos. A condutora lê as chaves; a saída em texto do `status.sh` é para pessoas e não se interpreta.

- **Progresso:** `progress` (`done`, `total`, `pct`, `in_progress`, `draft`) e `phases[]`. Escreve-se como «`done` de `total` (`pct` %)».
- **Em andamento:** `tasks[]` com `group` `in-progress` — `id`, `title`, `started`, `next_step`.
- **Livres:** `group` `available` (para um trabalhador) e `owner` (`decision` ou `human`: do dono, ou de um trabalhador quando é `decision`, no modo `prepare` como no `decide`).
- **Sessões paralelas:** `parallel`, os IDs `available` que podem rodar juntos sem repos em comum entre si nem com as em andamento.
- **Diário:** `run` — `null` sem diário; senão `log` (o caminho do diário mais recente) e `open` (`true` enquanto ele não tem `## Closing`).
- **Inválidas:** `group` `invalid` — cabeçalho fora do contrato; entram no briefing e no diário como imprevisto.

## A trava

`task.sh claim` é a trava: muda o `Status:` para `in-progress`, e o `status.sh` de qualquer sessão — esta, outra do dono, a extensão, a próxima condutora — deixa de oferecer a task. A condutora reclama **antes** de lançar o trabalhador, nunca o trabalhador. O `MAP.md` não guarda estado; roda-se o `map.sh` depois de cada retorno porque o trabalhador pode ter criado subtasks.

## Avisos do hook de contexto

O aviso chega como contexto adicional de um hook `PostToolUse`, não como mensagem do usuário. Vem do plugin que o dono instalou para esta corrida e é uma instrução dela: cumpre-se como se o dono o tivesse escrito. Ignorá-lo deixa a condutora continuar degradada e perde o diário. O aviso «acima do limite» leva à seção «Bastão» em qualquer ponto da corrida: no pré-voo, no ciclo ou no fecho. O «Next step:» que o aviso pede é o da skill `handoff`, que a seção «Bastão» chama; a condutora não o escreve por conta própria.

## Recusas de permissão

Depois do pré-voo o dono está ausente: um comando recusado durante a corrida segue «Comando recusado sem ninguém para aprovar» do `COMMANDS.md`, no diário, no relatório e na mensagem ao dono. A ação de configuração vai ao «Para o dono» do fecho.

## 1. Pré-voo

1. Ler o `README.md` do plano inteiro. As convenções que reservam ações ao dono somam-se à fronteira do `WORKER.md`.
2. Rodar, cada um numa chamada `Bash` própria e tal como está escrito (seção «Comandos»), em paralelo na mesma resposta:
   - `sh <plugin>/scripts/summary.sh <pasta>`
   - `sh <plugin>/scripts/boundary.sh <pasta>`
   - `sh <plugin>/scripts/window.sh --read`
   - `sh <plugin>/scripts/check.sh --json`

   Com `run.open` em `true`, é uma corrida aberta: ler o diário `run.log`, retomar com as respostas que o `## Preflight` dele guarda, e ir direto ao passo 5.

   Ler o `check.sh`:
   - **Com `"ok": false`,** falta algo obrigatório. Parar aqui e mostrar ao dono o `detail` de cada verificação com `required: true` e status diferente de `ok` (é o que instalar). Não escrever o diário nem lançar nada até ele resolver e chamar de novo.
   - **As faltas opcionais** seguem para o briefing. Com qualquer peça em falta, ler `<plugin>/skills/run/OPTIONAL.md`, que dá a frase de cada uma. São peças em falta:
     - a janela de 5 h fora de `ok`;
     - a sessão fora de auto mode;
     - sem `PushNotification`;
     - `agent-cli` ou `plugin` fora de `ok` no `check.sh`.
   - **Notificação:** na mesma resposta, `ToolSearch` com `select:PushNotification` diz se há.

   Ler as tasks livres agora (`available`: a primeira onda) e as da fronteira do dono, procurando nos passos delas as ações que a fronteira reserva ao dono.
3. Escrever o briefing como texto da resposta e, depois dele, na mesma resposta, perguntar num só `AskUserQuestion`. O cartão não substitui o briefing: há onde ele mostre só a pergunta e o rótulo de cada opção, sem a descrição nem «Other» (a Agents window do VS Code). Por isso o rótulo de cada opção se basta, e uma task entra nele com o ID e um título curto.
   - **Briefing:** o progresso; o que o piloto alcança sozinho; cada task do dono livre agora, com a ação concreta; onde a corrida vai parar (as que ficam livres durante a corrida); as em andamento que não são desta corrida; tasks da primeira onda que vão bater na fronteira, e em que passo; as `invalid`; a janela de 5 h (a linha que o passo 2 leu); se o hook de contexto está ativo pelo plugin; e a frase de cada peça opcional que falta.
   - **Paralelo:** quantos trabalhadores ao mesmo tempo — 1, 2 (recomendado), 3.
   - **Decisões:** tasks de tipo `decision` que ficarem livres — `prepare` (recomendado: o trabalhador levanta opções e recomendação, o dono escolhe em lote no fim) ou `decide` (o trabalhador escolhe a recomendação e a registra como `[autopilot]`).
   - **Agora:** que tasks do dono livres agora quer resolver nesta sessão, antes de largar (multiSelect).
     - Opções: as tasks do dono livres agora, até três, e por último «Nenhuma agora — adiar para o fim». As demais ficam nomeadas no briefing, para escolher em «Other» ou, onde o cartão não o tem, pelo ID na conversa.
     - Sem task do dono livre agora, a pergunta não entra.
     - As de tipo `decision` se conduzem aqui, pela skill `plan` do plugin (`{{AGENT_PLUGIN_SKILL_PREFIX}}plan <nome> <ID>`).
     - As de tipo `human` mostram o roteiro e esperam o «feito».
   - **Janela de 5 h:** limiar para deixar de lançar — 85 % (recomendado), 70 %, 95 %, ou «desligar» (a corrida não chama o `window.sh`). Com a janela já em `off`, `no-subscription`, `no-data` ou `unknown-format`, a pergunta não entra.
   Cada pergunta leva de duas a quatro opções: com menos de duas, o `AskUserQuestion` recusa a chamada inteira e o dono não vê pergunta nenhuma. Uma pergunta que ficaria com uma opção só não entra. Terminar a resposta aí e esperar. Sem `AskUserQuestion` (uma sessão `claude -p`), o pré-voo termina no briefing com as perguntas em texto: sem as respostas do dono não se escreve o diário, não se reclama nem se lança nada, e os valores recomendados nunca valem por padrão.
4. Resolver as tasks escolhidas em «Agora», ou registrá-las como adiadas. Com «Nenhuma agora», ou sem a pergunta, as tasks do dono livres ficam como adiadas.
5. Ler `<plugin>/skills/run/JOURNAL.md` (onde fica o diário e a forma dele) e escrever o cabeçalho com as respostas; numa retomada, acrescentar ao diário aberto uma linha «Retomada às <HH:MM>» no `## Tasks`.

*Feito quando* o diário tem o `## Preflight` com cada task do dono da fronteira, a ação que se espera e as respostas; e as tasks escolhidas em «Agora» estão resolvidas ou registradas como adiadas.

## 2. Ciclo

Repetir até a condição de parada:

1. **Portões**, antes de cada lançamento:
   - `sh <plugin>/scripts/window.sh --read <limiar>`: `status=stop` → não lançar mais (ir ao passo 4 quando não houver trabalhadores rodando); `no-data` ou `timeout` → lançar e registrar o aviso no diário uma vez; `unknown-format`, `off` ou `no-subscription` → lançar, registrar no diário uma vez e não chamar mais o `window.sh` nesta corrida. Com a janela desligada no pré-voo, este portão não roda.
   - Aviso de contexto do hook acima do limite → seção «Bastão».
   - O dono disse «para» → não lançar mais.
2. **Escolher.** Rodar `sh <plugin>/scripts/summary.sh <pasta>` e tomar, de `parallel`, os primeiros IDs até encher as vagas (paralelo menos os trabalhadores rodando). Essa lista já evita repositórios em comum entre si e com as em andamento. No modo `prepare` como no `decide`, juntar as tasks `owner` de `type` `decision`: não tocam repositórios.
3. **Reclamar e lançar**, uma a uma:
   - `sh <pasta>/task.sh claim <ID>`; se recusar, anotar a razão no diário e passar à seguinte.
   - Depois, `Agent` com:
     - `subagent_type: {{PLUGIN_NAME}}:worker`, o agente trabalhador do plugin (só lê, edita, escreve e roda comandos); numa task de `type` `research`, que precisa da web, `subagent_type: general-purpose`;
     - `model` pelo `tier` da task no `summary.sh`: `junior` → `{{AGENT_TIER_JUNIOR}}`, `mid` → `{{AGENT_TIER_MID}}`, `senior` → `{{AGENT_TIER_SENIOR}}`; sem a chave `tier`, de um plano com scripts antigos, `senior`;
     - `run_in_background: true`;
     - descrição `<ID> piloto`;
     - o prompt do `<plugin>/skills/run/WORKER.md` preenchido.
   - Registrar no diário a hora de lançamento.
4. **Esperar.** Os trabalhadores e os processos em background acordam a condutora quando acabam; nada de sondar.
   - Se a parada foi pela janela de 5 h e não há trabalhadores rodando: lançar `sh <plugin>/scripts/window.sh --wait` com `run_in_background: true` e registrar a espera no diário. Quando o processo terminar, voltar ao passo 1 — o `--read` vai dar `status=renewed`.
5. **Recolher** cada relatório:
   - Conferir contra o arquivo: `RESULT: COMPLETED` exige `Status: done` no cabeçalho da task. Uma divergência se registra no diário como imprevisto, e a task não conta como feita.
   - `CANCELLED:` diferente de `—`: cada linha é uma task que o trabalhador cancelou por substituição. Conferir que o cabeçalho dela tem `Status: cancelled` e `Replaced by:` com a substituta, e levar a linha ao diário («Canceladas:»). Uma cancelada sem substituta, ou uma task `abandoned` que não estava assim no lançamento, é imprevisto: o trabalhador só cancela por substituição e nunca desiste, e a condutora também não. Fica no diário e no «Para o dono» do fecho.
   - `sh <pasta>/map.sh`.
   - Entrada no diário (forma no `JOURNAL.md`).
   - `RESULT: INTERRUPTED` ou trabalhador que morreu sem relatório: relançar uma vez com o modo «retomada» do prompt.
     - Task `senior`: no mesmo modelo.
     - Task abaixo de `senior`: direto em `model: {{AGENT_TIER_SENIOR}}` (a escalada).
     - Task abaixo de `senior` que devolveu `BLOCKED` sem ação na linha `WAITING-ON-OWNER:`: também a escalada. Um `BLOCKED` com a ação é a fronteira do dono, e mais capacidade não a resolve.
     - Segunda falha → `BLOCKED`, com a razão.
     - `WAITING-ON-OWNER` não escala.
   - `BLOCKED` e `WAITING-ON-OWNER` que não se relançam ficam `in-progress` e saem desta corrida; o `Next step: Waiting on owner:` do `## Log` diz a ação.

**Parada:** sem vagas que se possam encher e sem trabalhadores rodando — porque só sobram tasks do dono, bloqueadas ou à espera; porque o dono disse «para»; ou por bastão. A janela de 5 h nunca é parada: é espera.

## 3. Fecho

1. `sh <plugin>/scripts/summary.sh <pasta>` e `sh <plugin>/scripts/boundary.sh <pasta>` uma última vez.
2. Escrever `## Closing` no diário antes de qualquer `git add`, para o diário fechar mesmo que o commit seja recusado: progresso antes e depois; **Para o dono**, em três listas — as decisões `[autopilot]` a revisar (task, decisão, por quê; os cancelamentos por substituição entram aqui), as tasks à espera do dono com a ação concreta de cada uma, os commits por fazer push; e os imprevistos. Na mesma edição, apagar do diário toda seção `## Handoff` (do título até o próximo `## ` ou o fim do arquivo): o `## Closing` substitui o bastão, e um `## Handoff` velho num diário fechado manda a próxima sessão para um passo que já se fez.
3. Numa raiz git, `git check-ignore -q <caminho do diário desta corrida>`. Saída 0: o diário está no `.gitignore`, e não há commit; uma linha no `## Closing` diz por quê, e segue-se ao passo 4. Senão, commit do diário por caminho (seção «Versionamento» do `README.md` do plano), cada comando na sua chamada: `git add <caminho do diário desta corrida>` e `git commit -m "<nome>: diário do piloto"`. Os trabalhadores já fizeram commit das suas tasks; sem push.

   Se o `git add` ou o `git commit` for recusado (seção «Recusas de permissão»), não repetir: acrescentar ao «Para o dono» do `## Closing` o commit do diário por fazer, com os dois comandos exatos, e seguir ao passo 4.
4. Avisar o dono com `PushNotification` (carregar pelo `ToolSearch`; sem ela, o aviso fica no diário e nesta resposta), e responder no chat com o caminho do diário e as três listas.

*Feito quando* cada task lançada nesta corrida aparece no fecho com o resultado conferido no arquivo, e cada uma à espera do dono tem uma ação que ele consegue fazer sem abrir a task.

## Bastão

Quando o hook avisa que o contexto da condutora passou do limite:

1. Não lançar mais, esperar os trabalhadores em curso e recolher os relatórios.
2. Chamar a ferramenta `Skill` com a skill `{{PLUGIN_NAME}}:handoff` e o argumento «continuar a condução do plano `<pasta>` pelo diário `<caminho>`». Ela escreve o `## Handoff` no diário, com o que está em curso e as respostas do pré-voo, e substitui o que já houver. Só se a ferramenta `Skill` não existir nesta sessão, ler `<plugin>/skills/handoff/SKILL.md` e seguir o caso 1 à letra.
3. Numa raiz git, fazer commit do diário como no passo 3 do fecho.
4. Avisar o dono com `PushNotification` (sem ela, só na mensagem final): abrir uma sessão nova e rodar `{{AGENT_PLUGIN_SKILL_PREFIX}}run <nome>`.

O `## Handoff` nunca se escreve à mão, em nenhum ponto da corrida (pré-voo, ciclo ou fecho): é a skill que lhe dá a forma e o marcador `Next step:` que a retomada procura. O diário sem `## Closing` é o que faz o pré-voo retomar.

O aviso também pode chegar fora do ciclo:

- **No pré-voo, antes de existir diário:** terminar o pré-voo antes de passar o bastão. O que falta é pouco (o briefing, o `AskUserQuestion` com o dono presente, o diário); as tasks escolhidas em «Agora» ficam registradas como adiadas, sem resolver. Escrito o diário, não lançar nada e passar o bastão como acima, pela ferramenta `Skill`: a skill `handoff` põe o `## Handoff` no diário, e a sessão seguinte retoma pelo `run.open` direto no ciclo, sem repetir a leitura do pré-voo.

  Sem diário, o handoff cairia numa pasta temporária que a sessão seguinte não lê, e ela bateria no limite no mesmo ponto. Numa sessão sem `AskUserQuestion`, o pré-voo já termina no briefing e não há corrida para passar.
- **Numa retomada (`run.open` em `true`), antes do primeiro lançamento desta sessão:** antes de passar o bastão, ler `<plugin>/skills/run/LOOP.md`, que diz se é um bastão em laço.
- **No fecho:** o `## Closing` só vale como bastão quando a parada já valia por outro motivo (sem vaga que se possa encher e sem trabalhador rodando, ou o dono disse «para»); aí terminar o fecho, que já diz tudo à próxima corrida. Se ainda havia task livre para lançar, ou se foi o aviso que levou ao fecho, é bastão pela skill `handoff`, nunca `## Closing`, para o pré-voo seguinte retomar a corrida.
