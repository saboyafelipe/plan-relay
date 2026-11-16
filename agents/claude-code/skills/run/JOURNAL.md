# O diário

`<pasta>/notes/run-<AAAA-MM-DD>.md`, um por corrida (sufixo `-2`, `-3`… se já existir um fechado nesse dia). Os títulos `## Preflight`, `## Tasks`, `## Closing` e `## Handoff`, a entrada `### <HH:MM> <ID> - <RESULT>` e os valores `prepare`/`decide` são contrato (o `status.sh` e a retomada os procuram); o texto das linhas segue a língua do plano. O diário tem no máximo um `## Handoff`, escrito pela skill `handoff`, e nenhum depois de ter `## Closing`.

```
# Piloto — <pasta> — <AAAA-MM-DD>

## Preflight
- Paralelo: <n> · Decisões: prepare|decide · Janela de 5 h: <limiar> % | sem portão (<status ou «desligar»>)
- Peças opcionais em falta: <peça — frase do briefing>, uma por linha | —
- Progresso no início: <done> de <total> (<pct> %)
- Fronteira do dono: <ID — ação esperada>, uma por linha
- Resolvidas no pré-voo: <ID — resultado>

## Tasks
### <HH:MM> <ID> - <RESULT>
- Nível: <tier> (<modelo>)
- Feito: …
- Decisões [autopilot]: …
- Espera do dono: … | —
- Commits: …
- Canceladas: <ID → substituta — motivo> | —
- Imprevistos: …
- Escalada: escalou de <tier>: <motivo> | —
```

A linha «Nível:» e a «Escalada:» são texto livre, não contrato: servem para calibrar os níveis.
