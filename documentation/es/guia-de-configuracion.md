<!-- source: documentation/configuration-guide.md blob 42bde5f4fa1e | translated: 2026-09-11 | reviewed: - -->

# Guía de configuración de NarrativeTrace para TypeScript

[English](../configuration-guide.md) | **Español** | [Português](../pt-BR/guia-de-configuracao.md) | [简体中文](../zh-CN/配置指南.md)

Esta guía documenta la configuración de tiempo de ejecución y de pruebas para NarrativeTrace TypeScript.

## 1. Niveles de trazado (`NarrativeTraceConfig`)

`SyncNarrativeContext` y `AsyncNarrativeContext` usan `NarrativeTraceConfig`, que por defecto es `"detail"`.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";

const config = new NarrativeTraceConfig("narrative");
const context = new SyncNarrativeContext(config);
```

Niveles disponibles:

| Level | Behavior |
|---|---|
| `"off"` | No se captura ningún trazado |
| `"errors"` | Solo se capturan las rutas de excepción |
| `"summary"` | Captura la entrada raíz, la hoja más profunda y las cadenas de excepción completas |
| `"narrative"` | Captura el flujo de llamadas completo y omite los valores de los parámetros |
| `"detail"` | Captura el flujo de llamadas completo con los valores de los parámetros y los valores de retorno |

Se admiten cambios de nivel en tiempo de ejecución:

```ts
config.level = "errors";
```

### Funciones auxiliares de nivel

```ts
import { isActiveLevel, isEnabled } from "@narrativetrace/core";

isActiveLevel("off");       // false
isActiveLevel("errors");    // true
isEnabled("detail", "narrative"); // true — detail >= narrative
isEnabled("errors", "detail");    // false — errors < detail
```

## 2. Configuración de Vitest

### Fixture básico (sin salida)

```ts
import { narrativeTest } from "@narrativetrace/vitest";

narrativeTest("my test", ({ narrativeContext }) => {
  // narrativeContext es un SyncNarrativeContext con la configuración predeterminada
});
```

### Con salida a archivo

`createNarrativeTest` escribe los artefactos por su cuenta — el artefacto es
la razón de usarlo, así que no hay que activar nada:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",      // por defecto: "narrativetrace-output"
  formats: ["md", "json", "mmd", "puml"],  // por defecto: ["md", "json", "mmd"]
});
```

Desactívalo para una ejecución que quiera la narrativa en consola y los
metadatos de claridad/glosario pero no los archivos —
`NARRATIVETRACE_OUTPUT=false` (o `outputEnabled: false` en código, o
`"output": "false"` en el archivo de configuración del proyecto). Cualquier
otro valor, incluida la variable sin definir, mantiene la escritura activa.
*(since 0.1.3, unreleased)* La versión actualmente publicada en npm,
`@narrativetrace/vitest@0.1.1`, escribe los archivos incondicionalmente —
`NARRATIVETRACE_OUTPUT` no tiene efecto ahí.

### Estructura de la salida

Los artefactos se agrupan por *módulo* de prueba (el nombre base del archivo de prueba — el
equivalente en esta plataforma al directorio de clase de prueba en Java), con los diagramas en un
árbol reflejado:

```
narrativetrace-output/
  order-service/                 # desde order-service.test.ts
    places_order.md              # narrativa + frontmatter YAML
    places_order.json            # JSON canónico
  diagrams/
    order-service/
      places_order.mmd           # diagrama de secuencia de Mermaid
```

Las pruebas que comparten un nombre en distintos bloques `describe` se mantienen distintas: la
cadena de la suite forma parte del nombre del archivo. Tanto el nombre del módulo como el de la
prueba se sanean, de modo que ninguno puede escribir fuera de `outputDir`.

### Formatos disponibles

