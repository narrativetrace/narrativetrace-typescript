<!-- source: documentation/agent-skills.md blob 1b2fe91ce174 | translated: 2026-10-09 | reviewed: - -->
# Habilidades de agente

[English](../agent-skills.md) | **Español** | [Português](../pt-BR/habilidades-de-agente.md) | [简体中文](../zh-CN/智能体技能.md)

NarrativeTrace distribuye **habilidades**: procedimientos cargables por un agente que ejecutan
comandos probados y condicionan su finalización a un paso `verify`, en lugar de documentación que
un agente puede leer o no. Una habilidad es deliberadamente delgada — la lógica de comprobación,
diagnóstico o generación vive en código de biblioteca probado; el trabajo propio de la habilidad es
saber cuándo actuar, invocar ese código probado, e interpretar el resultado en contexto.

## Seis habilidades: preparación, diagnóstico, claridad, informe, verificación y depuración

- **`add-narrative-tracing`** — instala NarrativeTrace en un proyecto y lo lleva a su primera
  traza: instalar con el toolchain real, conectar los frameworks que el proyecto ya usa ejecutando
  el doctor y aplicando cada corrección `config.<framework>-*` que imprime (la página no nombra
  ningún framework: la tabla de frameworks del propio doctor instalado es el oráculo), envolver una
  clase, renderizar y ejecutar la primera traza, y luego conectar un logger real
  (pino/winston/OpenTelemetry).
  Termina ejecutando `npx @narrativetrace/cli doctor` y entregando el relevo — la costura entre las dos
  habilidades.
- **`narrativetrace-doctor`** — solo diagnóstico, y **de solo lectura**: nunca edita, genera ni
  borra un fichero. Ejecuta la CLI probada, lee su informe, y recorre las partes que una simple
  salida de CLI no puede cubrir por sí sola: probar la ocultación en un test, leer una traza
  generada antes de aseverar sobre ella, y el flujo de trazas aprobadas (marcado como no
  estudiado — su propia celda de evaluación sigue pendiente).
- **`add-narrativetrace-clarity`** — añade o verifica un informe de nombres en un proyecto Vitest:
  registra `ClaritySuiteReporter` desde `@narrativetrace/vitest/reporters`, ejecuta la suite,
  comprueba que `clarity-results.json` sea reciente y no esté vacío, lee las puntuaciones y los
  problemas, y los explica. Renombra según las propias sugerencias del informe y repite hasta que
  `npx narrativetrace-clarity` salga limpio, y añade una puerta a los scripts del paquete solo si se
  lo piden — sin rebajar nunca un umbral que el proyecto ya tenga.
- **`narrativetrace-feedback`** — informa de un defecto en el propio NarrativeTrace: una comprobación
  del doctor que es errónea o cuya corrección no funciona, un paso de habilidad que no se puede
  seguir, una redacción del prompt de instalación que llevó a un sitio equivocado, o la biblioteca
  portándose mal en un proyecto bien configurado. El verbo probado que hay detrás,
  `narrativetrace feedback`, redacta el informe a partir del proyecto (las coordenadas de
  instalación, el propio informe JSON del doctor y, como máximo, una traza estructural) y **se
  niega a escribir un informe que lleve un valor de tus trazas** — nombrando la regla que lo
  rechazó, de modo que haya algo concreto que corregir y no una advertencia que ignorar. La
  habilidad muestra entonces el borrador completo y pregunta una sola vez si se presenta
  públicamente. No envía nada a ningún sitio y no presenta nada sin una respuesta dada en un turno
  propio.
- **`narrativetrace-verify`** — lee lo que un cambio hizo realmente antes de que el agente diga que
  está terminado. Se ejecuta con los tests en verde y empieza con una regla de coste que dice en voz
  alta: traza un cambio que cruza colaboradores, bifurca, reintenta, corre de forma asíncrona o
  arrastra estado; omite una función pura o una edición de una sola clase, y explica por qué. Luego
  escribe la intención **antes** de la ejecución (una traza leída contra nada confirma lo que sea
  que haya pasado), ejecuta el camino real más pequeño, lee el `.nt` estructural, sin valores,
  contra la intención, abre los valores en un solo span, e informa de lo que mostró la traza —
  cada afirmación citando un id de span (`#1.3`). Sus últimos pasos **fijan** el flujo: modo de
  aprobación activado, la suite entera ejecutada, el `.received.nt` mostrado completo, una
  pregunta, y la promoción solo después de tu sí.
