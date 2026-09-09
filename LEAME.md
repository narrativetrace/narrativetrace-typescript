<!-- source: README.md blob 1aa23462ce95 | translated: 2026-09-07 | reviewed: - -->
# NarrativeTrace

[English](README.md) | **Español** | [Português](LEIAME.md) | [简体中文](自述文件.md)

> El código es el log.

Logging sin código: usa los nombres de tus métodos y parámetros como el log. Si la traza es ilegible, tu código necesita refactorización — no más sentencias de log.

Con prisa: [pruébalo en local](#pruébalo-en-local) → [añádelo a una prueba](#añádelo-a-una-prueba) → [elige tu integración](#elige-tu-integración).

## El problema

La mitad de este método es ruido de logging:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  console.log(`Placing order for customer ${customerId} product ${productId} quantity ${quantity}`);

  const customer = this.customers.findCustomer(customerId);
  console.log('Found customer:', customer);

  const price = this.catalog.lookupPrice(productId);
  console.log('Looked up price:', price);

  this.inventory.reserve(productId, quantity);
  console.log('Reserved inventory');

  const confirmation = this.payments.charge(customerId, price * quantity);
  console.log('Payment processed:', confirmation.transactionId);

  const result = { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
  console.log('Order placed:', result);
  return result;
}
```

La lógica de negocio son cinco líneas. El logging, otras seis. Cada desarrollador escribe estos logs de forma distinta — mensajes distintos, niveles distintos, valores incluidos distintos. El resultado es inconsistente, verboso y está enredado con el código que describe.

NarrativeTrace elimina esto por completo:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  this.customers.findCustomer(customerId);
  const price = this.catalog.lookupPrice(productId);
  this.inventory.reserve(productId, quantity);
  const confirmation = this.payments.charge(customerId, price * quantity);
  return { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
}
```

Lógica de negocio pura. La traza se genera automáticamente a partir de los nombres de los métodos, los nombres de los parámetros y los valores de retorno — la información que ya estaba ahí.

## Lo que obtienes en su lugar

Ejecuta tu código y obtén trazas de ejecución como esta:

```
OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)
  CustomerService.findCustomer(customerId: "C1") -> {"id": "C1", "name": "Alice", "tier": "gold"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 2) -> {"productId": "P1", "quantity": 2}
  PaymentService.charge(customerId: "C1", amount: 59.98) -> {"transactionId": "TX-1", "amount": 59.98}
-> {"orderId": "ORD-1", "transactionId": "TX-1", "totalCharged": 59.98, "itemCount": 2}
```

## Cuando algo sale mal

La traza hace visibles los bugs:

```
OrderService.placeOrder(customerId: "C3", productId: "P1", quantity: 3)
  CustomerService.findCustomer(customerId: "C3") -> {"id": "C3", "name": "Charlie", "tier": "platinum"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 3) -> {"productId": "P1", "quantity": 3}
  PaymentService.charge(customerId: "C3", amount: 89.97) !! Error: Payment declined for customer: C3
!! Error: Payment declined for customer: C3
```

`InventoryService.reserve` fue llamado pero `InventoryService.release` no aparece en ninguna parte de la traza. El bug es visible.

## La traza es tan buena como tus nombres

El mismo flujo de "un jugador se une al mundo" de Minecraft, trazado dos veces — una con nombres de dominio, otra con nombres genéricos:

**Refactorizado (nombres limpios):**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", "blockCount": 65536}
  PlayerInventory.addItem(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> {"type": "zombie", "x": 10, "y": 64, "z": 10, "health": 20}
-> "Steve joined the world in plains biome"
```

**Sin refactorizar (nombres genéricos):**
```
GameManager.handle(input: "Steve")
  DataProcessor.process(a: 0, b: 0) -> {"a": 0, "b": 0, "label": "plains", "count": 65536}
  StateManager.update(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  ThingFactory.create(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  EntityHandler.execute(kind: "zombie", a: 10, b: 64, c: 10) -> {"kind": "zombie", "a": 10, "b": 64, "c": 10, "value": 20}
-> "Steve joined the world in plains biome"
```

Mismo grafo de llamadas. Mismos valores de retorno. Solo cambian los nombres. Si tu código no puede contar su propia historia, necesita refactorización — por eso NarrativeTrace también [puntúa tu naming](#puntuación-de-claridad).

## Por qué esto importa para el desarrollo asistido por IA

Cada línea `console.log(...)` o `logger.trace(...)`/`logger.debug(...)`/`logger.info(...)` es una línea que las herramientas de IA para programar tienen que analizar, gastar tokens en procesar y razonar alrededor de ella. En una clase de servicio típica, el logging es del 30 al 50 % de las líneas. Quita esas líneas y obtienes:

- **Más lógica de negocio por ventana de contexto** — el mismo presupuesto de tokens cubre más de tu código real.
- **Razonamiento más limpio** — la IA ve lo que hace el código, no cómo registra lo que hace.
- **Diffs de solo señal** — los pull requests muestran cambios de lógica de negocio, no cambios mezclados de lógica y logging.

No es un beneficio vago — es medible en tokens.

## Puntuación de claridad

Si la traza *es* el código, entonces la calidad de la traza *es* la calidad del código. NarrativeTrace incluye un analizador de claridad que puntúa los nombres de tus métodos, clases y parámetros:

```
## Clarity Report — Order Placement
Overall: 0.92 (high)

| Element     | Score | Note                    |
|-------------|-------|--------------------------|
| placeOrder  | 1.00  | Strong verb + object    |
| customerId  | 1.00  | Domain-specific noun    |
| processData | 0.30  | Generic verb + generic noun |
```

Los nombres genéricos como `processData`, `handleRequest`, `result` puntúan bajo. Los nombres específicos del dominio como `reserveInventory`, `customerId` puntúan alto. El informe de claridad se genera automáticamente en cuanto lo escribes en una ejecución de Vitest — consulta [Primeros 10 minutos](documentation/es/primeros-10-minutos.md#6-renombra-placeorder-a-process-y-observa-cómo-cae-la-claridad) para ver un antes/después real.

La puntuación de claridad todavía es experimental.

## Cómo se compara

Si estás en un stack empresarial, normalmente ya tienes:

- plataformas centralizadas de logs (Datadog, ELK, Cloud Logging)
- backends de tracing distribuido (OpenTelemetry, Jaeger, Tempo)
- alertas y dashboards de SLO

NarrativeTrace está diseñado para sustituir el logging manual de aplicación en producción. Mantienes tus sinks y pipelines actuales; NarrativeTrace se convierte en la fuente de los eventos de aplicación.

| Aspecto | Stack de logging empresarial | NarrativeTrace |
|---------|--------------------------|----------------|
| Objetivo principal | Operabilidad, respuesta a incidentes, cumplimiento | El mismo objetivo de producción, pero generado directamente a partir de la estructura del código |
| Modelo de datos | Eventos + campos + spans + métricas escritos a mano | Narrativas de llamadas a métodos con parámetros nombrados, valores de retorno y errores |
| Estilo de instrumentación | Llamadas `logger.*` manuales + cableado de telemetría | Captura autogenerada, luego exportación a los sinks empresariales existentes |
| Mejor en | Búsqueda centralizada, retención, alertas | Eventos de aplicación de alta fidelidad y bajo drift sin boilerplate de logging |
| Punto débil | La calidad del evento depende de las sentencias de log escritas a mano | Requiere disciplina de naming para mantener las trazas claras |

`console.log` manual es la base más débil: disperso, inconsistente y mezclado con la lógica de negocio. NarrativeTrace elimina ese ruido de logging derivando la traza de la estructura del código.

Modelo de producción:

- mantén tu plataforma de observabilidad y alertas actuales
- sustituye las sentencias de logging manual de la aplicación por la captura de NarrativeTrace
- enruta la salida de NarrativeTrace a los mismos sinks que tu organización ya opera

**Puente con OpenTelemetry:** `@narrativetrace/opentelemetry` proyecta las narrativas sobre spans de
OTel — un `createOtelEventConsumer` en vivo que inicia/cierra spans a medida que se ejecutan los
métodos, y un `TraceSpanExporter` por lotes que convierte un árbol capturado en spans anidados a
posteriori. Cada span lleva atributos de esquema `nt.trace_id`/`nt.*` y valores tipados
`narrative.param.<name>`, así que tus vistas de traza existentes de Jaeger/Tempo/Datadog se activan
sin spans instrumentados a mano. Los enriquecedores de logs (`winston`, `pino`, `observability`)
estampan `trace_id`, `service.*` y `nt.depth` en cada línea para la misma correlación.

## Lo que NarrativeTrace reemplaza (y lo que no)

NarrativeTrace reemplaza las sentencias de narración que escribes a mano para describir una llamada — no tu stack de logging:

```ts
logger.info(`Placing order for customer ${customerId} product ${productId}`);
```

Esa línea desaparece; la propia llamada al método ya lleva la información. Por defecto nada más cambia: ningún logger se toca en absoluto — una captura se almacena en un buffer en memoria y se exporta mediante `captureTrace()` (archivos Markdown/JSON/prosa), o se imprime a posteriori con `renderToConsole` en el navegador.

Conecta `@narrativetrace/pino` o `@narrativetrace/winston` y NarrativeTrace se convierte en un emisor en vivo: `createPinoEventConsumer`/`createWinstonEventConsumer` llaman directamente a tu propia instancia de `Logger` (`logger.trace()`/`logger.warn()`, configurable por evento), así que cada transporte, formateador y destino de envío que ya configuraste sigue funcionando, intacto — NarrativeTrace es una llamada más a tu logger, no un reemplazo de él. El logging manual que sigues escribiendo a propósito — una línea de auditoría, una métrica de negocio, cualquier cosa que no sea solo narrar el flujo de control — se ejecuta en el mismo logger, intercalado con las propias líneas de NarrativeTrace. ¿Quieres correlación sin generar ninguna línea? El `createLogEnricher` de `@narrativetrace/observability` estampa los campos `trace_id`/`nt.*` sobre las llamadas al logger que sigues escribiendo a mano; nunca emite nada por sí mismo.

## Pruébalo en local

Sin proyecto, sin cableado — el repositorio incluye un lanzador de demo que ejecuta las aplicaciones de ejemplo y las narra en vivo (la primera ejecución necesita un build):

```bash
pnpm install                                   # una vez
pnpm run build && pnpm demo                    # selector interactivo: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce               # seis escenarios, stream en vivo → ← !!, un punto de parada por escenario
pnpm demo -- --example ecommerce --classic     # la misma ejecución como logs con timestamp a través del puente de winston
pnpm demo -- --example ecommerce --lang es     # la misma ejecución renderizada de nuevo a través del glossary.json del ejemplo
```

Cada escenario empieza con una nota sobre cómo está cableada su traza — decoradores, `traceObject`,
fork/join — y cada renderizado (árbol, prosa, Mermaid, PlantUML) se anuncia como su propia sección.
Detalles en la [Guía de Ejemplos](documentation/es/guia-de-ejemplos.md#lanzador-de-la-demo).

## Añádelo a una prueba

El camino más corto de "biblioteca interesante" a "vi una traza útil de mi propio código" es el fixture de Vitest. Node 20+ (CI usa la versión 22), TypeScript 5.0+ si usas los decoradores de abajo.

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

La publicación en npm está en preparación — hasta que los paquetes estén en el
registro, constrúyelos desde este repositorio (ver [Compilar desde el código
fuente](#compilar-desde-el-código-fuente)).

```ts
// order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C1", "P1", 2);
});
```

Ejecuta `npx vitest run` y abre `narrativetrace-output/order-service/customer_places_order.md` — el
nombre del test se convirtió en el nombre del escenario, sin necesidad de interfaz ni plugin de build
(`traceObject` envuelve directamente el objeto concreto).

¿Quieres seguir avanzando — renombrar el método y ver caer la puntuación de claridad, añadir
`@notTraced` y ver un valor censurado? → [Primeros 10 minutos](documentation/es/primeros-10-minutos.md)
recorre los siete pasos con salida real, ejecutada de verdad.

## Elige tu integración

Los tests son donde la mayoría empieza. Esto es a dónde vas después:

| Quieres | Empieza con |
|---|---|
| Trazas en tests, con el mínimo cableado | `@narrativetrace/vitest` (`createNarrativeTest`) |
| Elegir exactamente qué se envuelve, en TypeScript/JavaScript plano | `@narrativetrace/proxy` (`traceObject`) directamente |
| Tracing por petición en una app Express | `@narrativetrace/express` |
| Tracing por petición en Hono (edge/serverless) | `@narrativetrace/hono` |
| Tracing de proveedores Nest sin código de aplicación | `@narrativetrace/nestjs` (`AutoProxyModule`) |
| Tracing de servicios/DI de Angular + correlación HTTP | `@narrativetrace/angular` |
| Tracing de componentes/servicios de React | `@narrativetrace/react` (+ `@narrativetrace/react-router` para navegación) |
| Página de navegador con bundler | `@narrativetrace/core-web` + `@narrativetrace/browser` |
| Página de navegador, sin bundler, `<script>` clásico | `@narrativetrace/standalone` |
| Visibilidad cross-request/async en Node | `AsyncNarrativeContext` (respaldado por `AsyncLocalStorage`) |
| Trazas en tu stream de logs de producción | `@narrativetrace/winston` o `@narrativetrace/pino` |
| Spans de OpenTelemetry | `@narrativetrace/opentelemetry` |

No hay un camino de cero código, "envuelve una app que no escribiste" — no hay equivalente a un
agente de Java. `Proxy` y los decoradores necesitan un call site o una clase que puedas anotar; un
hook de loader `require`/ESM se descartó deliberadamente por ser frágil entre versiones de Node y
quedar completamente evitado por bundlers y navegadores. Diagrama de decisión completo, salvedades
por camino y el razonamiento detrás del techo de la plataforma:
[Eligiendo una integración](documentation/es/eligiendo-una-integracion.md).

## Paquetes

Los 21 paquetes:

| Paquete | La necesitas cuando... |
|---------|---------------------|
| `@narrativetrace/core` | Siempre requerido. Sin dependencias en runtime; agnóstico de plataforma. |
| `@narrativetrace/core-node` | Runtime de Node: `AsyncNarrativeContext` (AsyncLocalStorage), config por variables de entorno `NARRATIVETRACE_*`, auto-flush en el apagado. |
| `@narrativetrace/core-web` | Seam de runtime de navegador para el core agnóstico de plataforma. |
| `@narrativetrace/proxy` | Usando tracing con ES Proxy (lo más común). |
| `@narrativetrace/vitest` | Auto-tracing en tests de Vitest + informe de claridad/fallos por test. |
| `@narrativetrace/diagrams` | Generando diagramas de secuencia Mermaid/PlantUML. |
| `@narrativetrace/clarity` | Analizando la calidad del naming de métodos/parámetros; gate de `clarity-results.json`. |
| `@narrativetrace/glossary` | Recolectando y renderizando un glosario de dominio (lenguaje ubicuo) a partir de las trazas; alimenta el vocabulario de proyecto de clarity y las vistas de traza traducidas. |
| `@narrativetrace/browser` | Renderizado en la consola del navegador y exportación por red. |
| `@narrativetrace/standalone` | Bundles de un solo fichero (global `<script>` clásico o módulo ES) para páginas JavaScript planas sin bundler. |
| `@narrativetrace/angular` | Integración con Angular: `provideNarrativeTrace()`, interceptor, tracing de DI. |
| `@narrativetrace/react` | Hooks/provider de React para capturar trazas de componentes + servicios. |
| `@narrativetrace/react-router` | Captura de navegación de React Router. |
| `@narrativetrace/express` | Middleware de Express: contexto por petición, extractores fail-safe, `onRequestComplete`. |
| `@narrativetrace/hono` | Middleware de Hono (edge/serverless), paridad de finalización con `finally`. |
| `@narrativetrace/nestjs` | `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })` de NestJS. |
| `@narrativetrace/observability` | Enriquecedor de scope de logs (`code.*`, `trace_id`, `service.*`, `nt.depth`) + middleware de petición. |
| `@narrativetrace/opentelemetry` | Puente OTel: `createOtelEventConsumer` en vivo + `TraceSpanExporter` por lotes. |
| `@narrativetrace/winston` | Consumidor de Winston con campos tipados + niveles configurables por evento. |
| `@narrativetrace/pino` | Consumidor de Pino con campos tipados + niveles configurables por evento. |

**Punto de partida típico:** `core-node`/`core-web` + `proxy` + `vitest`.

## Soporte de concurrencia

El trabajo en paralelo se mantiene legible. `ForkJoinGroup` propaga la identidad de traza del padre
(traceId, contexto de request/usuario) a cada tarea bifurcada y registra el tiempo por miembro;
`FireAndForgetGroup` lanza trabajo en segundo plano que aun así aparece en la traza.

```ts
import { ForkJoinGroup, FireAndForgetGroup } from '@narrativetrace/core';