| Format | Extension | Renderer |
|--------|-----------|----------|
| `"md"` | `.md` | `renderMarkdown()` con el nombre del escenario |
| `"json"` | `.json` | `exportJson()` con los metadatos del escenario |
| `"mmd"` | `.mmd` | `renderMermaidSequence()` |
| `"puml"` | `.puml` | `renderPlantUmlSequence()` |
| `"clarity-json"` | `.clarity-json` | `exportClarityJson()` con el análisis |
| `"canonical-json"` | `.canonical.json` | `exportCanonicalJson()` — la lista plana de entradas |

`"json"` y `"canonical-json"` describen la misma traza para lectores distintos. `"json"` es el
envoltorio anidado en árbol de capítulos, pensado para personas y herramientas que recorren un
árbol de llamadas. `"canonical-json"` es el arreglo plano de registros enter/exit que declara
[`schema/entry.schema.json`](../../schema/entry.schema.json) — un registro por evento, con claves
alineadas con OTel, el formato en el que están escritos los fixtures de conformidad
multiplataforma. Pide uno u otro, o ambos.

Es determinista a propósito: una traza capturada sin contexto de span (una prueba unitaria simple)
recibe ids de span sintéticos secuenciales y un id de traza sintético fijo, de modo que dos
ejecuciones de la misma prueba producen bytes idénticos. Los alias `canonical` y `canonicalJson` se
aceptan en `NARRATIVETRACE_FORMATS`.

### Nombres de escenario

El nombre de la prueba se usa como el nombre del escenario en los archivos de salida. Los nombres de archivo se sanean (se eliminan los caracteres no alfanuméricos y los espacios se reemplazan por guiones bajos):

- `"customer places order"` → `customer_places_order.md`
- `"order with quantity < 1 fails"` → `order_with_quantity__1_fails.md`

### Encuadre de escenarios

`frameScenario()` convierte los nombres de las pruebas en títulos de escenario legibles para humanos:

- `customerPlacesOrder` → "Customer places order"
- `customer_places_order` → "Customer places order"
- `test_should_validate_input` → "Should validate input"

## 2b. De dónde provienen los ajustes

Los ajustes se resuelven en orden de mayor a menor precedencia. Cada canal completa solo lo que
los canales anteriores dejaron sin definir:

| Precedence | Channel | Example |
|---|---|---|
| 1 (gana) | Opciones explícitas en el código | `createNarrativeTest({ level: "summary" })` |
| 2 | Variable de entorno | `NARRATIVETRACE_LEVEL=off pnpm test` |
| 3 | Archivo de configuración del proyecto | `narrativetrace.config.json` en la raíz del repositorio |
| 4 | Valor predeterminado integrado | `level: "detail"`, `outputDir: "narrativetrace-output"`, `formats: ["md", "json", "mmd"]` |

### Archivo de configuración del proyecto

Coloca **uno** de estos en la raíz de tu proyecto — el que prefiera tu equipo:

```jsonc
// narrativetrace.config.json   (o: .narrativetracerc.json)
{
  "level": "summary",
  "outputDir": "narrativetrace-output",
  "format": "md,json"
}
```

Las claves reflejan las variables de entorno sin el prefijo `NARRATIVETRACE_`: `level`, `output`,
`outputDir`, `format`. `output` es la exclusión voluntaria de escritura de archivos para
`createNarrativeTest` — `"false"` la desactiva, cualquier otra cadena (incluida `"true"`) la deja
activa. Las claves desconocidas y los valores con tipo incorrecto se ignoran, de
modo que un ajuste suelto nunca rompe una ejecución.

### Dos archivos de configuración son un error, no una tirada de moneda

Incluir **ambos** nombres de archivo aceptados hace que la ejecución falle de inmediato:

```
DuplicateConfigurationError: Multiple NarrativeTrace configuration sources
found: narrativetrace.config.json, .narrativetracerc.json.
Keep exactly one and delete the rest.
```

