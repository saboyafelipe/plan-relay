# Cenário de validação — `/plan-relay:map`

## Cenário

Executar em sessão limpa, num repositório git com o plugin `plan-relay` instalado e um `PLANO-MIGRACAO.md` de três fases: um inventário dos serviços, a decisão do destino de cada um (que depende de uma licença que outra equipe precisa aprovar), e a migração serviço a serviço. O plano cita um `scripts/deploy.sh` que não existe. Já há um plano em `agent_plans/outro/` com `plan.json` de outro `source`.

> /plan-relay:map PLANO-MIGRACAO.md

Segunda corrida, depois de aprovado e escrito: repetir o mesmo comando.

Terceira corrida, no mesmo repositório: um `AJUSTE-LOGIN.md` pequeno, de uma fase com cinco passos de código e nenhuma pesquisa.

> /plan-relay:map AJUSTE-LOGIN.md

Quarta corrida, origem que é uma ideia: `agent_plans/_ideas/exportar-csv.md`, com `Status: refining` e `Open questions: 2`; o `.gitignore` do repositório não ignora `agent_plans/_ideas/`.

> /plan-relay:map agent_plans/_ideas/exportar-csv.md

Quinta corrida: repetir o mesmo comando.

## Traço esperado

1. Calcula a raiz pelo `git rev-parse --show-toplevel` e lê os `agent_plans/*/plan.json`; nenhum tem `source: PLANO-MIGRACAO.md`, por isso segue.
2. Lê o plano inteiro, e o `CLAUDE.md` ou `AGENTS.md` do repositório, antes de desenhar.
3. Confere os arquivos que o plano cita; nota que `scripts/deploy.sh` não existe e o trata como premissa em aberto.
4. Escolhe um nome que não colide com uma pasta de `agent_plans/`, sem checar skills (não há skill por plano).
5. Põe na fase 0 o pedido da licença, como task `human`, para rodar em paralelo.
6. Dá a cada task `Type:`, `Track:` e arestas `Blocked by:`, e a toda task `ready` que não é `human` um `Tier:` (`junior`, `mid` ou `senior`) pela seção «Níveis» do `README.md` gerado; cada fase fecha com uma task `review`.
7. Escreve por inteiro as duas primeiras fases e deixa as seguintes em `draft`.
8. Apresenta o desenho (`agent_plans/<nome>/`, fases, tasks, caminho crítico, a língua `pt-BR` — a do `PLANO-MIGRACAO.md` — e o perfil proposto `full`, com a razão pela regra: três fases), pergunta se a língua está certa e se o perfil fica `full`, e espera aprovação explícita antes de escrever.
9. Escreve em `agent_plans/<nome>/`: copia os três scripts (`status.sh`, `task.sh`, `map.sh`) e o `_template.md` com uma chamada `sh <plugin>/template/copy.sh agent_plans/<nome>`, sem `cp` nem reescrita, gera o `README.md` e cada `PHASE.md` com `sh <plugin>/template/profile.sh full …`, preenche o protocolo com as convenções do repositório e `{{PLAN_PATH}}` com `agent_plans/<nome>`, escreve `PLAN.md`, `_template.md`, `spec/decisions.md`, `phase-<N>-<slug>/PHASE.md` e as tasks com o cabeçalho em inglês, e grava o `plan.json` (`contract: 1`, `name`, `source: PLANO-MIGRACAO.md`, `created` em UTC, `language: pt-BR`, `profile: full` e `scripts_version` igual ao carimbo `# scripts_version:` do `status.sh` copiado, como número).
10. Roda `map.sh` e `status.sh --json` e confirma que não há task `invalid`, ID marcado `(?)` nem ciclo, e que `language`, `profile` e `scripts_version` do `--json` batem com os do `plan.json`.
11. Não cria skill nenhuma: o plano se abre com a skill `plan` do plugin, e a resposta final ensina `/plan-relay:plan <nome>` para o briefing e `/plan-relay:plan <nome> <ID>` para uma task.
12. Roda o `selftest.sh` do modelo do plugin sobre a pasta e só entrega com «tudo certo»; a pasta real fica intacta.
13. Na segunda corrida, encontra o `plan.json` com o mesmo `source`, diz que o plano já está mapeado em `agent_plans/<nome>/` e que se apaga pela extensão, e para sem ler o plano a fundo nem escrever nada.
14. Na terceira corrida, desenha uma fase com cinco tasks `code`, todas escritas por inteiro, e propõe o perfil `lean` com a razão pela regra («uma fase, cinco tasks, nenhuma `research` nem `prototype`»); pergunta se o perfil fica `lean` e espera. Com a confirmação, gera o `README.md` e o `PHASE.md` com `sh <plugin>/template/profile.sh lean …`, escreve as decisões na seção «Decisões» do `PLAN.md`, cria `notes/` e nenhuma pasta `spec/`, `research/` ou `prototypes/`, grava `profile: lean` no `plan.json`, e o `selftest.sh` mostra `perfil lean` nas suas linhas e termina em «tudo certo».
15. Na quarta corrida (origem é uma ideia), lê o cabeçalho da ideia, vê `Status: refining` e segue; o desenho diz que sobram 2 perguntas em aberto e sugere `/plan-relay:refine` antes, sem recusar, e espera a aprovação. Aprovado, grava `source: agent_plans/_ideas/exportar-csv.md` no `plan.json`, roda o `selftest.sh` e, depois dele e antes do commit, `sh <plugin>/scripts/idea.sh status agent_plans/_ideas/exportar-csv.md mapped agent_plans/<nome>`, sem editar o cabeçalho à mão. A ideia termina com `Status: mapped` e `Plan: agent_plans/<nome>` (sem `/` no fim), e o resto do arquivo não muda. Como `git check-ignore -q agent_plans/_ideas/exportar-csv.md` sai com 1, a ideia entra no commit do plano, por caminho.
16. Na quinta corrida, lê o cabeçalho, vê `Status: mapped`, diz que a ideia já virou o plano `agent_plans/<nome>/` (o do `Plan:`) e para, sem desenhar nem escrever nada.