// Fork/join — ejecuta comprobaciones de precio + stock en paralelo bajo un grupo compartido.
const [price, stock] = await ForkJoinGroup.all(context, [
  (ctx) => traceObject(pricingService, ctx).quote('P1'),
  (ctx) => traceObject(inventoryService, ctx).check('P1'),
]);

// Fire-and-forget — una notificación que no debe bloquear la respuesta.
const bg = FireAndForgetGroup.create(context);
bg.launch((ctx) => traceObject(notificationService, ctx).sendReceipt('C1'));
```

El renderizador Markdown muestra la estructura de concurrencia y a dónde fue el tiempo realmente:

```
- ⑂ fork [2 tasks]
  - ↦ `InventoryService.check("P1")` → `true` — 40ms
  - ↦ `PricingService.quote("P1")` → `"12.50"` — 110ms
- ⑃ join — 110ms (waited 70ms for PricingService after InventoryService)
```

El trabajo propagado mediante un snapshot de contexto, en lugar de un grupo, se une a la traza que lo
lanzó de la otra manera: se reporta desde el momento en que publica una llamada, no solo cuando su
scope se cierra, y su primer span se marca con `concurrency.kind === "async"`. Los helpers que
publican sus propios hijos se excluyen con `snapshot.activateWithoutAdoption(...)`. Consulta la
[guía de frameworks](documentation/es/guia-de-integracion-de-frameworks.md#contextsnapshot-propagación-entre-límites).

Las llamadas superpuestas sin `await` sobre un `SyncNarrativeContext` de navegador compartido no son
seguras — usa un fork/fire-and-forget explícito por tarea (consulta la
[guía de frameworks](documentation/es/guia-de-integracion-de-frameworks.md)).

## Privacidad y seguridad

Esta biblioteca se ejecuta dentro de tu proceso y escribe ficheros que tu equipo compartirá. Lo que
eso significa, en una pantalla:

| Garantía | Cómo se sostiene |
|---|---|
| **Cada integración distribuida respeta la ocultación (redaction)** | `traceObject()` es el único camino de captura sobre el que se construye cada integración (`express`, `hono`, `nestjs`, `angular`, `react`, `vitest`, …), y ninguna de ellas expone una forma de llegar a `RedactionPolicy.DISABLED`. `@notTraced`/`static notTraced` siempre ganan — incluso bajo un renderizador que una aplicación haya construido explícitamente con la ocultación desactivada. |
| **La ocultación sobrevive al anidamiento y a las plantillas** | Un miembro censurado permanece censurado dentro de un array, `Set`, `Map`, objeto plano, varios apilados, o un ciclo autorreferencial; una plantilla de narración `{param.property}` que nombra un miembro censurado resuelve a `[REDACTED]`, nunca al valor. |
| **Los fallos de tracing no pueden fallar tu aplicación** | La captura es best-effort por construcción — un `toString()` personalizado que lanza, un getter que lanza nombrado en una plantilla, o un buffer lleno degradan a una llamada sin trazar, nunca bloquean ni fallan el método de negocio. |
| **El uso de recursos está acotado** | El camino de análisis con buffer es un anillo de tamaño fijo (8192 eventos por defecto en tests, 65536 en un proceso de larga duración) que descarta en lugar de bloquear — y lo dice: una captura que perdió eventos imprime el conteo y qué elevar en su propio pie de página. |

Dos límites honestos. Primero, la única forma de que los valores escapen a la ocultación es código de
aplicación que llama directamente al renderizador de bajo nivel con `RedactionPolicy.DISABLED` — un
acto deliberado y revisable en tu propio código fuente, e incluso entonces las anotaciones
`@notTraced`/`static notTraced` siguen censurando. Segundo, la captura invoca un pequeño conjunto fijo
de tu código mientras renderiza — un `toString()` personalizado, un método `@narrativeSummary`, y
rutas de propiedades nombradas en plantillas `@narrated`/`@onError` — así que mantenlas puras, como
harías para un depurador. Tampoco hay un camino de cero código, "envuelve una app que no escribiste",
y esta implementación no ha distribuido un artefacto estructural sin valores (algunas otras
implementaciones de NarrativeTrace sí lo hacen) — consulta las dos páginas de abajo para las versiones precisas, fila por
fila, de ambos.

→ [Privacidad y ocultación](documentation/es/privacidad-y-ocultacion.md) para el contrato fila por
fila verificado contra el código, y [Qué commitear](documentation/es/que-commitear.md) para saber qué
ficheros generados mantener fuera del control de versiones. Cuando otra biblioteca también envuelve
los mismos métodos (un contenedor de DI, otro `Proxy`, una biblioteca de contratos), NarrativeTrace
narra únicamente los cruces de frontera de negocio, y qué wrapper queda "más externo" nunca cambia el
resultado o la excepción que llega a la narrativa — consulta las preguntas frecuentes de más abajo
para el contrato de coexistencia completo.

## Rendimiento

El tracing hace trabajo y el trabajo cuesta algo — no vamos a afirmar "overhead cero". El proxy
intercepta llamadas vía `Proxy` de ES, captura parámetros, renderiza valores a strings y construye el
árbol de traza. Cuando el tracing está desactivado, el envoltorio es trabajo cero por construcción:
envolver `NOOP_CONTEXT` devuelve el **objeto original mismo** (sin proxy, sin coste alguno por
llamada), y un contexto vivo en `level: 'off'` conserva el proxy (el nivel puede cambiar en tiempo
de ejecución) pero una llamada no hace ningún trabajo de captura — una búsqueda en la caché de
envoltorios y una comprobación de `isActive`, sin asignaciones, sin renderizado.

Medido (2026-09-07, Node 22, el contenedor de desarrollo Linux de este repositorio,
`proxy.bench.ts` de `packages/benchmarks`): un método trivial de dos argumentos corrió a ~9,8M
ops/s en crudo; la misma llamada a través de un envoltorio en `level: 'off'` corrió a ~4,3M ops/s
— del orden de 0,1 µs añadidos por llamada; el envoltorio con `NOOP_CONTEXT` fue indistinguible
del objeto crudo, porque *es* el objeto crudo. Con el tracing totalmente activo (`detail`:
renderizado de parámetros + valores de retorno), la misma llamada trivial corrió a ~105K ops/s
(~10 µs por llamada) — el coste de renderizar de verdad la historia.

El directorio `packages/benchmarks/` contiene benchmarks de Vitest para entrada/salida de contexto,
overhead del proxy, renderizado de valores y renderizado Markdown/JSON a distintos tamaños de árbol,
con baselines guardadas en `reports/benchmarks/` para que una regresión se mantenga visible entre
commits. Ejecuta `pnpm run bench` (o `pnpm run bench:save` para comparar contra la baseline guardada)
para reproducir los números de arriba en tu hardware — reportamos esto como mediciones que deberías
reproducir, no como cifras de titular, porque la carga del contenedor y la máquina las mueve de
ejecución en ejecución.

Para bucles extremadamente calientes, usa `level: 'off'` o acota el scope trazado al límite que
importa.

## Qué es gratis y qué es Pro

**Gratis** es todo lo que hay en este repositorio — disponible en código fuente bajo BSL 1.1, gratis
en producción, convirtiéndose en Apache 2.0 cuatro años después de cada release: todo el runtime,
trazas por test en cada formato (Markdown, JSON, JSON canónico, Mermaid, PlantUML), la puntuación de
claridad y el glosario de dominio, y cada integración de las tablas de arriba.

**Pro** es inteligencia *a través de* ejecuciones: agregación de streams de eventos
(`@narrativetrace/pro-aggregate`, hotspots, rutas/tasas de error, frecuencias de método/error) y un
servidor MCP que conecta Claude Code / Cursor directamente con tus trazas están en desarrollo;
resúmenes de flujo, diffs de migración, diagramas de grafo de dependencias, y un conjunto de auditoría y
cumplimiento están planeados. No todo esto está distribuido hoy — la
[Guía de Funcionalidades](documentation/es/guia-de-funcionalidades.md) es la tabla de estado
autorizada: etiqueta cada funcionalidad como Free, Pro, En desarrollo o Planeado, y cita el código
detrás de cada fila ya distribuida.

## Documentación

Empieza aquí:

- [Primeros 10 minutos](documentation/es/primeros-10-minutos.md) — un servicio diminuto, un test de Vitest, siete pasos hasta una traza real, con salida real
- [Guía de instalación](documentation/es/guia-de-instalacion.md) — dependencias, cada camino de integración, configuración de la salida de trazas
- [Eligiendo una integración](documentation/es/eligiendo-una-integracion.md) — qué paquete necesitas, como diagrama de decisión
- [Guía de configuración](documentation/es/guia-de-configuracion.md) — niveles de tracing, config de Vitest, opciones de renderizado
- [Guía de decoradores](documentation/es/guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`

