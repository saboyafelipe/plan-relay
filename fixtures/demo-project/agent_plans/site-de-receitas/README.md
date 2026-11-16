# site-de-receitas — protocolo de execução

O que se quer construir e por quê está no [PLAN.md](PLAN.md). Este arquivo diz **como se trabalha**.

**Como se começa:** numa sessão de agente aberta na raiz do repositório, `/plan-relay-pt-br:plan site-de-receitas` mostra o progresso, o que está em andamento e há quanto tempo, e oferece a escolha da próxima task; `/plan-relay-pt-br:plan site-de-receitas <ID>` executa ou retoma uma task.

O trabalho divide-se em fases e em tasks que cabem numa ou duas sessões de agente. Cada task é autossuficiente: diz o que ler, o que entregar, como provar que acabou e onde a próxima sessão retoma, mesmo dias depois e sem memória desta.

A `spec/` é a fonte da verdade do que se constrói; a task diz o que fazer agora. Quando as duas divergirem, a spec vence, e a divergência vai para o `## Log` da task ou vira uma edição da spec.

## Estrutura

```
agent_plans/site-de-receitas/
  README.md         ← este protocolo
  PLAN.md           ← o que é, princípios, fases, fora de escopo
  MAP.md            ← todas as tasks por fase e o caminho crítico (gerado por map.sh)
  _template.md      ← a forma de uma task
  plan.json         ← nome, documento de origem e versão do contrato
  status.sh         ← progresso, em andamento (e há quanto tempo), livres, sessões paralelas, bloqueadas; --json para máquinas
  task.sh           ← muda o estado de uma task: claim, close, release
  map.sh            ← reescreve o MAP.md a partir dos cabeçalhos
  spec/             ← o que se constrói; decisões em spec/decisions.md
  research/         ← pesquisas citadas (P01, P02…)
  prototypes/       ← esboços descartáveis; só as lições passam para a spec
  notes/            ← medições e achados longos; diário do piloto em notes/run-YYYY-MM-DD.md
  phase-N-<slug>/   ← PHASE.md e as tasks da fase
```

Caminhos citados nas tasks são relativos à raiz do repositório.

As fases dão a ordem de prioridade; o que decide se uma task pode começar é só a linha `Blocked by:`. Tasks sem aresta entre si correm em paralelo, em sessões diferentes, em qualquer ordem.

## Cabeçalho

Toda task abre com o bloco de papéis, antes do título, e `Status:` é sempre a primeira linha:

```
Status: ready
Type: code
Track: <trilha>
Repos: <repo-a>, <repo-b>
Blocked by: F1-02, F0-02

# F1-03 - <título>
```