Sinais de falha: escrever a pasta antes da aprovação; uma task `ready` que não é `human` sem a linha `Tier:`, ou com valor fora de `junior`, `mid` e `senior` (conferir no arquivo: o `tier` do `status.sh --json` vira `senior` nos dois casos); escreveu fora de `agent_plans/` (na raiz, ao lado do plano, ou em outro lugar); pasta escrita sem `plan.json`; mapeou um `.md` já mapeado (ou apagou o plano existente); uma task construída sobre o `scripts/deploy.sh` inexistente; todas as fases escritas por inteiro no plano `full`; uma fase sem task de fecho no plano `full`; o perfil gravado sem ter sido proposto e confirmado no desenho, ou `profile: full` escrito para o `AJUSTE-LOGIN.md` sem o usuário ter trocado; um plano `lean` com `spec/`, `research/` ou `prototypes/`, com tasks em `draft`, ou com o texto de test-first no `README.md`; o `README.md` ou um `PHASE.md` com `{{PLAN_PATH}}`, `{{#full}}`, `{{#lean}}` ou outro marcador por preencher; cabeçalho, valores ou nomes de arquivo do contrato antigo (`plano.json`, `fase-*/`, chaves em português); o modelo lido de uma cópia fora do plugin (em `~/.claude/skills/` ou em outro lugar) em vez do `template/` do plugin; qualquer arquivo escrito em `.claude/skills/` (do projeto ou em `~/.claude/skills/`): não há skill de entrada por plano; a resposta ensinando `/<nome>` em vez de `/plan-relay:plan <nome>`; `Status:` editado à mão em vez do `task.sh`; testes do `task.sh` feitos à mão na pasta real em vez do `selftest.sh`.
