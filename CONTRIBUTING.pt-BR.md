[English](CONTRIBUTING.md) | **Português**

# Como contribuir

Obrigado pelo interesse. Este guia diz como abrir uma issue ou um pull request e o que se espera de uma contribuição. Para a estrutura do repositório, o build e as suites de prova, veja o [docs/development.md](docs/development.md) (em inglês), que é a fonte desses comandos.

Ao participar, você aceita o [Código de Conduta](CODE_OF_CONDUCT.pt-BR.md).

## Língua

O texto do projeto (documentação, mensagens, skills, painel) existe em português do Brasil, tratando o leitor por «você», e em inglês. Identificadores públicos (nomes de skills, settings, comandos, chaves do contrato do plano) são em inglês. Issues e pull requests podem ser escritos em qualquer das duas línguas.

## Issues

- **Falha de segurança:** não abra issue. Siga o [SECURITY.pt-BR.md](SECURITY.pt-BR.md).
- **Bug:** use o modelo «Bug». Diga as versões da extensão e do plugin, o agente, o sistema, os passos, o que esperava e o que aconteceu. A saída de `/plan-relay-pt-br:check` ajuda.
- **Ideia:** use o modelo «Ideia». Comece pelo problema, não pela solução.

Antes de abrir, procure uma issue parecida.

## Pull requests

Para uma mudança grande, abra antes uma issue e combine o desenho: poupa trabalho dos dois lados.

1. Faça um fork e crie um branch a partir de `main`.
2. **Teste primeiro.** Uma regra nova nasce com o teste que a prova: o teste fica red, o código o deixa green, e só então se refatora. Um bug corrigido ganha o teste que o reproduzia.
3. **Edite a fonte, nunca o que é gerado.** Os plugins em `dist/` são gerados por `sh tools/build.sh` a partir de `core/` e `agents/claude-code/`. Mudou um desses? Rode o build e ponha o `dist/` gerado **no mesmo commit**. O CI recusa um `dist/` desatualizado.
4. **Texto nas duas línguas.** Um texto traduzível em pt-BR tem o par em inglês na pasta `en/` ao lado; o CI confere a paridade.
5. **A acessibilidade é requisito.** Uma mudança no painel mantém o que a seção [Acessibilidade](README.pt-BR.md) do README promete. Uma vista ou um controle novo ganha o seu caso em `core/panel/src/axe.test.ts` (nenhuma violação do axe) e, se tiver um estado ou uma ação, em `core/panel/src/a11y.test.ts` (alcançável pelo teclado, não dito só por cor); uma cor nova é uma variável `--pr-*` que cada host liga ao tema, nunca uma fixa.
6. **Rode o que o CI roda:** `sh tools/gates.sh`, depois de `npm ci --ignore-scripts`, roda todos os portões e só sai 0 quando todos passam. A lista única é a [CI gates](docs/development.md#ci-gates) do docs/development.md, com cada comando como o CI o roda; rode pelo menos os portões que a sua mudança toca, e a lista inteira antes de um pull request.
7. **Commits que nomeiam os arquivos.** `git add <arquivo> <arquivo>`, nunca `git add -A` nem `git add .`. A mensagem diz o que muda e por quê.
8. Abra o pull request contra `main` e preencha o modelo.

## Mensagens de commit

- Um assunto curto, em inglês e no imperativo ("Add the retry test", não "Added" nem "Adds").
- Um corpo que diz por que a mudança é necessária, quando o assunto não deixa isso claro.
- Um commit por mudança lógica.
- Nenhuma referência interna: IDs de task, números de decisão ou caminhos de arquivos de planejamento não entram numa mensagem, nem em código, comentário ou documentação.

## O que não entra no repositório

- Caminhos da sua máquina (a sua pasta pessoal, o seu nome de usuário). Em fixtures e exemplos, use caminhos neutros, como `/home/dev/projeto`.
- Nomes de empresa, de cliente ou de projeto interno, identificadores de conta, preços, e-mails ou outros dados pessoais.
- Segredos de qualquer tipo (tokens, chaves, senhas), nem em teste.
- Os seus planos de trabalho: o `agent_plans/` da raiz está no `.gitignore` (os das fixtures de teste, como `fixtures/demo-project/`, são versionados de propósito).

## Licença

Ao contribuir, você concorda que a sua contribuição é licenciada sob a [licença MIT](LICENSE) do projeto.
