<!-- source: documentation/clarity-guide.md blob ace66e2b1458 | translated: 2026-09-03 | reviewed: - -->

# Guía de claridad de NarrativeTrace TypeScript

[English](../clarity-guide.md) | **Español** | [Português](../pt-BR/guia-de-clareza.md) | [简体中文](../zh-CN/清晰度指南.md)

Si la traza es el código, entonces la calidad de la traza es la calidad del código. El módulo de claridad analiza los nombres de tus métodos, clases y parámetros, y puntúa qué tan bien comunican la intención.

## Inicio rápido

```ts
import { analyzeClarity, renderClarityReport } from "@narrativetrace/clarity";

const result = analyzeClarity(context.captureTrace());
console.log(renderClarityReport([{ scenario: "Order Placement", result }]));
```

Con Vitest, los informes de claridad se generan automáticamente cuando usas el formato `"clarity-json"` — sin necesidad de código.

## Qué se puntúa

La claridad produce una única puntuación global (0.0–1.0) a partir de cinco componentes ponderados:

| Component | Weight | What it measures |
|---|---|---|
| Nombres de métodos | 30% | Calidad del verbo, especificidad de los tokens, abreviaturas, número de tokens |
| Nombres de parámetros | 25% | Especificidad de dominio frente a tokens genéricos o sin significado |
| Nombres de clases | 20% | Calidad del sufijo de rol, especificidad del prefijo |
| Estructural | 15% | Penalizaciones por número de parámetros y profundidad de llamadas |
| Cohesión | 10% | Si los métodos se alinean con el sufijo de rol de la clase |

## La puntuación en la práctica

### Nombres de métodos

El primer token se trata como un verbo. Los verbos de dominio puntúan más alto; los verbos genéricos, más bajo:

| Categoría de verbo | Ejemplos | Puntuación |
|---|---|---|
| Dominio | `calculate`, `validate`, `reserve`, `dispatch` | 0.60 |
| Estándar | `create`, `find`, `delete`, `update` | 0.45 |
| Prefijo booleano | `is`, `has`, `can`, `contains` | 1.00 |
| Genérico | `get`, `set`, `process`, `handle`, `execute` | 0.10 |

Los métodos de varios tokens como `reserveInventory` puntúan más alto que los de un solo token como `reserve`, porque los tokens adicionales añaden especificidad.

### Nombres de clases

Se espera un sufijo de rol. Los sufijos de patrones de diseño y los funcionales puntúan bien cuando van acompañados de un prefijo de dominio:

| Patrón | Puntuación | Por qué |
|---|---|---|
| `OrderService` | 1.0 | Prefijo de dominio + sufijo funcional |
| `Service` | 0.0 | Sin prefijo — sin significado |
| `DataProcessor` | Baja | Prefijo vago + sufijo genérico |
| `BookingManager` | Media | Prefijo de dominio, pero `Manager` es genérico |

### Nombres de parámetros

Los nombres específicos del dominio puntúan alto; los nombres genéricos, bajo:

| Nivel | Ejemplos | Puntuación |
|---|---|---|
| Específico del dominio | `customerId`, `checkInDate`, `roomCategory` | 0.80+ |
| Genérico tipado | `id`, `name`, `count`, `status` | 0.50 |
| Vago | `data`, `info`, `result`, `object` | 0.10 |
| Sin significado | `x`, `foo`, `val`, `temp` | 0.00 |

### Penalizaciones estructurales

Los métodos con más de 4 parámetros o con una profundidad de llamadas superior a 5 se penalizan. Cada parámetro en exceso cuesta 0.1; cada nivel de profundidad en exceso cuesta 0.05.

### Cohesión

Los métodos se comparan con los verbos esperados para el sufijo de rol de la clase. De una clase `Repository` se esperan métodos como `find`, `save`, `delete`, `count`. Un método como `renderReport` en un `GuestRepository` se marca como desalineado.

## Incidencias y severidad

Los problemas de claridad se reportan como incidencias ordenadas por impacto:

| Severidad | Umbral | Ejemplos |
|---|---|---|
| HIGH | puntuación <= 0.20 | `DataProcessor.execute(data)` |
| MEDIUM | puntuación <= 0.50 | `BookingManager.handleBooking(name, type)` |
| LOW | puntuación > 0.50 | Uso menor de abreviaturas |

Las incidencias duplicadas (misma categoría y mismo elemento) se deduplican con un contador de ocurrencias. Las incidencias se ordenan por puntuación de impacto (peso de la severidad x ocurrencias).

## Tu propio vocabulario, a partir del glosario que ya tienes

