# Cenário de validação — ideia → afinada → mapeada (`/plan-relay:idea`, `/plan-relay:refine`, `/plan-relay:map`)

A parte determinística (cabeçalho, contagem, transições e `Plan:`) está provada sem modelo em `core/scripts/tests/idea.sh`. Este roteiro prova o fluxo das três skills, executado à mão: cada sessão numa sessão limpa do agente, com quem responde às perguntas.

## Cenário

Um repositório git com o plugin `plan-relay` instalado, sem nenhuma ideia em `agent_plans/_ideas/` e sem plano em `agent_plans/`. O `.gitignore` ignora `agent_plans/_ideas/` (o outro ramo, ideia versionada, está na quarta corrida do `scenario-map.md`).

**Sessão 1 — criar.** Uma conversa curta, em português:

> Quero exportar as tasks de um plano para CSV, para abrir numa planilha. Já decidi que sai um arquivo, não vai para a área de transferência. Ainda não sei que colunas entram nem qual separador usar.

> /plan-relay:idea

**Sessão 2 — afinar**, sessão nova:

> /plan-relay:refine exportar-csv

Na primeira ronda, responder: colunas «ID, título, `Status:` e `Tier:`»; separador «ponto e vírgula», e dizer que a planilha é o Excel em pt-BR. Se a ronda trouxer a pergunta nova sobre a codificação (ver o traço), responder «UTF-8 com BOM». Na proposta de `ready`, confirmar.

**Sessão 3 — mapear**, sessão nova:

> /plan-relay:map agent_plans/_ideas/exportar-csv.md

Aprovar o desenho como vier.

## Traço esperado

Depois de cada passo que mexe na ideia, conferir à mão: `sh <plugin>/scripts/idea.sh count agent_plans/_ideas/exportar-csv.md` imprime o mesmo número que a linha `Open questions:` do arquivo.

**Sessão 1 (`/plan-relay:idea`).**

1. Lê o `<plugin>/COMMANDS.md` antes do primeiro comando; cada comando é literal, um por chamada.
2. Escolhe o slug `exportar-csv` (ou outro ASCII minúsculo com hífen, tirado do título) e confere que `agent_plans/_ideas/<slug>.md` não existe.
3. Copia o modelo com `sh <plugin>/template/copy.sh idea.md agent_plans/_ideas/exportar-csv.md`, sem `cp`; pega a hora com `date -u +%Y-%m-%dT%H:%MZ` e a põe em `Created:`.
4. Preenche com as ferramentas de edição: o título, o texto, uma decisão («sai um arquivo, não a área de transferência», decidida pela pessoa) e duas perguntas na seção marcada por `<!-- open-questions -->` (colunas; separador). Nada do que não foi dito entra como decidido.
5. Roda `sh <plugin>/scripts/idea.sh sync agent_plans/_ideas/exportar-csv.md`; o cabeçalho fica `Status: open`, `Open questions: 2`. Não faz commit.
6. Responde com o caminho, as 2 perguntas (pela saída do `idea.sh count`) e o próximo passo: `/plan-relay:refine agent_plans/_ideas/exportar-csv.md`, depois `/plan-relay:map …`.

**Sessão 2 (`/plan-relay:refine`).**

7. Acha a ideia pelo slug, lê o arquivo inteiro e, com `Status: open`, roda `sh <plugin>/scripts/idea.sh status agent_plans/_ideas/exportar-csv.md refining`.
8. Ronda 1: as duas perguntas de uma vez pela `AskUserQuestion`, cada uma reescrita numa frase, com opções, a consequência de cada uma e uma opção marcada como recomendada.
9. Grava: duas decisões em «Decisões» (o quê, por quê, a pessoa), as duas perguntas saem da seção marcada, e entra uma pergunta nova aberta pela resposta — a codificação do arquivo para o Excel em pt-BR (por exemplo, «UTF-8 com BOM ou sem?»). Roda `idea.sh sync`: `Open questions: 1`, `Status: refining`.
10. Ronda 2: a pergunta nova, pela `AskUserQuestion`, com opções e recomendação; grava a decisão, tira a pergunta, `idea.sh sync`: `Open questions: 0`.
11. Com zero perguntas, propõe `ready` com um resumo das decisões e pergunta pela `AskUserQuestion` se a pessoa confirma. Só depois do sim roda `sh <plugin>/scripts/idea.sh status agent_plans/_ideas/exportar-csv.md ready`, e o script não avisa (há 0 perguntas).
12. Responde com o caminho, `ready`, 0 perguntas e o próximo passo `/plan-relay:map agent_plans/_ideas/exportar-csv.md`. Não faz commit.

**Sessão 3 (`/plan-relay:map`).**

13. Lê o cabeçalho da ideia: `Status: ready`, `Open questions: 0`; segue sem o aviso de perguntas em aberto.
14. Desenha o plano a partir do texto e das «Decisões» da ideia (as três decisões aparecem no desenho ou no `PLAN.md`), apresenta e espera a aprovação, como no `scenario-map.md`.
15. Aprovado, escreve `agent_plans/<nome>/` com `source: agent_plans/_ideas/exportar-csv.md` no `plan.json`, roda o `selftest.sh` e, depois dele e antes do commit, `sh <plugin>/scripts/idea.sh status agent_plans/_ideas/exportar-csv.md mapped agent_plans/<nome>`.
16. `git check-ignore -q agent_plans/_ideas/exportar-csv.md` sai com 0: a ideia fica fora do commit do plano.

**Estado final da ideia.** O cabeçalho (com `<nome>` o plano gerado, por exemplo `exportar-csv`):

```
Status: mapped
Plan: agent_plans/exportar-csv
Created: <a hora da sessão 1>
Open questions: 0
```

No corpo: o título e o texto da sessão 1; em «Decisões», três itens (arquivo; colunas; separador ponto e vírgula) e um quarto, a codificação; a seção marcada vazia de itens, com o marcador `<!-- open-questions -->` intacto; nenhuma seção `## Handoff`. Rodar `/plan-relay:refine exportar-csv` de novo recusa e diz o plano do `Plan:`; `sh <plugin>/scripts/idea.sh status agent_plans/_ideas/exportar-csv.md refining` sai com 2 e não mexe no arquivo.

Sinais de falha: `Status:` ou `Open questions:` escritos com as ferramentas de edição em vez do `idea.sh`; `Open questions:` diferente do `idea.sh count` depois de qualquer passo; a ideia criada com `cp` ou fora de `agent_plans/_ideas/`; uma pergunta respondida que continua na seção marcada, ou uma resposta que não virou item de «Decisões»; perguntas feitas uma a uma em vez da ronda toda de uma vez; pergunta sem recomendação quando havia opções; a pergunta nova da ronda 1 perdida (a sessão 2 chega a 0 sem a ronda 2); `ready` escrito sem o sim da pessoa; o `map` avisando de perguntas em aberto com `Open questions: 0`, ou escrevendo `Plan:` à mão; `Plan:` com `/` no fim; a ideia no commit do plano com `_ideas/` ignorado; commit feito pela `idea` ou pelo `refine`; um comando composto (`&&`, `$(…)`, pipe) em qualquer das três sessões.
