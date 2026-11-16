Status: in-progress
Started: 2026-03-02T09:14Z
Type: code
Track: busca
Tier: mid
Blocked by: F0-02

# F1-01 - Índice de ingredientes

## Objetivo

O build escreve `saida/indice.json`, que liga cada ingrediente às receitas que o usam. A página de busca da fase seguinte lê só esse arquivo.

## Ler antes

- `src/build.ts` — onde as receitas são lidas do front matter

## Entregáveis

- `src/indice.ts` — monta o índice a partir das receitas lidas
- `src/indice.test.ts` — duas receitas que compartilham um ingrediente

## Passos

1. Escrever o teste com duas receitas que compartilham um ingrediente; vê-lo falhar.
2. Montar o índice a partir do front matter e escrevê-lo no `build`.

## Done when

- [x] `npm test -- indice` passa, com o ingrediente comum listando as duas receitas.
- [ ] `npm run build` escreve `saida/indice.json` com «cenoura» e as duas receitas do teste.
- [ ] `## Log` preenchido.

## Log

### 2026-03-02 — sessão 1
- Feito: o índice e o teste dele, verde.
- Decisões: os nomes dos ingredientes vão em minúsculas antes de indexar, para «Cenoura» e «cenoura» serem uma entrada só.
- Next step: chamar o índice no `build` e conferir `saida/indice.json`.