Los diccionarios integrados conocen el inglés general del software. No saben que
`fold` es un verbo de tu dominio, que `tranche` es un sustantivo preciso, o que `fx`
es la abreviatura aceptada de tu equipo — y un nombre que no conocen se puntúa
como desconocido, no como específico del dominio.

Se los enseñas con el fichero de vocabulario que tu repositorio ya lleva: el
`glossary.json` comiteado (ADR-012). No hay un segundo fichero de diccionario
que mantener sincronizado.

| Entrada del glosario | Tipo | Qué aprende la claridad |
|---|---|---|
| `settle trade` | `verb-phrase` | `settle` es un verbo del dominio; `trade` es un sustantivo del dominio |
| `credit tranche` | `noun-phrase` | `credit` y `tranche` son sustantivos del dominio |
| `foreign exchange` | `noun-phrase` | `foreign` y `exchange` son sustantivos del dominio |

Los términos de varias palabras enseñan token a token, porque los identificadores
se puntúan token a token. Todos los contextos delimitados contribuyen: un
identificador no lleva ruta de módulo, así que el alcance por contexto no puede
aplicarse en el momento de puntuar.

### La abreviatura aceptada se declara, no se infiere

Las abreviaturas viven en su propia sección de nivel raíz (esquema 2 del glosario):

```json
{
  "schemaVersion": 2,
  "abbreviations": { "fx": "foreign exchange", "calc": "calculate" }
}
```

Un token listado es la palabra de tu equipo: el diccionario de abreviaturas deja
de pedir que se desarrolle, y la expansión está ahí para enseñar a partir de ella
cuando se menciona.

**Ser un token de un término comiteado es, deliberadamente, insuficiente.**
Cosechar la frase `calc total` no debe aceptar tácitamente `calc` en todo el
repositorio — nadie leyó `calc` cuando aprobó la frase, y la pista
`calc → calculate` desaparecería en todas partes a la vez. La aceptación es una
decisión que alguien toma.

Esto también mantiene el glosario honesto respecto al lenguaje ubicuo. Para
aceptar `fx` de otro modo tendrías que comitear `fx` como *término* canónico —
pero la palabra del dominio es `foreign exchange`, y tener ambas crea dos
entradas para un solo concepto, justo lo que un glosario existe para evitar
(ADR-012).

La sección es de propiedad humana: la cosecha nunca la escribe, una fusión la
transporta intacta, y se renderiza en `glossary.md` para que la decisión se
revise como cualquier otra. Un glosario que no declara abreviaturas sigue
marcando `"schemaVersion": 1` y se serializa byte a byte igual que antes.

### Lo que el glosario no puede hacer

Los diccionarios integrados conservan su autoridad. Un proyecto puede enseñar a
los puntuadores una palabra que no conocen; no puede anular una que sí conocen.

- **Los verbos genéricos siguen siendo genéricos.** Comitear `process` o
  `handle` no los promociona, y lo mismo vale para los prefijos booleanos
  (`is`, `has`).
- **Los marcadores sin significado siguen sin significado.** `temp`, `foo` y
  compañía no se rescatan por estar escritos.
- **Los sinónimos obsoletos nunca son vocabulario.** Un alias existe para ser
  señalado; promocionarlo silenciaría la incidencia `non-canonical-term` para
  la que está declarado.
- **Los términos `stale` no son vocabulario.** Marcar un término como stale
  dice que la palabra salió del dominio.

Solo cuenta el fichero *comiteado*. Nada de lo que una ejecución recolecte
realimenta las puntuaciones de esa misma ejecución — un vocabulario que se
expande solo haría las puntuaciones no deterministas y autocertificadas. El
commit es la aprobación humana.

### Dónde se aplica

El fixture de Vitest lee el glosario indicado por `NARRATIVETRACE_GLOSSARY_DIR`
(por defecto: el directorio de trabajo), memoizado una vez por proceso worker.
La lectura es incondicional — a diferencia de la cosecha, que es opt-in
(`NARRATIVETRACE_GLOSSARY=true`) porque reescribe ficheros fuera del directorio
de artefactos. Un repositorio sin `glossary.json` puntúa exactamente igual que
antes de que existiera esta funcionalidad, y un glosario que no se puede leer
degrada a los diccionarios integrados con un aviso, en lugar de hacer fallar la
suite.

```ts
import { analyzeClarity } from "@narrativetrace/clarity";
import { projectVocabulary } from "@narrativetrace/vitest";

// Puntuando a mano, fuera del fixture:
const result = analyzeClarity(tree, projectVocabulary());
```

`@narrativetrace/glossary` expone el mapeo en sí — `glossaryVocabulary(glossary)`
para un glosario ya analizado, `readProjectVocabulary(dir, fileReader)` para uno
en disco — de modo que un host que no sea Node pueda aportar su propio acceso a
ficheros.