- **`narrativetrace-debug`** — parte de un síntoma, no de un cambio: lo reproduce con el trazado
  activado, nombra por id de span el primer span donde un valor diverge **antes** de cambiar
  cualquier código, se acota al subárbol de ese span envolviendo un colaborador más (nunca
  `@notTraced`, que oculta), lo corrige en ese span, comprueba que la traza estructural no muestra
  que se haya movido nada más, y fija la reproducción como test de regresión tras la misma puerta.
  Un defecto en el propio NarrativeTrace va a `narrativetrace-feedback` en vez de rodearse.

Se componen entre sí: un proyecto nuevo empieza con `add-narrative-tracing`; un proyecto que ya
tiene NarrativeTrace instalado, donde algo no funciona, empieza con `narrativetrace-doctor`.
Cualquiera de los dos caminos termina en el doctor — a partir de ahí, el diagnóstico es suyo.
`add-narrativetrace-clarity` se encarga de los primeros informes de nombres y de la exigencia opcional
de claridad; no instala el trazado ni recolecta un glosario, y ningún hallazgo del doctor apunta a
ella, porque nada falla por no tener un informe. `narrativetrace-feedback` es donde termina un camino cuando el problema resulta ser nuestro y no del
proyecto — la regla de cierre del propio doctor apunta a ella. Una
habilidad posterior se encargará de la generación (escribir el test de prueba de ocultación que
doctor solo puede pedirte que añadas hoy).
`narrativetrace-verify` es donde empieza la siguiente sesión una vez que el trazado funciona — el
último paso de la habilidad de instalación le pasa el relevo — y `narrativetrace-debug` es donde
empieza un síntoma reportado. Ambas renderizan una misma sección compartida de «cómo leer una
traza», así que nunca enseñan dos maneras de leer un mismo fichero.

## Instalándolas

