<!-- source: documentation/what-to-commit.md blob e301471ab2c3 | translated: 2026-09-14 | reviewed: - -->
# Qué commitear

[English](../what-to-commit.md) | **Español** | [Português](../pt-BR/o-que-commitar.md) | [简体中文](../zh-CN/应提交的内容.md)

NarrativeTrace escribe ficheros que describen una ejecución de test, por
defecto — una suite que usa `createNarrativeTest` no necesita configurar
nada para obtenerlos. La mayoría son salida generada, no un contrato
revisado. La única excepción deliberada además de `glossary.json` es la
traza aprobada (`.approved.nt`) *(since 0.1.3)* — actívala con `approval: true` (consulta la
[Guía de configuración](guia-de-configuracion.md#2-configuración-de-vitest))
y se convierte en un contrato revisado y escrito a mano, igual que una
baseline de aprobación en cualquier otra implementación de NarrativeTrace.

| Artefacto | ¿Commitear? | Por qué |
|---|---|---|
| `narrativetrace-output/**/*.md` | No | Se regenera en cada ejecución |
| `narrativetrace-output/**/*.json` | No | La misma traza como JSON estructurado — se regenera en cada ejecución |
| `narrativetrace-output/**/*.canonical.json` | No | La exportación canónica con versión de esquema — se regenera en cada ejecución |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | No | Se regenera en cada ejecución |
| `narrativetrace-output/**/*.clarity-json` | No | Puntuaciones de claridad por escenario — se regenera en cada ejecución |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | No | El agregado de toda la suite (vía `ClaritySuiteReporter`) — un informe generado, no una decisión |
| `narrativetrace-output/structural/**/*.nt` | No | La baseline *local* de último-verde con la que compara el delta de consola y los informes de fallo — no la traza aprobada de abajo |
| `narrativetrace-output/manifest.json` | No | Índice escenario → artefactos, además del `id`/`name` propios de la ejecución *(since 0.1.3)* — se regenera en cada ejecución |
| `<approvedDir>/**/*.approved.nt` | **Sí** | La traza aprobada revisada (solo existe una vez definido `approval: true`) — el único artefacto de esta lista que es una decisión deliberada, no salida |
| `<approvedDir>/**/*.received.nt` | No | Se escribe ante un desajuste de aprobación, o cuando todavía no existe traza aprobada. Revísala, ejecuta `pnpm run approve-narratives` (o `narrativetrace-approve`) para promoverla, y luego bórrala o deja que el script la elimine — nunca commitees la traza recibida en sí |
| `<approvedDir>/**/*.incomplete.nt` | No | Se escribe en vez de `.received.nt` cuando la propia ejecución fue incompleta (un evento descartado, o un scope asíncrono rechazado) — se compara por contención de subsecuencia, nunca promovible |
| `glossary.json` / `glossary.md` | **Sí**, si se usa la recolección del glosario | Se commitea en la raíz del repositorio una vez recolectado; el fichero commiteado es lo que la puntuación de claridad y las comprobaciones de vocabulario leen de vuelta en cada ejecución posterior — "un fichero, un flujo de revisión" |
| `.claude/skills/**/SKILL.md`, `.agents/skills/**/SKILL.md`, la sección `<!-- narrativetrace:skills:* -->` de `AGENTS.md` | **Sí** *(since 0.1.3)* | Salida de compilación del catálogo tipado de `packages/skills` (`pnpm run skills-render`), no salida de una ejecución de test — se commitea igual que `glossary.json`: regenerada, revisada en los diffs, y comprobada contra desviaciones (`pnpm run skills-check`, integrado en `pnpm run check`) en vez de editada a mano |

Todo lo que está bajo `narrativetrace-output/` es salida. Añádelo a
`.gitignore` si todavía no lo has hecho:

```gitignore
narrativetrace-output/
```

`<approvedDir>` (por defecto `narratives/`) no lo es: los ficheros
`.approved.nt` ahí están pensados para ser rastreados, pero un
`.received.nt`/`.incomplete.nt` al lado de uno no queda excluido
automáticamente. Añade una regla de exclusión explícita para esos:

```gitignore
narratives/**/*.received.nt
narratives/**/*.incomplete.nt
```

Un job de CI que quiera la narrativa en consola y los metadatos de
claridad/glosario pero ninguno de estos ficheros puede definir
`NARRATIVETRACE_OUTPUT=false` — consulta la
[Guía de configuración](guia-de-configuracion.md#2-configuración-de-vitest).

## La regla en una frase

Si un fichero solo existe porque corrió un test, es salida — no lo
commitees. Si un fichero existe porque un humano lo revisó y lo aceptó, es
una baseline — commitéalo, y espera que sus diffs se lean en la revisión de
código igual que el diff de un snapshot test. `glossary.json` y
`.approved.nt` son los dos ficheros de esta lista que se espera que un
humano revise antes de que aterricen: la recolección propone adiciones al
glosario y un cambio estructural rechazado escribe una traza recibida, pero
commitear cualquiera de los dos es la aprobación (consulta la
[Guía de claridad](guia-de-claridad.md),
la [Guía de funcionalidades § Mejora el código](guia-de-funcionalidades.md#mejora-el-código-diagnóstico-de-claridad)
y [Structural Trace Format](../structural-trace-format.md) para el
ciclo de aprobación completo — todavía sin traducir).