## Salida del informe

### Escenario único

```ts
import { analyzeClarity, renderClarityReport, type ScenarioResult } from "@narrativetrace/clarity";

const result = analyzeClarity(tree);
const scenarios: ScenarioResult[] = [{ scenario: "Guest books a room", result }];
console.log(renderClarityReport(scenarios));
```

Produce un informe en Markdown con una tabla de puntuaciones y una tabla de incidencias (si las hay):

```markdown
## Clarity Report — Guest books a room
Overall: 0.95 (high)

| Component  | Score |
|------------|-------|
| Method     | 0.98  |
| Class      | 1.00  |
| Parameter  | 0.90  |
| Structural | 1.00  |
| Cohesion   | 0.85  |
```

### Informe de la suite

```ts
const scenarios: ScenarioResult[] = [
  { scenario: "Guest books a room", result: result1 },
  { scenario: "Legacy data processing", result: result2 },
];
console.log(renderClarityReport(scenarios));
```

Produce un resumen ordenado de todos los escenarios. Los escenarios con puntuación inferior a 0.7 reciben un desglose detallado con las incidencias individuales.

### Exportación JSON

```ts
import { exportClarityJson, exportClarityJsonReport } from "@narrativetrace/clarity";

// Escenario único
const json = exportClarityJson(result, { scenario: "Guest books a room" });

// Informe multiescenario
const reportJson = exportClarityJsonReport(scenarios);
```

## Integración con Vitest

Usa el formato `"clarity-json"` con `createNarrativeTest`:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "clarity-json"],
});

test("guest books a room", ({ narrativeContext }) => {
  // ... código de la prueba
});
```

Después de cada prueba, se escribe un fichero `.clarity-json` junto a la salida de la traza.

## CLI del escáner estático

El escáner estático analiza los ficheros fuente directamente — sin necesidad de pruebas:

```bash
npx tsx tools/clarity-scan.ts
```

### Opciones

| Flag | Efecto |
|------|--------|
| `--min-score=0.80` | Sale con error si alguna clase puntúa por debajo del umbral |
| `--json` | Genera la salida en JSON en lugar de Markdown |

### Ejemplos

```bash
# Escanea todos los paquetes, salida legible para humanos
npx tsx tools/clarity-scan.ts

# Exige una puntuación mínima en CI
npx tsx tools/clarity-scan.ts --min-score=0.80