Lo mismo aplica a un archivo de configuración que no es JSON válido, o cuyo nivel superior no es
un objeto. Preferir una fuente en silencio es la manera en que un merge que resucita una
configuración vieja pasa desapercibido durante meses — en cambio, la ejecución se detiene. Un
*valor* que escribiste mal se trata con más indulgencia: un `level` no reconocido cae al valor
predeterminado en lugar de fallar.

Resuelve los ajustes tú mismo con `resolveConfig()` desde `@narrativetrace/core-node`; cada canal
es inyectable (`{ env, projectRoot, read, fallbackLevel }`) para pruebas.

## 3. Opciones de renderizado (`renderValue`)

La función `renderValue()` serializa valores a cadenas de texto. Acepta opciones para controlar el truncamiento:

```ts
import { renderValue } from "@narrativetrace/core";

renderValue(someObject, {
  maxStringLength: 200,   // por defecto: 200 — trunca las cadenas que superen este valor
  maxArrayItems: 5,       // por defecto: 5 — muestra los primeros N elementos del arreglo
  maxObjectKeys: 5,       // por defecto: 5 — muestra las primeras N claves del objeto
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `maxStringLength` | 200 | Las cadenas más largas que este valor se truncan con `"..."` |
| `maxArrayItems` | 5 | Los arreglos muestran los primeros N elementos y luego `... (N total)` |
| `maxObjectKeys` | 5 | Los objetos muestran las primeras N claves y luego `... (N total)` |

### Manejo de tipos

| Type | Rendered as |
|------|-------------|
| `null` | `"null"` |
| `undefined` | `"undefined"` |
| `string` | `"\"hello\""` (entre comillas) |
| `number` | `"42"` |
| `boolean` | `"true"` |
| `bigint` | `"42n"` |
| `symbol` | `"Symbol(name)"` |
| `function` | `"<function>"` |
| `Array` | `[1, 2, 3]` |
| `Object` | `{"key": "value"}` |
| Referencia circular | `"<circular>"` |

## 4. Opciones de Markdown

`renderMarkdown()` acepta opciones para la salida renderizada:

```ts
import { renderMarkdown } from "@narrativetrace/core";