- **Status:** `draft` (objetivo e arestas escritos, passos por detalhar; não se começa) · `ready` · `in-progress` · `done` · `cancelled` (motivo no `## Log`).
- **Type:** ver [Tipos](#tipos).
- **Track:** o fio de trabalho, para filtrar o `status.sh`.
- **Repos:** os repositórios que a task altera; o `status.sh` usa-os para sugerir sessões paralelas sem conflito. Omitir quando não altera nenhum.
- **Blocked by:** IDs separados por vírgula. Omitir quando não houver.
- **Started:** e **Finished:** (UTC) escritos pelo `task.sh`. Nunca à mão.

As chaves, os valores e os marcadores (`## Done when`, `## Log`, `Next step:`) são o contrato que os scripts leem: ficam em inglês, como aqui. O resto do texto da task segue a língua do plano.

O `Status:` muda-se só com o `task.sh`. O `MAP.md` não guarda estado; o `status.sh` calcula tudo a partir dos cabeçalhos.

## Sessão de trabalho

1. **Escolher.** A task nomeada, ou a escolhida no cartão do `/plan-relay-pt-br:plan site-de-receitas`. *Pronto quando* todo ID em `Blocked by:` está `done`.
2. **Reclamar.** `sh agent_plans/site-de-receitas/task.sh claim <ID>` e abrir a entrada da sessão no `## Log`, antes de qualquer outro trabalho. O script recusa uma task bloqueada ou já em andamento. Se já estava `in-progress`, ler o `## Log` e retomar do `Next step:`.
3. **Ler.** O que está em «Ler antes» e o `## Log` de cada task em `Blocked by:`. Decisões a montante valem aqui.
4. **Executar.** Seguir os passos. Código nasce test-first: o teste da regra fica red, o código o deixa green, e só então se refatora.
5. **Avaliar.** Percorrer os «Pontos de avaliação» e aplicar a ação de cada um.
6. **Verificar.** Rodar cada item do `## Done when` e marcar `[x]` só o que foi verificado nesta sessão.
7. **Autocrítica.** Reler o trabalho como revisor: o critério foi provado ou só afirmado? A task assentou em premissas que o código desmente? Alguma task adiante ficou mais difícil ou mais fácil — então o texto ou o `Blocked by:` dela muda agora.
8. **Fechar.** Completar o `## Log` e rodar `sh agent_plans/site-de-receitas/task.sh close <ID>`, que recusa enquanto houver `- [ ]` no `## Done when`.

**Sessão que desiste antes de alterar qualquer coisa:** `sh agent_plans/site-de-receitas/task.sh release <ID>`.
**Sessão interrompida:** o `Status:` continua `in-progress` e o `## Log` termina num `Next step:` concreto. O `status.sh` avisa quando falta.

Entrada do `## Log`:

```
### <AAAA-MM-DD> — sessão <n>
- Feito: …
- Decisões: … (o quê e por quê; inclui as respostas de quem decide)
- Imprevistos: …
- Commits: <repo> <hash> — <primeira linha>
- Subtasks criadas: <ID> — <motivo>
- Next step: … (obrigatório enquanto in-progress)
```

## Tipos

- **code:** o agente implementa e testa.
- **research:** o agente investiga contra fontes primárias e entrega `research/Pnn-<slug>.md`, uma fonte por afirmação e `[?]` no que não se confirmou.
- **prototype:** um esboço descartável em `prototypes/<nome>/` responde a perguntas concretas; as lições vão para a spec.
- **decision:** o agente levanta as opções, com custo e consequência, e pergunta; a escolha é de quem decide. Fica em `spec/decisions.md` e no `## Log`.
- **human:** passos que só uma pessoa pode dar (acessos, pedidos a outras equipes, licenças). O agente prepara o roteiro e confere o resultado sem ver segredos.
- **review:** o agente executa ou inspeciona algo real e dá a cada achado um destino: correção dentro do escopo ou subtask. Toda fase fecha com um `review` que detalha os `draft` da fase seguinte e passa-os a `ready`.

## Subtasks

Uma task cria subtask quando um ponto de avaliação manda, quando aparece trabalho necessário fora do escopo e maior que um ajuste, ou quando parte do trabalho espera uma decisão que não veio nesta sessão. O trabalho que cabe no escopo faz-se na própria task.

1. **ID e arquivo.** ID da mãe com `.n`: `F1-03.1`; subtask de subtask é `F1-03.1.1`. Mesma pasta da mãe, a partir de `_template.md`, com `Status: ready`.
2. **Conteúdo completo,** escrito para uma sessão que não viu esta.
3. **Arestas.** `grep -l "^Blocked by:.*F1-03" agent_plans/site-de-receitas/phase-*/*.md` lista quem depende da mãe; quem precisar do que a subtask produz ganha-a no `Blocked by:`. É assim que um passo adiante fica bloqueado.
4. **Mapa.** `sh agent_plans/site-de-receitas/map.sh`.
5. **Registro.** Anotar no `## Log` da mãe a subtask criada e por quê.

## Versionamento

Quando a raiz do projeto é um repositório git, `agent_plans/site-de-receitas/` versiona-se com o código, salvo se as convenções abaixo disserem outra coisa. Os commits nomeiam os arquivos um a um, nunca `git add -A` nem `git add .`: pode haver sessões paralelas mexendo em outras tasks. Nenhum commit sai da máquina sem o dono.

- **Mapear.** O `/plan-relay-pt-br:map` termina com um commit de `agent_plans/site-de-receitas/`.
- **Sessão de trabalho.** Os entregáveis vão no commit (ou commits) que o «Commits:» do `## Log` cita. Depois do `task.sh close` — ou, numa sessão interrompida, depois de escrito o `Next step:` —, um commit à parte com os arquivos do plano que a sessão mudou: a task, as subtasks que criou, o `MAP.md`, e o que escreveu em `spec/`, `research/`, `prototypes/` e `notes/`. Fica à parte porque o `## Log`, que vai nele, não pode citar o próprio hash.
- **Piloto.** A condutora faz commit do diário (`notes/run-*.md`) no `## Closing` e no `## Handoff`.

Fora de um repositório git, nada disto se aplica.

## Convenções do projeto

- **Plano de exemplo.** O projeto é fictício e serve para ver o plan-relay funcionando. Comece por `/plan-relay-pt-br:plan site-de-receitas`, por `sh agent_plans/site-de-receitas/status.sh` ou pelo `/plan-relay-pt-br:run agent_plans/site-de-receitas`.
- **Node 18 ou mais novo, sem dependências.** `npm test` roda os testes (`node:test`, em `test/`) e `npm run build` gera o site em `saida/`, que fica fora do git porque se gera de novo a cada build.
- **Teste red de task em andamento fica com `todo`.** Assim o `npm test` continua verde para as outras sessões; quem fecha a task tira o `todo`.
- **Texto em pt-BR, com «você».**
- **Nada da máquina de quem escreve em arquivo versionado:** caminhos absolutos, nomes de empresa ou de conta. Em exemplos, caminhos neutros (`/home/dev/projeto`).
