[English](SECURITY.md) | **Português**

# Segurança

## Versões suportadas

O plan-relay tem dois pacotes, cada um com versão e tag próprias: a extensão do VS Code (`vscode-vX.Y.Z`) e o plugin do Claude Code (`claude-code-vX.Y.Z`). Só a última versão publicada de cada pacote recebe correções de segurança; a correção sai numa versão nova, não num remendo de versão antiga.

## Como relatar uma vulnerabilidade

Não abra uma issue pública, um pull request nem uma discussão sobre a falha: isso a expõe antes de haver correção.

Use o relato privado de vulnerabilidade do GitHub:

1. Abra a aba **Security** do repositório.
2. Clique em **Report a vulnerability** ([atalho](https://github.com/saboyafelipe/plan-relay/security/advisories/new)).
3. Descreva a falha: o pacote e a versão, o que um atacante consegue fazer, os passos para reproduzir e, se tiver, uma sugestão de correção.

Só você e quem mantém o projeto veem o relato. Não há canal por e-mail.

## O que esperar

O projeto é mantido por pouca gente, no tempo livre. A intenção, não uma promessa, é:

- confirmar o recebimento em até 7 dias;
- dizer em até 30 dias se a falha se confirma e qual é o plano de correção;
- publicar a correção e um aviso de segurança (GitHub Security Advisory) com crédito a quem relatou, se você quiser.

Pedimos que você não divulgue a falha antes de a correção sair ou de combinarmos uma data.

## O que conta como vulnerabilidade

Alguns exemplos no escopo: a extensão executar código de um workspace não confiado; um script do plugin escrever fora da pasta do projeto ou do plano; um prompt montado pela extensão ou por uma skill que leve o agente a rodar um comando que você não pediu; vazamento de um segredo do ambiente.

Fora do escopo: o comportamento do próprio agente de código (o Claude Code), que se relata a quem o mantém, e o que um plano escrito por você manda o agente fazer.