# Salida en JSON para herramientas
npx tsx tools/clarity-scan.ts --json
```

### Cómo funciona

1. Encuentra todos los ficheros fuente `.ts` en los paquetes (excluyendo pruebas y declaraciones)
2. Analiza cada fichero usando la TypeScript Compiler API
3. Extrae las clases con sus métodos y parámetros
4. Ejecuta `analyzeClarity()` en cada clase
5. Renderiza un informe de claridad o sale con error si está por debajo del umbral

## Cumplimiento en CI

La claridad es una barrera del build, no solo un informe. Dos puntos de entrada la exigen, y ambos salen con un código distinto de cero cuando se agota el presupuesto de calidad de nombres, de modo que CI hace fallar el build.

### La barrera `check`

La barrera de calidad raíz `pnpm run check` ejecuta la barrera de claridad como una de sus etapas mediante el script `clarity:gate`:

```bash
# Lo que realmente ejecuta pnpm run clarity:gate:
tsx tools/clarity-scan.ts --min-score 0.4 --max-high-issues 15
```

Esto escanea estáticamente cada fichero fuente de `packages/*/src`, puntúa cada clase, y hace fallar el build si alguna clase puntúa por debajo de `0.4` **o** la suite produce más de `15` incidencias de severidad HIGH. Ajusta esos dos números para mover el listón.

### Flags de `tools/clarity-scan.ts`

El escáner estático acepta tanto la forma `--flag value` como `--flag=value`:

| Flag | Efecto |
|------|--------|
| `--min-score <n>` | Falla si alguna clase escaneada puntúa por debajo de `<n>` |
| `--max-high-issues <n>` | Falla si la suite tiene más de `<n>` incidencias de severidad HIGH |
| `--warn-only` | Imprime las violaciones como `warning:` pero sale con `0` (informa sin bloquear) |
| `--format <both\|md\|json>` | Junto con `--output-dir`, qué artefactos de la suite escribir |
| `--output-dir <dir>` | Escribe `clarity-report.md` y/o `clarity-results.json` en `<dir>` en lugar de imprimir |
| `--json` | Imprime el JSON de la suite en stdout en lugar de Markdown |

**Códigos de salida:** `0` correcto, `1` fallo de la barrera (una violación de `--min-score` o `--max-high-issues` sin `--warn-only`), `2` error de uso (un valor desconocido de `--format`). Ejemplos de invocación en CI:

```bash
# Barrera estricta — falla ante la primera clase por debajo del umbral
tsx tools/clarity-scan.ts --min-score 0.80

# Aplica la barrera sobre el número de incidencias HIGH y emite artefactos para que el pipeline los archive
tsx tools/clarity-scan.ts --max-high-issues 15 --output-dir clarity-out --format both

# Solo observación: muestra advertencias en las PR sin hacer fallar el build todavía
tsx tools/clarity-scan.ts --min-score 0.80 --warn-only
```

### El binario `narrativetrace-clarity`

`@narrativetrace/clarity` también incluye un binario `narrativetrace-clarity`. En lugar de escanear el código fuente, vuelve a renderizar y aplica la barrera sobre un `clarity-results.json` de suite **ya acumulado** (el fichero que escribe el reporter de Vitest — ver más abajo), de modo que encaja en una etapa del pipeline que se ejecuta después de la suite de pruebas:

```bash
narrativetrace-clarity --min-score 0.4 --max-high-issues 15
```

| Flag | Efecto |
|------|--------|
| `--input <file>` | Fichero de resultados a leer (por defecto `<output-dir>/clarity-results.json`) |
| `--output-dir <dir>` | Dónde se escriben los artefactos vueltos a renderizar (por defecto `.`) |
| `--format <both\|md\|json>` | Qué artefactos volver a renderizar |
| `--min-score <n>` | Falla si un escenario puntúa por debajo de `<n>` |
| `--max-high-issues <n>` | Falla si la suite supera `<n>` incidencias de severidad HIGH |
| `--warn-only` | Imprime las violaciones como `warning:` y sale con `0` |

**Códigos de salida:** `0` correcto, `1` fallo de la barrera o un error de E/S (por ejemplo, el fichero de entrada falta o no se puede leer), `2` error de uso (un valor desconocido de `--format` o cualquier argumento desconocido).

### Generar el fichero de resultados desde Vitest

La entrada de la barrera la produce el `ClaritySuiteReporter` de Vitest. Cuando todos los ficheros de prueba de una ejecución han terminado, escribe exactamente **un** `clarity-results.json` y **un** `clarity-report.md` para toda la suite (en el `outputDir` del reporter, que por defecto es `narrativetrace-output`). Una ejecución sin metadatos de claridad no escribe nada. Apunta `narrativetrace-clarity --input` a ese `clarity-results.json` para aplicar la barrera sobre la calidad de nombres agregada de la suite.

## Componentes de NLP

El módulo de claridad usa NLP codificado a mano, sin dependencias externas:

| Componente | Propósito |
|---|---|
| `IdentifierTokenizer` | Divide camelCase, snake_case, guiones bajos y límites numéricos en tokens |
| `VerbDictionary` | Categoriza los verbos en dominio/estándar/genérico/booleano con más de 500 verbos de dominio cubiertos (incluida la cobertura derivada de colocaciones/roles) |
| `RoleSuffixDictionary` | Clasifica los sufijos de clase (patrón de diseño, funcional, genérico) |
| `GenericTokenDetector` | Clasifica la especificidad de los tokens (sin significado -> específico del dominio) |
| `AbbreviationDictionary` | Puntúa 187 abreviaturas en tres niveles (universal, bien conocida, ambigua) |
| `MorphologyAnalyzer` | Detecta categorías gramaticales mediante sufijos (-tion, -ize, -able) |
| `CollocationDictionary` | Valida los emparejamientos verbo-sustantivo entre 209 sustantivos fusionados (semántica de fusión del mapa de dominio) |
| `CohesionScorer` | Comprueba la alineación de los verbos de los métodos con las expectativas del rol de la clase |
| `DomainVocabulary` | Las palabras propias del proyecto, leídas del glosario comiteado; extiende todos los diccionarios anteriores sin anularlos |

## Barreras de protección de los diccionarios

Los diccionarios de claridad están protegidos por barreras automatizadas:

- Invariantes basados en propiedades (`fast-check`) verifican las búsquedas sin distinción de mayúsculas/minúsculas para colocaciones, expectativas de rol y abreviaturas.
- Comprobaciones de consistencia verifican que los verbos de colocación y los verbos esperados por rol siempre estén clasificados por `VerbDictionary`.
- Las pruebas de guarda contra deriva imponen límites inferiores conservadores para el tamaño de los diccionarios e imprimen las métricas actuales durante las ejecuciones de pruebas.

## Véase también

- [Guía de configuración](guia-de-configuracion.md) — niveles de trazado, configuración de la salida
- [Guía de decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guía de instalación](guia-de-instalacion.md) — dependencias y vías de integración