- **`npx @narrativetrace/cli init`** — el camino más rápido, para cualquier proyecto: primero
  previsualiza el plan y un diff unificado (`--dry-run`, no escribe nada), y luego aplica
  exactamente lo que mostró la previsualización. Copia las seis habilidades en `.agents/skills/` — y
  en `.claude/skills/` cuando el proyecto es de ese proveedor — y escribe una sección marcada en
  `AGENTS.md`; un `CLAUDE.md` que ya exista recibe una línea `@AGENTS.md`, ninguno se crea. Vuelve
  a ejecutarlo cuando quieras para refrescar: no hay gancho de build, y una nueva ejecución
  reescribe solo las páginas y la sección que le pertenecen. Consulta
  [`@narrativetrace/cli`](../../packages/cli/README.md#narrativetrace-init) para ver todas las
  opciones; la previsualización contra un proyecto vacío se muestra más abajo.
- **Copiar los ficheros generados a mano** sigue siendo el respaldo — las mismas rutas que escribe
  `init`, pero sin la línea de procedencia y sin que tú actualices la sección de `AGENTS.md` por tu
  cuenta. **Claude Code**: en este repositorio hay `SKILL.md` generados en
  [`.claude/skills/add-narrative-tracing/`](../../.claude/skills/add-narrative-tracing/SKILL.md) y
  [`.claude/skills/narrativetrace-doctor/`](../../.claude/skills/narrativetrace-doctor/SKILL.md) y
  [`.claude/skills/narrativetrace-feedback/`](../../.claude/skills/narrativetrace-feedback/SKILL.md) y
  [`.claude/skills/add-narrativetrace-clarity/`](../../.claude/skills/add-narrativetrace-clarity/SKILL.md) y
  [`.claude/skills/narrativetrace-verify/`](../../.claude/skills/narrativetrace-verify/SKILL.md) y
  [`.claude/skills/narrativetrace-debug/`](../../.claude/skills/narrativetrace-debug/SKILL.md),
  cada directorio con el nombre canónico de su habilidad — el prefijo del plugin de Claude es el
  único lugar donde un segmento acortado es legítimo, y nada en este repositorio es un plugin.
  Copia cualquiera de ellos en el `.claude/skills/<nombre>/` de tu propio proyecto y
  Claude la reconoce por su cuenta, invocable por nombre (`add-narrative-tracing` /
  `narrativetrace-doctor` / `narrativetrace-feedback` / `add-narrativetrace-clarity` / `narrativetrace-verify` / `narrativetrace-debug`) directamente. **Codex**: los `SKILL.md` generados también viven en
  [`.agents/skills/add-narrative-tracing/`](../../.agents/skills/add-narrative-tracing/SKILL.md) y
  [`.agents/skills/narrativetrace-doctor/`](../../.agents/skills/narrativetrace-doctor/SKILL.md) y
  [`.agents/skills/narrativetrace-feedback/`](../../.agents/skills/narrativetrace-feedback/SKILL.md) y
  [`.agents/skills/add-narrativetrace-clarity/`](../../.agents/skills/add-narrativetrace-clarity/SKILL.md) y
  [`.agents/skills/narrativetrace-verify/`](../../.agents/skills/narrativetrace-verify/SKILL.md) y
  [`.agents/skills/narrativetrace-debug/`](../../.agents/skills/narrativetrace-debug/SKILL.md) —
  el layout que la CLI de Codex descubre por sí sola, subiendo desde el directorio de trabajo hasta
  la raíz del repositorio (y también `~/.agents/skills` para habilidades globales de usuario). Su
  frontmatter es un subconjunto estricto del de Claude (solo `name` y `description` — sin
  `when_to_use`, sin `allowed-tools`), así que el mismo cuerpo de página se distribuye bajo ambos
  layouts. Fuente: developers.openai.com/codex/skills y
  developers.openai.com/codex/concepts/customization (obtenido el 2026-09-13).
- **Cualquier agente, cualquier plataforma**: todo agente que lea `AGENTS.md` ve el señalador
  siempre activo que el propio `AGENTS.md` de este repositorio lleva entre sus marcadores
  `<!-- narrativetrace:skills:start -->` — el nombre y la descripción de las seis habilidades, para
  que un agente que nunca pensó en buscarlas igual sepa que existen.
- **Gemini** está en la hoja de ruta pero todavía no se ha construido.

Una previsualización `--dry-run --json` contra un proyecto vacío luce así:

```json
{
  "carrier": "@narrativetrace/skills@0.3.0",
  "actions": [
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-doctor/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/add-narrative-tracing/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-feedback/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/add-narrativetrace-clarity/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-verify/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-debug/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": "AGENTS.md",
      "status": "planned"
    }
  ],
  "exitCode": 0
}
```

## Desde un registro

Un proyecto puede llevar estas habilidades sin que nadie aquí ejecute nunca el instalador, en uno
de tres estados:

1. **Instalado por `init`** — commiteado, del equipo. El único estado que `config.skills-installed`
   aprueba: las páginas llevan la línea de procedencia y coinciden con la versión que este proyecto
   resuelve.
2. **Una instalación personal desde un registro** (una caché de plugins de Claude Code) — solo
   tuya. Invisible para el doctor por diseño: diagnostica el proyecto, y una instalación personal
   no llega a ningún compañero de equipo ni a ningún otro agente.
3. **Una instalación de registro dentro del proyecto** (`npx skills add`) — las páginas generadas
   por este mismo repositorio, aterrizadas por un registro en vez de por `init`, así que todavía no
   llevan línea de procedencia.

Probar las habilidades por tu cuenta, sin tocar el proyecto:

```text
/plugin marketplace add narrativetrace/narrativetrace-typescript
/plugin install narrativetrace-typescript@narrativetrace-typescript
```

luego ejecuta `npx @narrativetrace/cli init --dry-run`, lee el diff, y ejecútalo sin la opción para
que `AGENTS.md` apunte a ellas.

Instalar en el proyecto desde el registro del estándar abierto:

```text
npx skills add narrativetrace/narrativetrace-typescript
```

luego ejecuta `npx @narrativetrace/cli init --dry-run`, lee el diff, y ejecútalo sin la opción para
que `AGENTS.md` apunte a ellas.

Una página que deja atrás un registro nunca se rechaza solo por estar ahí. `init` la compara, byte
a byte, normalizando solo el fin de línea, contra lo que habría generado por sí mismo. Una
idéntica a la propia página de esta versión queda **adoptada** — así lo dice el plan, en vez de
"reemplazada", porque quien lo lee tiene que saber que no se sobrescribió nada suyo. Este es el
propio texto del plan, citado, nunca retecleado aquí:

```ts
const ADOPTED = "adopted: identical to this carrier's page, so only the provenance line is added";
```

Una página que difiere — otra versión, o editada a mano — conserva el rechazo ordinario para el
que está `--force`. `npx skills add` también deja `.claude/skills/<nombre>` como un enlace
simbólico a la página del estándar abierto; `init` nunca escribe a través de un enlace como ese.
Un enlace cuyo destino adoptaría o ya posee se reemplaza por un directorio real con el sabor
correcto; cualquier otro enlace se rechaza, porque `--force` cubre contenido, nunca un enlace.

Y este es el propio arreglo del doctor, citado del mismo modo, para un proyecto donde las páginas
están, pero no llevan nada de esto:

```ts
const INIT_DRY_RUN = "npx --yes @narrativetrace/cli init --dry-run";
const NOT_OURS = " (there, but not ours)";

/**
 * What a page with no provenance line most often IS: a registry install (design D5 state 3) — `npx
 * skills add`, or a plugin or workspace install — of this repository's own rendered pages. Naming the
 * case matters because the obvious reading of "not ours" is "somebody else's work", which invites a
 * `--force` nobody needs: `init` ADOPTS a page identical to this release's.
 */
const FROM_A_REGISTRY =
  " Pages that are there without our line usually came from a registry (npx skills add, a plugin" +
  " or workspace install). A page identical to this release's is adopted, and no --force is needed.";
```

## Cómo están construidas

Ninguna habilidad se edita a mano jamás.
`packages/skills-catalogue/src/catalogue/add-narrative-tracing.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-doctor.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-feedback.ts`,
`packages/skills-catalogue/src/catalogue/add-narrativetrace-clarity.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-verify.ts` y
`packages/skills-catalogue/src/catalogue/narrativetrace-debug.ts` son las seis fuentes de verdad
(la sección de lectura, la puerta de aprobación y la fijación que comparten las tres últimas se
escriben una sola vez, a su lado);
`pnpm run skills-render` regenera las páginas `.claude/skills/` y `.agents/skills/` de cada
habilidad, y la sección de este mismo `AGENTS.md`, a partir de ellas, y `pnpm run skills-check`
(integrado en `pnpm
run check`) rompe la build en cuanto cualquier página generada se desvía de la fuente tipada. Cada
bloque de código que muestra una página generada se embebe desde código fuente real y probado a
través de la misma convención de marcadores `<!-- snippet: -->` que usan los demás documentos de
este repositorio — nunca un ejemplo escrito a mano. Un lint de Nivel A mantiene fuera de las
páginas las citas a notas de planificación privadas: las frases de justificación se publican, la
cita que nombra la nota no. Un segundo lint vigila el único fragmento de frontmatter cuya ausencia
es una virtud: una habilidad cuyos pasos pueden hacer algo público — hoy, `narrativetrace-feedback`
— no debe declarar `allowed-tools`, porque ese campo preaprueba sus herramientas listadas durante el
turno que carga la habilidad, y una habilidad de informes que preaprobara su propio comando de
informe haría que el arnés dejara de preguntar justo donde preguntar es el punto. Un tercer lint mantiene
la misma línea para las dos habilidades que promueven una línea base de aprobación
(`narrativetrace-verify`, `narrativetrace-debug`): una habilidad que ejecuta el comando de
aprobación no declara ninguna herramienta permitida.

## Ver también

- [`@narrativetrace/cli`](../../packages/cli/README.md) — el comando `doctor` que ejecuta `narrativetrace-doctor`, y el comando `feedback` que maneja `narrativetrace-feedback`
- [Sesenta segundos](sesenta-segundos.md) — el recorrido de instalación y primera traza del que salen los pasos de `add-narrative-tracing`
- [Qué commitear](que-commitear.md) — el estado de las trazas aprobadas que comprueba el cuarto paso del doctor
