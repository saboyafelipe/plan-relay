# {{PLAN_NAME}} — protocolo de execução

O que se quer construir e por quê está no `PLAN.md`, ao lado deste arquivo. Este arquivo diz **como se trabalha**.

**Como se começa:** numa sessão de agente aberta na raiz do repositório, `{{AGENT_PLUGIN_SKILL_PREFIX}}plan {{PLAN_NAME}}` mostra o progresso, o que está em andamento e há quanto tempo, e oferece a escolha da próxima task; `{{AGENT_PLUGIN_SKILL_PREFIX}}plan {{PLAN_NAME}} <ID>` executa ou retoma uma task.

O trabalho divide-se em fases e em tasks que cabem numa ou duas sessões de agente. Cada task é autossuficiente: diz o que ler, o que entregar, como provar que acabou e onde a próxima sessão retoma, mesmo dias depois e sem memória desta.

{{#full}}
A `spec/` é a fonte da verdade do que se constrói; a task diz o que fazer agora. Quando as duas divergirem, a spec vence, e a divergência vai para o `## Log` da task ou vira uma edição da spec.
{{/full}}
{{#lean}}
O `PLAN.md` é a fonte da verdade do que se constrói; a task diz o que fazer agora. Quando os dois divergirem, o `PLAN.md` vence, e a divergência vai para o `## Log` da task ou vira uma edição do `PLAN.md`.
{{/lean}}

## Estrutura

```
{{PLAN_PATH}}/
  README.md         ← este protocolo
{{#full}}
  PLAN.md           ← o que é, princípios, fases, fora de escopo
{{/full}}
{{#lean}}
  PLAN.md           ← o que é, princípios, fases, decisões, fora de escopo
{{/lean}}
  MAP.md            ← todas as tasks por fase e o caminho crítico (gerado por map.sh)
  _template.md      ← a forma de uma task
  plan.json         ← nome, documento de origem e versão do contrato
  status.sh         ← progresso, em andamento (e há quanto tempo), livres, sessões paralelas, bloqueadas; --json para máquinas
  task.sh           ← muda o estado de uma task: claim, close, release, cancel, giveup, reopen
  map.sh            ← reescreve o MAP.md a partir dos cabeçalhos
{{#full}}
  spec/             ← o que se constrói; decisões em spec/decisions.md
  research/         ← pesquisas citadas (P01, P02…)
  prototypes/       ← esboços descartáveis; só as lições passam para a spec
{{/full}}
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
Tier: mid
Repos: <repo-a>, <repo-b>
Blocked by: F1-02, F0-02

# F1-03 - <título>
```

- **Status:** `draft` (objetivo e arestas escritos, passos por detalhar; não se começa) · `ready` · `in-progress` · `done` · `cancelled` (trocada por outra pelo agente; motivo no `## Log`) · `abandoned` (o dono desistiu dela, ou de uma task de que ela dependia; motivo no `## Log` da raiz). As duas últimas saem do total e nunca contam como bloqueio resolvido. Ver [Cancelar, desistir e retomar](#cancelar-desistir-e-retomar).
- **Replaced by:**, **Given up by:**, **Given up with:** e **Previous status:** escritos pelo `task.sh` ao cancelar e ao desistir. Nunca à mão.
- **Type:** ver [Tipos](#tipos).
- **Track:** o fio de trabalho, para filtrar o `status.sh`.
- **Tier:** `junior`, `mid` ou `senior`, pelos critérios de [Níveis](#níveis). Omitir nas tasks `human`.
- **Repos:** os repositórios que a task altera; o `status.sh` usa-os para sugerir sessões paralelas sem conflito. Omitir quando não altera nenhum.
- **Blocked by:** IDs separados por vírgula. Omitir quando não houver.
- **Started:** e **Finished:** (UTC) escritos pelo `task.sh`. Nunca à mão.

As chaves, os valores e os marcadores (`## Done when`, `## Log`, `Next step:`) são o contrato que os scripts leem: ficam em inglês, como aqui. O resto do texto da task segue a língua do plano.

O `Status:` muda-se só com o `task.sh`. O `MAP.md` não guarda estado; o `status.sh` calcula tudo a partir dos cabeçalhos.

### Níveis

O `Tier:` diz quanto julgamento a task pede. A condutora do piloto lança cada nível num modelo e, se um trabalhador abaixo de `senior` falha, relança a task uma vez em `senior`.

- **`junior`:** trabalho mecânico e já decidido, com até ~5 arquivos nos entregáveis e leitura curta.
- **`mid`:** implementação com a spec clara e nada por decidir; texto para pessoas (README, CONTRIBUTING, página de loja); troca por lista, mesmo que varra o repositório; medição ou experimento com ferramenta externa cujo resultado não decide o caminho.
- **`senior`:** `decision`, `research`, `prototype` e `review`; uma decisão dentro da task («decidir o formato», «decidir se…»); texto que agentes leem (skills, prompts, este README); desenho entre módulos; medição cujo resultado decide o caminho.
- **Na dúvida, `senior`.** Sem `Tier:`, ou com outro valor, a task vale `senior`.
- **`human`** não tem nível: a condutora não a lança.

{{#full}}
Escreve o `Tier:` quem deixa a task `ready`: quem mapeia o plano, nas que nascem `ready`; quem cria uma task ou subtask; e o `review` de fim de fase ao detalhar um `draft` (a decisão que o detalhe toma pode baixar o nível). O piloto não muda o campo; a escalada fica só no diário.
{{/full}}
{{#lean}}
Escreve o `Tier:` quem escreve a task: quem mapeia o plano e quem cria uma task ou subtask. O piloto não muda o campo; a escalada fica só no diário.
{{/lean}}

## Sessão de trabalho

1. **Escolher.** A task nomeada, ou a escolhida no cartão do `{{AGENT_PLUGIN_SKILL_PREFIX}}plan {{PLAN_NAME}}`. *Pronto quando* todo ID em `Blocked by:` está `done`.
2. **Reclamar.** `sh {{PLAN_PATH}}/task.sh claim <ID>` e abrir a entrada da sessão no `## Log`, antes de qualquer outro trabalho. O script recusa uma task bloqueada ou já em andamento. Se já estava `in-progress`, ler o `## Log` e retomar do `Next step:`.
3. **Ler.** O que está em «Ler antes» e o `## Log` de cada task em `Blocked by:`. Decisões a montante valem aqui.
{{#full}}
4. **Executar.** Seguir os passos. Código nasce test-first: o teste da regra fica red, o código o deixa green, e só então se refatora.
{{/full}}
{{#lean}}
4. **Executar.** Seguir os passos. Os testes que a task pedir fazem parte da entrega.
{{/lean}}
5. **Avaliar.** Percorrer os «Pontos de avaliação» e aplicar a ação de cada um.
6. **Verificar.** Rodar cada item do `## Done when` e marcar `[x]` só o que foi verificado nesta sessão.
7. **Autocrítica.** Reler o trabalho como revisor: o critério foi provado ou só afirmado? A task assentou em premissas que o código desmente? Alguma task adiante ficou mais difícil ou mais fácil — então o texto ou o `Blocked by:` dela muda agora.
8. **Fechar.** Completar o `## Log` e rodar `sh {{PLAN_PATH}}/task.sh close <ID>`, que recusa enquanto houver `- [ ]` no `## Done when`.

**Sessão que desiste antes de alterar qualquer coisa:** `sh {{PLAN_PATH}}/task.sh release <ID>`.
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

### Cancelar, desistir e retomar

- **Cancelar é do agente:** a task deixou de fazer sentido como está escrita. `sh {{PLAN_PATH}}/task.sh cancel <ID> --reason "<motivo>"` recusa enquanto houver dependente viva e a nomeia; nunca cancela em cascata. Com dependentes: criar a substituta (pela seção [Subtasks](#subtasks), em geral com o `Blocked by:` da antiga), trocar o ID antigo pelo dela no `Blocked by:` de cada dependente e só então cancelar com `--replaced-by <substituta>`. O piloto só cancela assim, por substituição.
- **Desistir é do dono:** tira a task do plano junto com tudo o que dependia dela, em cascata e atravessando fases. O agente nunca desiste por conta própria. `sh {{PLAN_PATH}}/task.sh giveup <ID>` mostra o que cairia (com `--json`, para máquinas) e não muda nada; só depois de o dono ver essa lista e dizer «sim», `giveup <ID> --reason "<motivo>" --yes` aplica. A raiz fica com `Given up by: owner`, e as que caíram com ela, com `Given up with: <raiz>`.
- **Retomar desfaz uma desistência,** como grupo e só a pedido do dono: `sh {{PLAN_PATH}}/task.sh reopen <raiz>` devolve a raiz e as que caíram com ela a `ready` ou `draft`. Uma task cancelada não se retoma.
- **O motivo** é obrigatório em `cancel` e `giveup --yes`, um só, e vai para o `## Log`: o da raiz, com a frase inteira; o de cada task que caiu junto, com «abandonada junto com <raiz>». Recusa-se vazio ou quando toda palavra tem um caractere só (`-`, `aaa`, `--- 1`).

## Tipos

- **code:** o agente implementa e testa.
{{#full}}
- **research:** o agente investiga contra fontes primárias e entrega `research/Pnn-<slug>.md`, uma fonte por afirmação e `[?]` no que não se confirmou.
- **prototype:** um esboço descartável em `prototypes/<nome>/` responde a perguntas concretas; as lições vão para a spec.
- **decision:** o agente levanta as opções, com custo e consequência, e pergunta; a escolha é de quem decide. Fica em `spec/decisions.md` e no `## Log`.
{{/full}}
{{#lean}}
- **decision:** o agente levanta as opções, com custo e consequência, e pergunta; a escolha é de quem decide. Fica na seção «Decisões» do `PLAN.md` e no `## Log`.
{{/lean}}
- **human:** passos que só uma pessoa pode dar (acessos, pedidos a outras equipes, licenças). O agente prepara o roteiro e confere o resultado sem ver segredos.
{{#full}}
- **review:** o agente executa ou inspeciona algo real e dá a cada achado um destino: correção dentro do escopo ou subtask. Toda fase fecha com um `review` que detalha os `draft` da fase seguinte, escreve o `Tier:` de cada um e passa-os a `ready`.
{{/full}}
{{#lean}}
- **review:** o agente executa ou inspeciona algo real e dá a cada achado um destino: correção dentro do escopo ou subtask. Uma fase fecha com um `review` só quando o que ela entrega pede essa conferência.
{{/lean}}

## Subtasks

Uma task cria subtask quando um ponto de avaliação manda, quando aparece trabalho necessário fora do escopo e maior que um ajuste, ou quando parte do trabalho espera uma decisão que não veio nesta sessão. O trabalho que cabe no escopo faz-se na própria task.

1. **ID e arquivo.** ID da mãe com `.n`: `F1-03.1`; subtask de subtask é `F1-03.1.1`. Mesma pasta da mãe, a partir de `_template.md`, com `Status: ready`.
2. **Conteúdo completo,** escrito para uma sessão que não viu esta.
3. **Arestas.** `grep -l "^Blocked by:.*F1-03" {{PLAN_PATH}}/phase-*/*.md` lista quem depende da mãe; quem precisar do que a subtask produz ganha-a no `Blocked by:`. É assim que um passo adiante fica bloqueado.
4. **Mapa.** `sh {{PLAN_PATH}}/map.sh`.
5. **Registro.** Anotar no `## Log` da mãe a subtask criada e por quê.

## Versionamento

Quando a raiz do projeto é um repositório git, `{{PLAN_PATH}}/` versiona-se com o código, salvo se as convenções abaixo disserem outra coisa. Os commits nomeiam os arquivos um a um, nunca `git add -A` nem `git add .`: pode haver sessões paralelas mexendo em outras tasks. Nenhum commit sai da máquina sem o dono.

- **Mapear.** O `{{AGENT_PLUGIN_SKILL_PREFIX}}map` termina com um commit de `{{PLAN_PATH}}/`.
{{#full}}
- **Sessão de trabalho.** Os entregáveis vão no commit (ou commits) que o «Commits:» do `## Log` cita. Depois do `task.sh close` — ou, numa sessão interrompida, depois de escrito o `Next step:` —, um commit à parte com os arquivos do plano que a sessão mudou: a task, as subtasks que criou, o `MAP.md`, e o que escreveu em `spec/`, `research/`, `prototypes/` e `notes/`. Fica à parte porque o `## Log`, que vai nele, não pode citar o próprio hash.
{{/full}}
{{#lean}}
- **Sessão de trabalho.** Os entregáveis vão no commit (ou commits) que o «Commits:» do `## Log` cita. Depois do `task.sh close` — ou, numa sessão interrompida, depois de escrito o `Next step:` —, um commit à parte com os arquivos do plano que a sessão mudou: a task, as subtasks que criou, o `MAP.md`, e o que escreveu no `PLAN.md` e em `notes/`. Fica à parte porque o `## Log`, que vai nele, não pode citar o próprio hash.
{{/lean}}
- **Piloto.** A condutora faz commit do diário (`notes/run-*.md`) no `## Closing` e no `## Handoff`.

Fora de um repositório git, nada disto se aplica.

## Convenções do projeto

{{CONVENTIONS}}
