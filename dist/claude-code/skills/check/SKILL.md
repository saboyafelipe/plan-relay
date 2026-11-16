---
name: check
description: Confere o ambiente do plan-relay (jq, git, shell, CLI e login do agente, plugin instalado e em dia) e explica cada falta com o jeito de resolver, sem instalar nada sem perguntar. Usar quando perguntarem o que falta instalar, se o plugin está em dia ou por que o piloto não roda, e antes do primeiro piloto numa máquina nova.
argument-hint: "(nada)"
---

# Check — conferir o ambiente

O ambiente se confere por um script só, `<plugin>/scripts/check.sh`, a mesma fonte do pré-voo do `/plan-relay-pt-br:run` e do painel. Esta skill roda o script, lê o JSON e explica. As verificações não se repetem aqui: o que o script não confere, a skill não afirma.

## Comandos

Antes do primeiro comando, ler `<plugin>/COMMANDS.md` e segui-lo em cada comando desta skill. `<plugin>` é o caminho absoluto da linha que começa por `plan-relay plugin root:` no contexto da sessão. Sem essa linha, não rodar nada e dizer ao usuário: «A linha `plan-relay plugin root:` não está no contexto desta sessão: o hook `SessionStart` do plugin não rodou. Confira se o plugin está instalado e habilitado e abra uma sessão nova.» É também um achado do check: sem a linha, o plugin não está ativo nesta sessão.

## Passos

1. Rodar `sh <plugin>/scripts/check.sh --json` e ler a saída inteira. Código 0: nada obrigatório falta; 1: falta algo obrigatório; 2: uso errado (não deveria acontecer; mostrar o stderr).
2. Ler o objeto: `ok` e, em `checks[]`, para cada item, `id`, `status` (`ok`, `missing`, `warning`, `unknown`), `required` e `detail`. Um `id` que esta skill não conhece mostra-se do mesmo jeito, pelo `detail`: ids novos podem aparecer.
3. Responder, nesta ordem:
   - **Uma linha de veredito:** «Tudo em dia» quando todo item está `ok`; «Nada obrigatório falta, mas há avisos» quando `ok` é `true` e algum item não está `ok`; «Falta o obrigatório» quando `ok` é `false`.
   - **O que falta** (status `missing` ou `warning`), obrigatórios primeiro: o `id`, se é obrigatório ou opcional, o `detail` (que traz como resolver) e, em uma frase, o que deixa de funcionar sem isso — pela tabela abaixo.
   - **O que não deu para saber** (status `unknown`): o `id` e o `detail`. `unknown` nunca é erro: diz que a verificação não tem como responder aqui (sem rede, sem o CLI, sem `jq`).
   - **O que está em dia:** uma linha só, com os ids `ok`.
4. Se algo faltar e o `detail` trouxer um comando de instalação ou de ativação, perguntar com `AskUserQuestion` se o usuário quer que você rode esse comando agora, um item por opção, mais «Não, eu resolvo». Nunca instalar, ativar, atualizar nem fazer login sem essa resposta. Login (`agent-auth`) é sempre do usuário: mostrar o comando e não rodá-lo. Depois de rodar o que ele escolheu, rodar o passo 1 de novo e mostrar só o que mudou.

## O que cada verificação diz

| id | Sem ela |
| :--- | :--- |
| `jq` (obrigatória) | o `selftest.sh`, o `summary.sh` e a janela de 5 h não rodam; o piloto não começa. |
| `git` | não há commits do plano nem dos entregáveis. |
| `os`, `shell` | informativas; `warning` em `shell` quer dizer sistema onde os scripts não foram provados (no Windows, usar Git Bash ou WSL). |
| `agent-cli` | não há como conferir o plugin nem o login, e a janela de 5 h não tem sonda. |
| `agent-auth` | o CLI está instalado, mas uma sessão nova (a de um trabalhador, a de um teste isolado) para no pedido de login. |
| `plugin` | as skills e o hook de contexto não estão nesta máquina; sem o hook, a condutora não recebe o aviso de limite. |
| `plugin-current` | a versão instalada é mais velha que a pasta de origem: as skills em uso não são as do repositório. Depois de atualizar, abrir uma sessão nova. Ou a versão é a mesma, mas a cópia do cache (o `installPath` do `detail`) difere da pasta de origem: o CLI lê a origem, a Agents window do VS Code lê a cópia e mostra skills velhas. O `plugin update` não renova a cópia; reinstalar sim, com os dois comandos do `detail` (`uninstall` e `install`, no escopo que ele diz). Se depois disso o check ainda acusar a cópia, a saída é apagar a pasta do `installPath` e instalar de novo: apagar só com a confirmação da pessoa, nessa pasta e em nenhuma outra. |

Esta skill não escreve arquivo nenhum e não faz commit.