const markdown = renderMarkdown(tree, {
  scenarioName: "Customer places order",   // aparece en el frontmatter YAML
  slowThresholdMs: 200,                     // por defecto: 200 — marca las llamadas lentas
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `scenarioName` | (ninguno) | Se añade al frontmatter YAML |
| `slowThresholdMs` | 200 | Las llamadas más lentas que este valor reciben una marca de advertencia |

### Formato de salida

La salida en Markdown incluye frontmatter YAML y una lista anidada con viñetas:

```markdown
---
scenario: Customer places order
methods: 5
result: success
---

- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `{"orderId": "ORD-1", ...}`
  - `CustomerService.findCustomer(customerId: "C1")` → `{"id": "C1", ...}`
  - `PaymentService.charge(customerId: "C1", amount: 59.98)` → `{"transactionId": "TX-1", ...}`
```

## 5. Ocultación de parámetros (`@notTraced`)

Marca los parámetros sensibles como ocultos para que sus valores nunca aparezcan en la salida de trazas:

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // oculta el parámetro en el índice 1
  login(username: string, password: string) {
    // ...
  }
}
```

La salida de trazas muestra `***` en lugar del valor real:

```
AuthService.login(username: "admin", password: ***)
```

Para ocultación manual (sin decorador), consulta la [Guía de decoradores](guia-de-decoradores.md).

## 6. Opciones de Proxy

`traceObject()` acepta configuración opcional:

```ts
import { traceObject } from "@narrativetrace/proxy";

const traced = traceObject(service, context, paramNames, {
  className: "OrderService",      // sobrescribe el nombre de la clase (por defecto: constructor.name)
  includeReturnValues: true,      // captura los valores de retorno (por defecto: true)
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `className` | `target.constructor.name` | Nombre de clase mostrado en las trazas |
| `includeReturnValues` | `true` | Cuando es `false`, los valores de retorno no se renderizan |

## 7. Valores predeterminados recomendados por entorno

| Environment | Suggested level | Suggested output |
|---|---|---|
| Trabajo local en funcionalidades | `"detail"` | `formats: ["md", "json"]` |
| Ejecuciones de pruebas en CI | `"narrative"` o `"summary"` | `formats: ["md"]` |
| Producción | `"errors"` (o `"off"`) | Sin salida a archivo |

## 8. Almacenamiento en búfer del pipeline de eventos (`BufferedEventConsumer`)

Un contexto construido con los argumentos predeterminados obtiene un `DualPathPipeline(null, new
BufferedEventConsumer())`. La ruta con búfer es la de mejor esfuerzo: una llamada trazada paga una
escritura en el anillo, y un temporizador drena el anillo hacia el almacén de eventos (y hacia
cualquier suscriptor) en ticks posteriores.

```ts
import { BufferedEventConsumer, DualPathPipeline, SyncNarrativeContext } from "@narrativetrace/core";

// Valores predeterminados — dimensionados para un proceso de larga duración en una VM pequeña, contenedor o función en la nube.
const context = new SyncNarrativeContext(config);

// Todos los valores predeterminados se pueden sobrescribir posicionalmente: (capacity, drainIntervalMs, chunkSize)
const highThroughput = new BufferedEventConsumer(262_144, 50, 4096);
const pipeline = new DualPathPipeline(null, highThroughput);
const context2 = new SyncNarrativeContext(config, undefined, pipeline);
```

| Option | Default | Effect |
|--------|---------|--------|
| `capacity` | `65536` (2^16) | **El tamaño fijo del anillo**, y por lo tanto también el límite de eventos sin drenar |
| `drainIntervalMs` | `100` | Período de drenaje. El temporizador solo se ejecuta mientras hay eventos esperando |
| `chunkSize` | `1024` | Eventos drenados por tick |

### El búfer tiene tamaño fijo: nunca crece

`capacity` es el tamaño del anillo, no un límite hacia el que trabaja. No hay capacidad inicial ni
factor de crecimiento: el dimensionamiento es una única decisión, tomada de antemano.

- **No se asigna nada hasta el primer evento.** Un contexto inactivo — una prueba que nunca traza,
  una petición que retorna antes de tiempo — mantiene `allocatedCapacity === 0`. El primer evento
  almacenado en búfer asigna el anillo **completo**, en `capacity`, y se mantiene exactamente en
  ese tamaño durante toda la vida del consumidor, incluso a través de `clear()`.
- **Al llegar al límite, el búfer descarta, nunca bloquea.** El evento sin leer más antiguo se
  sobrescribe y se cuenta en `consumer.overflowCount()`. (`droppedCount()` es un número distinto:
  eventos no entregados porque un *suscriptor* seguía ocupado.) Un `overflowCount()` distinto de
  cero significa una sola cosa: `capacity` es demasiado pequeño.

### Contextos de corta duración: redúcelos

Porque el anillo se asigna completo, la *primera llamada trazada* en un contexto paga por toda la
`capacity`. Eso es gratis para un servidor que construye un contexto y lo conserva, y no es gratis
para el patrón de un contexto por petición, por prueba o por clic en el navegador. Medido por cada
consumidor nuevo (asignar, dos eventos, drenar, cerrar):

| `capacity` | cost per context |
|---|---|
| 1,024 | 0.8 µs |
| 2,048 | 1.1 µs |
| **8,192** | **3.8 µs** |
| 16,384 | 31.7 µs |
| 65,536 | 99.0 µs |

El salto entre 8,192 y 16,384 no es una curva suave: 16,384 punteros son 128 KB, que es el punto
en el que V8 mueve un backing store al large-object space. Mantén el anillo de un contexto de
corta duración por debajo de ese límite.

`@narrativetrace/vitest` ya hace esto por ti — `createNarrativeTest()` le da a cada prueba un
contexto con `DEFAULT_TEST_BUFFER_CAPACITY` (8,192), que se puede sobrescribir por fixture con
`createNarrativeTest({ bufferCapacity: 32_768 })`. Si una ventana de captura se desborda, la
ejecución lo indica: una línea de advertencia que nombra el conteo y el valor al que subir, además
de la misma frase como pie de página en los artefactos de Markdown y de diagramas. Ten en cuenta
que la integración pasa el tamaño de forma **explícita** — el runtime nunca detecta un framework
de pruebas ni cambia su comportamiento, porque un runtime que se comporta distinto bajo pruebas es
un runtime cuyas pruebas no demuestran nada.

Para tus propios contextos de corta duración, haz lo mismo en el punto donde se construyen:

```ts
// Un contexto por petición HTTP, dimensionado para una petición en lugar de un proceso.
const buffer = new BufferedEventConsumer(4096);
const ctx = new SyncNarrativeContext(config, undefined, new DualPathPipeline(null, buffer));
try {
  /* ... maneja la petición, captura la traza ... */
} finally {
  ctx.eventPipeline.close();
}
```

### El temporizador de drenaje y `close()`

- **El temporizador de drenaje arranca con el primer evento en el búfer y se detiene solo cuando
  el búfer termina de drenarse por completo**, y se reinicia con el siguiente evento. Nunca se
  limpia sobre un búfer no vacío, así que una ráfaga seguida de silencio igual se drena hasta el
  final — nada queda varado. Un consumidor inactivo no mantiene ningún temporizador, así que
  descartarlo sin `close()` no deja nada retenido. En Node, el temporizador también recibe
  `unref`, de modo que un drenaje pendiente nunca mantiene vivo al proceso.

**Aun así, llama a `close()` dondequiera que exista un ciclo de vida** — fin de la petición,
teardown de pruebas, apagado. Es la ruta determinista: drena la cola final para que un apagado no
la pierda, detiene el temporizador de inmediato en lugar de en el siguiente tick, y libera a
quienes esperan en `whenClosed()`/`whenCountReached()`. `DualPathPipeline.close()` y
`context.eventPipeline.close()` lo reenvían a él.

### Regla de dimensionamiento — cuándo aumentar la configuración

Para un proceso de larga duración, el anillo solo tiene que cubrir los eventos producidos
*mientras un drenaje está detenido* — se drena cada 100 ms, así que desbordar el valor
predeterminado exige ~655,000 eventos/s sostenidos a lo largo de una ventana. La durabilidad no es
el trabajo de esta ruta; ese es el trabajo del consumidor síncrono del pipeline.

```
capacity ≈ eventos/s pico × peor demora tolerable de drenaje (segundos)
memoria una vez asignada ≈ capacity × ~300 B/evento      (65,536 ≈ ~20 MB)
```

Ejemplo resuelto — un servicio a 1,000 req/s, 50 llamadas trazadas por petición, dos eventos por
llamada (enter + exit):

```
1,000 × 50 × 2             = 100,000 eventos/s
100,000 × 0.5 s de demora  =  50,000 eventos  →  por debajo de 65,536, se mantiene el valor predeterminado
```

Duplica la tasa o la demora tolerada y superas el valor predeterminado: pasa una `capacity` más
grande (y revisa `overflowCount()` en staging). La memoria escala linealmente con ella — 262,144
son ~80 MB, por eso ya no es el valor predeterminado. El búfer nunca encontrará el espacio por sí
mismo, así que el número que pasas es el número que obtienes: demasiado pequeño descarta eventos,
demasiado grande le cobra a cada contexto que asigna uno.

## Ver también

- [Guía de instalación](guia-de-instalacion.md) — dependencias, rutas de integración, configuración de la salida de trazas
- [Guía de decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guía de claridad](guia-de-claridad.md) — modelo de puntuación, componentes de NLP, analizador estático
- [Guía de integración de frameworks](guia-de-integracion-de-frameworks.md) — Express, Hono, navegador, AsyncLocalStorage