Yendo más a fondo:

- [Privacidad y ocultación](documentation/es/privacidad-y-ocultacion.md) — el contrato de ocultación fila por fila, verificado contra el código
- [Qué commitear](documentation/es/que-commitear.md) — qué ficheros generados son salida de ejecución y cuáles (si acaso) son baselines revisadas
- [Solución de problemas](documentation/es/solucion-de-problemas.md) — síntoma → causa → solución para los modos de fallo que la gente realmente encuentra
- [Guía de claridad](documentation/es/guia-de-claridad.md) — modelo de puntuación, componentes de NLP, scanner estático
- [Guía de integración de frameworks](documentation/es/guia-de-integracion-de-frameworks.md) — Express, Hono, navegador, AsyncLocalStorage
- [Guía de ejemplos](documentation/es/guia-de-ejemplos.md) — el lanzador `pnpm demo` y los ejemplos ejecutables: ecommerce, clarity, Minecraft, JavaScript plano, Express, Hono, distribuido (Docker + Jaeger), navegador
- [Guía de funcionalidades](documentation/es/guia-de-funcionalidades.md) — catálogo canónico de lo que distribuye esta implementación, con tier y estado

## Compilar desde el código fuente

```bash
pnpm install                                      # instalar dependencias
pnpm run check                                    # lint + métricas + cobertura + mutation testing
pnpm run build                                    # compilar todos los paquetes
pnpm run test                                     # ejecutar todos los tests
```

