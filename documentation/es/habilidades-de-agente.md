<!-- source: documentation/agent-skills.md blob 08eec00a160f | translated: 2026-09-13 | reviewed: - -->
# Habilidades de agente

[English](../agent-skills.md) | **Español** | [Português](../pt-BR/habilidades-de-agente.md) | [简体中文](../zh-CN/智能体技能.md)

*(since 0.1.3, unreleased)*

NarrativeTrace distribuye **habilidades**: procedimientos cargables por un agente que ejecutan
comandos probados y condicionan su finalización a un paso `verify`, en lugar de documentación que
un agente puede leer o no. Una habilidad es deliberadamente delgada — la lógica de comprobación,
diagnóstico o generación vive en código de biblioteca probado; el trabajo propio de la habilidad es
saber cuándo actuar, invocar ese código probado, e interpretar el resultado en contexto.

## Dos habilidades: preparación y diagnóstico

- **`add-narrative-tracing`** — instala NarrativeTrace en un proyecto y lo lleva a su primera
  traza: instalar con el toolchain real, envolver una clase, renderizar y ejecutar la primera
  traza, y luego conectar un logger real (equivalente a SLF4J: pino/winston/OpenTelemetry).
  Termina ejecutando `npx narrativetrace doctor` y entregando el relevo — la costura entre las dos
  habilidades.
- **`narrativetrace-doctor`** — solo diagnóstico, y **de solo lectura**: nunca edita, genera ni
  borra un fichero. Ejecuta la CLI probada, lee su informe, y recorre las partes que una simple
  salida de CLI no puede cubrir por sí sola: probar la ocultación en un test, leer una traza
  generada antes de aseverar sobre ella, y el flujo de trazas aprobadas (marcado como no
  estudiado — su propia celda de evaluación sigue pendiente).

Se componen entre sí: un proyecto nuevo empieza con `add-narrative-tracing`; un proyecto que ya
tiene NarrativeTrace instalado, donde algo no funciona, empieza con `narrativetrace-doctor`.
Cualquiera de los dos caminos termina en el doctor — a partir de ahí, el diagnóstico es suyo. Una
habilidad posterior se encargará de la generación (escribir el test de prueba de ocultación que
doctor solo puede pedirte que añadas hoy).

## Instalándolas

- **Claude Code**: en este repositorio hay `SKILL.md` generados en
  [`.claude/skills/add/`](../../.claude/skills/add/SKILL.md) y
  [`.claude/skills/doctor/`](../../.claude/skills/doctor/SKILL.md). Copia cualquiera de esos
  directorios en el `.claude/skills/<nombre>/` de tu propio proyecto y Claude la reconoce por su
  cuenta, invocable como `/narrativetrace:add` / `/narrativetrace:doctor` una vez empaquetada como
  plugin, o por nombre (`add-narrative-tracing` / `narrativetrace-doctor`) directamente.
- **Cualquier agente, cualquier plataforma**: todo agente que lea `AGENTS.md` ve el señalador
  siempre activo que el propio `AGENTS.md` de este repositorio lleva entre sus marcadores
  `<!-- narrativetrace:skills:start -->` — el nombre y la descripción de las dos habilidades, para
  que un agente que nunca pensó en buscarlas igual sepa que existen.
- **Codex, Gemini, y un instalador automático** (`npx narrativetrace init` escribiendo estas rutas
  por ti) están en la hoja de ruta pero todavía no construidos — hoy, copiar los ficheros
  generados es el camino.

## Cómo están construidas

Ninguna habilidad se edita a mano jamás. `packages/skills/src/catalogue/add-narrative-tracing.ts`
y `packages/skills/src/catalogue/narrativetrace-doctor.ts` son las dos fuentes de verdad; `pnpm
run skills-render` regenera `.claude/skills/add/SKILL.md`, `.claude/skills/doctor/SKILL.md`, y la
sección de este mismo `AGENTS.md` a partir de ellas, y `pnpm run skills-check` (integrado en `pnpm
run check`) rompe la build en cuanto cualquiera de las tres se desvía de la fuente tipada. Cada
bloque de código que muestra una página generada se embebe desde código fuente real y probado a
través de la misma convención de marcadores `<!-- snippet: -->` que usan los demás documentos de
este repositorio — nunca un ejemplo escrito a mano. Un lint de Nivel A mantiene fuera de ambas
páginas las citas a notas de planificación privadas: las frases de justificación se publican, la
cita que nombra la nota no.

## Ver también

- [`@narrativetrace/cli`](../../packages/cli/README.md) — el comando `doctor` que ejecuta `narrativetrace-doctor`
- [Sesenta segundos](sesenta-segundos.md) — el recorrido de instalación y primera traza del que salen los pasos de `add-narrative-tracing`
- [Qué commitear](que-commitear.md) — el estado de las trazas aprobadas que comprueba el cuarto paso del doctor
