<!-- source: documentation/what-to-commit.md blob d3e208f10c1b | translated: 2026-09-11 | reviewed: - -->
# Qué commitear

[English](../what-to-commit.md) | **Español** | [Português](../pt-BR/o-que-commitar.md) | [简体中文](../zh-CN/应提交的内容.md)

NarrativeTrace escribe ficheros que describen una ejecución de test, por
defecto — una suite que usa `createNarrativeTest` no necesita configurar
nada para obtenerlos. Ninguno de ellos es un contrato revisado y escrito a
mano, como sí lo es una baseline de aprobación en otras implementaciones de
NarrativeTrace — esta implementación todavía no ha lanzado testing
estructural/de aprobación (previsto para una futura versión). Todo lo de
abajo es salida generada, con una excepción.

| Artefacto | ¿Commitear? | Por qué |
|---|---|---|
| `narrativetrace-output/**/*.md` | No | Se regenera en cada ejecución |
| `narrativetrace-output/**/*.json` | No | La misma traza como JSON estructurado — se regenera en cada ejecución |
| `narrativetrace-output/**/*.canonical.json` | No | La exportación canónica con versión de esquema — se regenera en cada ejecución |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | No | Se regenera en cada ejecución |
| `narrativetrace-output/**/*.clarity-json` | No | Puntuaciones de claridad por escenario — se regenera en cada ejecución |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | No | El agregado de toda la suite (vía `ClaritySuiteReporter`) — un informe generado, no una decisión |
| `glossary.json` / `glossary.md` | **Sí**, si se usa la recolección del glosario | Se commitea en la raíz del repositorio una vez recolectado; el fichero commiteado es lo que la puntuación de claridad y las comprobaciones de vocabulario leen de vuelta en cada ejecución posterior — "un fichero, un flujo de revisión" |

Todo lo que está bajo `narrativetrace-output/` es salida. Añádelo a
`.gitignore` si todavía no lo has hecho:

```gitignore
narrativetrace-output/
```

Un job de CI que quiera la narrativa en consola y los metadatos de
claridad/glosario pero ninguno de estos ficheros puede definir
`NARRATIVETRACE_OUTPUT=false` — consulta la
[Guía de configuración](guia-de-configuracion.md#2-configuración-de-vitest).

## La regla en una frase

Si un fichero solo existe porque corrió un test, es salida — no lo
commitees. `glossary.json` es el único fichero de esta lista que se espera
que un humano revise antes de que aterrice: la recolección propone
adiciones, pero commitearlas es la aprobación (consulta la
[Guía de claridad](guia-de-claridad.md) y la
[Guía de funcionalidades § Mejora el código](guia-de-funcionalidades.md#mejora-el-código-diagnóstico-de-claridad)).

## Por qué todavía no hay una fila `.approved.nt` aquí

Algunas implementaciones de NarrativeTrace también incluyen un artefacto estructural
libre de valores y un flujo de aprobación — una baseline commiteada que
hace fallar el build cuando cambia la *forma* de un escenario, revisada y
promovida deliberadamente. Esta implementación todavía no ha construido eso. Hasta
que lo haga, lo más parecido a un contrato revisado que tienes hoy es una
aserción normal en tu test, más lo que sea que el gate de claridad exija
sobre el naming. Si quieres el flujo de trabajo de diff estructural hoy
mismo, trata la exportación JSON (`exportJson`/`.canonical.json`) como tu
propia entrada a una herramienta de snapshot testing de tu elección — es
determinista para una captura libre de contexto, así que una comparación de
snapshot se comporta de forma razonable, pero NarrativeTrace en sí no
gestiona esa baseline por ti todavía.