## Preguntas frecuentes

### ¿Cómo funciona la serialización de valores?

NarrativeTrace usa **serialización eager** — los valores de parámetros y de retorno se renderizan a strings en el momento de la captura, antes de guardarse en la traza. Es una decisión de diseño deliberada:

- **Corrección:** los objetos se capturan tal como estaban en el momento de la llamada. Si un objeto mutable se modifica después de que la llamada trazada retorne, la traza sigue mostrando el valor original.
- **Sin retención de objetos:** la traza solo guarda strings, no referencias a tus objetos de dominio. Nada impide que tus objetos sean recolectados por el garbage collector.
- **Renderizado seguro:** el `renderValue()` integrado maneja: null, undefined, strings, números, booleanos, arrays, objetos planos, BigInt, symbols, funciones y referencias circulares. Los valores grandes se truncan (`maxStringLength`, `maxArrayItems`, `maxObjectKeys`).

### ¿Puede el tracing disparar efectos secundarios en mi código?

Solo en un conjunto pequeño y documentado de lugares. La introspección enumera las propiedades propias enumerables (`Object.keys`) — un getter de clase vive en el prototipo y nunca se ejecuta. Los miembros que NarrativeTrace *sí* invoca son: un `toString()` personalizado, un método `@narrativeSummary`, y rutas de propiedades nombradas en plantillas `@narrated`/`@onError`. Mantenlas puras, como harías para un depurador o serializador — o incluye el campo en `static notTraced`, en cuyo caso su valor nunca se lee en absoluto. Cada invocación está acotada y aislada de excepciones (un getter que lanza nunca puede fallar tu llamada de negocio), los thenables nunca se esperan (`await`), y con el tracing desactivado no ocurre ningún renderizado en absoluto. Consulta el contrato de pureza en la [guía de decoradores](documentation/es/guia-de-decoradores.md).

