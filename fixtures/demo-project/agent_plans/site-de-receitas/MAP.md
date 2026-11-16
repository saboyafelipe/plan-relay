# Mapa das tasks

Gerado por `sh agent_plans/site-de-receitas/map.sh` a partir dos cabeçalhos; não editar à mão. O estado de cada task fica só no cabeçalho do próprio arquivo — `sh agent_plans/site-de-receitas/status.sh` mostra-o ao vivo, e o `README.md` diz como se começa uma sessão.

**Caminho crítico** (a cadeia mais longa de bloqueios): F0-01 → F0-02 → F1-01 → F1-03 → F1-04

## Fase 0 — Base

| ID | Task | Tipo | Trilha |
| :--- | :--- | :--- | :--- |
| [F0-01](phase-0-base/F0-01-estrutura.md) | Estrutura do projeto | code | base |
| [F0-02](phase-0-base/F0-02-gerador.md) | Gerador do site | code | base |
| [F0-03](phase-0-base/F0-03-pagina-inicial.md) | Página inicial | code | base |

## Fase 1 — Busca

| ID | Task | Tipo | Trilha |
| :--- | :--- | :--- | :--- |
| [F1-01](phase-1-busca/F1-01-indice.md) | Índice de ingredientes | code | busca |
| [F1-02](phase-1-busca/F1-02-motor-de-busca.md) | Busca no navegador ou índice pré-calculado | decision | busca |
| [F1-03](phase-1-busca/F1-03-pagina-de-busca.md) | Página de busca | code | busca |
| [F1-04](phase-1-busca/F1-04-sinonimos.md) | Sinônimos de ingredientes | code | busca |
| [F1-05](phase-1-busca/F1-05-busca-por-voz.md) | Busca por voz | prototype | busca |