### ¿Traza métodos privados?

No — el Proxy de ES traza los métodos públicos del objeto. Pero los métodos privados son visibles a través de las llamadas de servicio que hacen:

```ts
private fulfillOrder(order: Order) {
  if (order.isDigital) {
    this.deliveryService.sendDownloadLink(order.customerId, order.productId);
  } else {
    this.warehouseService.shipPhysical(order.customerId, order.shippingAddress);
  }
  this.notificationService.confirmOrder(order.customerId, order.orderId);
}
```

La traza muestra qué rama se ejecutó:

```
OrderService.placeOrder(customerId: "C1", productId: "SKU-EBOOK")
  DeliveryService.sendDownloadLink(customerId: "C1", productId: "SKU-EBOOK") -> "https://..."
  NotificationService.confirmOrder(customerId: "C1", orderId: "ORD-001") -> true
```

No hace falta trazar el `if` — la presencia de `sendDownloadLink` y la ausencia de `shipPhysical` cuentan la historia. Los campos `#private` de ES no pueden ser interceptados por Proxy (limitación del lenguaje JavaScript), pero el beneficio arquitectónico es el mismo.

### ¿Por qué las auto-llamadas no se anidan?

Los métodos trazados se ejecutan con `this` vinculado al objeto original, no al proxy (`Reflect.apply(fn, target, args)` dentro del envoltorio del método). Un método que llama a un hermano del mismo objeto (`this.validate(order)`) invoca por tanto el método original — la llamada se ejecuta correctamente, pero no se captura, así que las auto-llamadas nunca aparecen como spans anidados. Es un intercambio de diseño deliberado, no una carencia: vincular el objeto original hace al proxy inmune a las trampas clásicas de Proxy — los campos `#private` (que lanzan a través de un receptor proxy), los built-ins con slots internos (`Map`, `Date`) y los campos de función flecha.

El anidamiento viene de envolver a los colaboradores, y esa es la única regla estructural: **descompón en servicios colaboradores y envuelve cada uno donde se construye.** Una raíz de composición que envuelve `OrderService`, `InventoryService` y `PaymentService` una vez cada uno obtiene la narrativa anidada completa — que además es la forma de código que mejor se lee, con o sin trazas.

### ¿Cómo interactúa NarrativeTrace con otras bibliotecas que envuelven métodos (AOP, proxies, bibliotecas de contratos)?

NarrativeTrace narra cruces de frontera de negocio, no maquinaria. Sus propios mecanismos de
adjunción son opt-in y deliberadamente estrechos: `traceObject()` envuelve un objeto a la vez en un
`Proxy` de ES que implementa únicamente la trampa `get`, así que cualquier otra operación —
enumeración de propiedades, `instanceof`, acceso al prototipo — pasa sin tocar hacia lo que sea que
esté envolviendo el mismo objeto. Una lista de exclusión integrada evita que los hooks de
coerción/inspección (`toString`, `valueOf`, `Symbol.toPrimitive`) se narren como llamadas de negocio,
y esta exclusión está pensada para crecer a medida que se encuentran huecos, nunca para reducirse.

Cuando otra biblioteca también envuelve los mismos métodos — una biblioteca de contratos, un proxy
AOP, un interceptor de contenedor DI — cuál termine quedando "más externo" solo cambia el anidamiento
cosmético de los frames de traza, nunca qué hechos llegan a la narrativa ni cuál termina siendo el
resultado de negocio: una excepción lanzada o un valor retornado siempre atraviesan todas las capas
sin modificarse. La captura de violaciones está diseñada para ser independiente del orden en
principio — un hecho debería entrar en la narrativa como un evento emitido desde su propia fuente, no
inferido observando cómo se propaga a través de un wrapper — aunque NarrativeTrace todavía no expone
una API pública para que una biblioteca de terceros alimente un hecho así en una traza en curso; eso
se rastrea como trabajo futuro, no como algo prometido hoy.

Las palancas disponibles ahora mismo para mantener los métodos sintéticos o generados de un tercero
fuera de tus trazas son `@notTraced`/`static notTraced` en las clases que controlas, y simplemente no
llamar a `traceObject()` sobre una superficie que no quieres narrada — todavía no hay una lista de
exclusión por defecto a nivel de repositorio para excluir las clases generadas de otra biblioteca por
patrón de nombre.

## Licencia

La API y el formato de salida de NarrativeTrace son estándares abiertos (Apache 2.0). Su runtime es
gratuito y de código fuente disponible (BSL 1.1, convirtiéndose en Apache 2.0 cuatro años después de
cada release). Pro es comercial.

Lo que eso significa para los paquetes de este repositorio:

| Parte | Licencia |
|---|---|
| El runtime — cada paquete `@narrativetrace/*` distribuido desde este repositorio | [BSL 1.1](LICENSE) (SPDX `BUSL-1.1`), convirtiéndose en Apache 2.0 cuatro años después de cada release |
| La API de anotaciones/decoradores, la especificación del formato de salida y la rúbrica de claridad | [Apache 2.0](LICENSE-APACHE) (la separación en paquete propio está pendiente — ver más abajo) |
| La prosa de la documentación | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

El Additional Use Grant permite el uso en producción para cualquier propósito, incluso en productos y
servicios que ofrezcas a tus propios clientes; la única exclusión es ofrecer NarrativeTrace en sí
mismo —o un producto o servicio cuyo valor derive sustancialmente de él— a terceros como un producto
o servicio de logging, tracing o narrativa de código. Consulta [LICENSE](LICENSE) para los términos
exactos, o contacta <hello@narrativetrace.ai> sobre otros acuerdos.

<!-- legal:trademark:begin -->
NarrativeTrace es una marca de Empower Agile. La licencia no otorga ningún derecho de marca.
<!-- legal:trademark:end -->

### La licencia, en palabras sencillas

Todo lo que hay en este repositorio se publica bajo Business Source License 1.1 hoy — las partes
con licencia Apache (la API de anotaciones/decoradores, la especificación del formato de salida, la
rúbrica de claridad) todavía no se han separado en un paquete propio.

<!-- legal:plain-words:begin -->
**Gratis para ejecutar.** El runtime es de código disponible bajo la Business
Source License 1.1: puedes leerlo, auditarlo, modificarlo y usarlo en producción
sin coste — incluso dentro de los productos y servicios que vendes a tus propios
clientes.

**Una sola exclusión.** No puedes ofrecer NarrativeTrace en sí —o un producto o
servicio cuyo valor derive sustancialmente de él— a terceros como producto o
servicio de logging, tracing o narrativa de código.

**Se abre en una fecha.** Cada versión se convierte a Apache 2.0 cuatro años
después de publicarse; la fecha exacta se imprime en el LICENSE de esa versión.

*Este resumen es una cortesía, no una licencia. El archivo LICENSE es el único
texto vinculante; donde ambos difieran, prevalece el LICENSE.*
<!-- legal:plain-words:end -->
