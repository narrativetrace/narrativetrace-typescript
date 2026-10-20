<!-- source: documentation/recipes/send-traces-to-the-observability-stack-you-already-run.md blob 81e8e4768488 | translated: 2026-10-18 | reviewed: - -->
# Envía las trazas al stack de observabilidad que ya tienes

[English](../../recipes/send-traces-to-the-observability-stack-you-already-run.md) | **Español** | [Português](../../pt-BR/receitas/envie-os-traces-para-o-stack-de-observabilidade-que-voce-ja-tem.md) | [简体中文](../../zh-CN/实用方案/把追踪发到你已有的可观测性栈.md)

## El problema

> Ya tenemos trazado y dashboards. No voy a adoptar un segundo sitio donde
> mirar — ¿puede esto ir al stack que ya ejecutamos?

Sí: una ejecución, dos consumidores. Las líneas de narrativa siguen yendo a tu
logger, y los mismos eventos se convierten en spans de OpenTelemetry al salir.
A continuación hay un checkout con ambas salidas lado a lado.

## Configuración mínima

`@narrativetrace/opentelemetry` más la API de OTel, que el paquete deja de tu
lado (una dependencia peer, para que prevalezca la versión de tu SDK):

```bash
npm add @narrativetrace/opentelemetry @opentelemetry/api
```

Hay dos formas de entrar, y la diferencia es *cuándo* existe un span:

| Modo | Exportación | Úsalo cuando |
|---|---|---|
| En vivo, mientras se ejecutan los métodos | `createOtelEventConsumer({ tracer })` | Quieres spans en tu collector incluso si el proceso muere a mitad de una petición — esta página |
| Por lotes, a posteriori | `new TraceSpanExporter(tracer).export(context.captureTrace().roots)` | Ya tienes un árbol de traza terminado y quieres exportar sus spans de una sola pasada |

Ambos toman un `Tracer` — en un despliegue, el del SDK que ya ejecutas,
`trace.getTracer("orders")`. El consumidor en vivo se compone en el pipeline en
código; nada lo descubre. El escenario de abajo entrega un tracer de un
proveedor en memoria que nunca se registra globalmente, que es también la imagen
más clara de lo que hace la conexión: un proveedor global se filtraría de una
prueba a la siguiente, y un exportador en memoria no tiene ningún global al que
filtrarse
([Guía de integración de frameworks § OpenTelemetry](../guia-de-integracion-de-frameworks.md#8-opentelemetry)).

## El escenario

El pipeline es la única idea nueva: el consumidor de narración que ya tienes,
con el consumidor de OTel a su lado en el mismo camino en vivo. El checkout en
sí se envuelve exactamente como en todas las demás páginas:

```ts
// support/observed-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EventConsumer,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Tracer } from "@opentelemetry/api";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/** One consumer that hands every event to each of `consumers`, in order. */
function allOf(...consumers: EventConsumer[]): EventConsumer {
  return (event) => {
    for (const consume of consumers) consume(event);
  };
}

/**
 * A context whose events go to two places at once: the project's own pino logger, and the project's
 * own OpenTelemetry tracer as spans.
 *
 * INTENT: the pipeline is the only new idea. The narration consumer you already have and the OTel
 * consumer sit side by side on the live path; the buffered path beside them is untouched, so
 * `captureTrace()` still works. Nothing is taken away from the logger to feed the exporter.
 *
 * @llmNote The OTel consumer is composed into the pipeline explicitly, with the tracer handed in,
 * rather than found through a global SDK: an in-memory exporter cannot be discovered, and a global
 * provider leaks from one test into the next.
 */
export function contextLoggingAndExporting(
  logFile: string,
  tracer: Tracer,
  level: TracingLevel = "detail",
): SyncNarrativeContext {
  const narration = createPinoEventConsumer(loggerWritingTo(logFile));
  const spans = createOtelEventConsumer({ tracer });
  const pipeline = new DualPathPipeline(allOf(narration, spans), new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(level),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT)?.traceId,
  );
}
```

La ejecución construye el proveedor en memoria, ejecuta el checkout y escribe
los spans exportados ordenados, para que el volcado de una ejecución sea igual
al de la siguiente:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TracingLevel } from "@narrativetrace/core-node";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextLoggingAndExporting } from "../support/observed-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/send-traces-to-the-observability-stack-you-already-run.md: ONE run of
 * the checkout writes the log lines it always wrote AND an OpenTelemetry span per traced call, with
 * the parentage and the attributes the page shows — and without the redacted values (release rule
 * 8, docs as tests).
 *
 * @llmNote The exported spans are written out by `dumpOf`, naming and sorting everything it prints,
 * so one run's dump is byte-identical to the next — a raw span dump carries timestamps and OTel's
 * own generated ids and could never be embedded. The provider is built here and never registered
 * globally: a global provider would leak from this test into the next.
 */
const SLUG = "send-traces-to-the-observability-stack-you-already-run";
const CARD_NUMBER = "4242424242424242";

let spans: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  useStableSpanIds();
  spans = new InMemorySpanExporter();
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
});

afterEach(async () => {
  await provider.shutdown();
});

describe("send traces to the observability stack you already run", () => {
  it("one run narrates and exports", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "checkout.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);

    expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
    assertOneSpanPerTracedCall();
    assertNoRedactedValueWasExported();
    mkdirSync(recipeOutput(SLUG), { recursive: true });
    writeFileSync(join(recipeOutput(SLUG), "exported-spans.txt"), dumpOf(spans.getFinishedSpans()));
  });

  it("a run that throws exports the failed span with its error status", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "declined.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, "4000000000000002")).toThrow();

    const failed = spans.getFinishedSpans().find((span) => span.name === "PaymentService.charge");
    expect(failed?.status.code).toBe(2);
    expect(failed?.events.map((event) => event.name)).toContain("exception");
  });
});

describe("send traces to the observability stack you already run, at other levels", () => {
  function runAt(level: TracingLevel): void {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, `${level}.log`),
      provider.getTracer("narrativetrace"),
      level,
    );
    tracedCheckout(context).checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);
  }

  it("summary exports the same spans without the parameter attributes", () => {
    runAt("summary");

    const exported = spans.getFinishedSpans();
    expect(exported).toHaveLength(4);
    const keys = exported.flatMap((span) => Object.keys(span.attributes));
    expect(keys.filter((key) => key.startsWith("narrative.param."))).toEqual([]);
  });

  it("off creates no event and therefore no span", () => {
    runAt("off");

    expect(spans.getFinishedSpans()).toEqual([]);
  });
});

/** Four traced calls, four spans, ended innermost first — and the tree is reconstructed. */
function assertOneSpanPerTracedCall(): void {
  const exported = spans.getFinishedSpans();
  expect(exported.map((span) => span.name)).toEqual([
    "InventoryService.reserve",
    "PaymentService.charge",
    "OrderRepository.save",
    "OrderService.placeOrder",
  ]);
  const root = named(exported, "OrderService.placeOrder");
  expect(parentNameOf(exported, named(exported, "PaymentService.charge"))).toBe(root.name);
  expect(parentNameOf(exported, root)).toBeUndefined();
  expect(new Set(exported.map((span) => span.spanContext().traceId)).size).toBe(1);
  expect(root.spanContext().traceId).not.toBe(root.attributes["nt.trace_id"]);
}

/** What the deny-list caught never reaches the exporter either — there is no attribute for it. */
function assertNoRedactedValueWasExported(): void {
  const attributes = spans.getFinishedSpans().flatMap((span) => Object.entries(span.attributes));
  const keys = attributes.map(([key]) => key);
  expect(keys).not.toContain("narrative.param.cardNumber");
  expect(keys).not.toContain("narrative.param.card");
  expect(attributes.map(([, value]) => String(value)).join("\n")).not.toContain(CARD_NUMBER);
}

function named(exported: readonly ReadableSpan[], name: string): ReadableSpan {
  const found = exported.find((span) => span.name === name);
  if (found === undefined) throw new Error(`no span named ${name}`);
  return found;
}

function parentNameOf(exported: readonly ReadableSpan[], span: ReadableSpan): string | undefined {
  return exported.find((other) => other.spanContext().spanId === span.parentSpanId)?.name;
}

/** The dump the page embeds: span name, parent, and every attribute, sorted by key. */
function dumpOf(exported: readonly ReadableSpan[]): string {
  return exported
    .map((span) => {
      const attributes = Object.entries(span.attributes)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `    ${key}: ${value}`);
      const parent = parentNameOf(exported, span) ?? "(none — this is the root)";
      return [`span: ${span.name}`, `  parent: ${parent}`, ...attributes].join("\n");
    })
    .join("\n")
    .concat("\n");
}
```

## La salida real

**Las líneas de log**, sin cambios por nada de esto — la misma narración que
produce [Añade registro a este servicio](anade-registro-a-este-servicio.md):

```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```

**Los spans que salieron de la misma ejecución**, tal como los recibió el
exportador en memoria — nombre, padre y cada atributo, ordenados:

```text
span: InventoryService.reserve
  parent: OrderService.placeOrder
    code.function: reserve
    code.namespace: InventoryService
    narrative.param.quantity: 2
    narrative.param.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: PaymentService.charge
  parent: OrderService.placeOrder
    code.function: charge
    code.namespace: PaymentService
    narrative.outcome: "PAY-C-1234-7998"
    narrative.param.amountCents: 7998
    narrative.param.customerId: C-1234
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: OrderRepository.save
  parent: OrderService.placeOrder
    code.function: save
    code.namespace: OrderRepository
    narrative.param.order.amountCents: 7998
    narrative.param.order.customerId: C-1234
    narrative.param.order.orderId: ORD-C-1234-SKU-KB-2
    narrative.param.order.quantity: 2
    narrative.param.order.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: OrderService.placeOrder
  parent: (none — this is the root)
    code.function: placeOrder
    code.namespace: OrderService
    narrative.outcome: "ORD-C-1234-SKU-KB-2"
    narrative.param.customerId: C-1234
    narrative.param.quantity: 2
    narrative.param.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
```

## Cómo leerlo

- **Cuatro llamadas trazadas, cuatro spans, un árbol.** Los spans llegan en el
  orden en que *terminaron* — el más interno primero, la raíz la última, que es
  como cualquier pipeline de OTel ve un árbol terminado. La filiación no se
  infiere de ese orden: el consumidor lee el id de span padre explícito de cada
  evento, por eso `InventoryService.reserve`, `PaymentService.charge` y
  `OrderRepository.save` nombran todos a `OrderService.placeOrder` como su padre
  aunque terminaron antes que él.
- **Qué lleva cada span.** `code.namespace` y `code.function` son la llamada;
  `narrative.param.<name>` es un atributo por parámetro, tipado
  (`narrative.param.quantity: 2` es un número, no la cadena `"2"`);
  `narrative.outcome` es el valor devuelto, y está ausente en las dos llamadas
  `void` porque no había nada que devolver. `nt.trace_id` y `nt.traceName` son
  la identidad propia de NarrativeTrace para la traza, llevada como atributos
  para que un span en tu backend pueda emparejarse con la línea de log que
  describe la misma llamada — [Sigue una petición entre
  servicios](sigue-una-peticion-entre-servicios.md) es el mismo id haciendo el
  mismo trabajo a través de la frontera de un proceso. `nt.entryType`,
  `nt.schemaVersion`, `nt.storyId` y `nt.chapterId` marcan el esquema que siguen
  estos atributos y la historia a la que pertenece el span.
- **Un parámetro estructurado llega aplanado.** `OrderRepository.save(order)`
  es un parámetro, y se exportó como `narrative.param.order.orderId`,
  `narrative.param.order.customerId`, `narrative.param.order.sku`,
  `narrative.param.order.quantity`, `narrative.param.order.amountCents` — campo
  por campo, porque así se renderizó el valor: leyendo su estado.
- **La ocultación también alcanza este camino.** No hay ningún atributo
  `narrative.param.cardNumber` ni `narrative.param.card` en ningún span de
  arriba — no un atributo con `[REDACTED]`, ningún atributo en absoluto. Un
  valor denegado se descarta en la captura, antes de que exista el evento, así
  que ningún consumidor de ninguno de los dos caminos puede recibirlo; el
  escenario lo comprueba igual que el árbol de spans
  ([Mantén los secretos fuera de los logs](manten-los-secretos-fuera-de-los-logs.md)).
- **Qué ajuste llevó un evento a qué consumidor.** Tres decisiones, en este
  orden:
  1. El nivel de trazado decide si se crea un evento. En `summary` estos mismos
     cuatro spans se exportan *sin* los atributos `narrative.param.*`, porque a
     ese nivel no se renderizan los valores de los parámetros; en `off` no hay
     evento y, por tanto, no hay span — las otras dos pruebas del escenario
     comprueban ambos casos
     ([Traza en producción sin el coste](traza-en-produccion-sin-el-coste.md)).
  2. La forma del pipeline decide quién ve el evento. Aquí un consumidor en
     vivo — narración, luego exportación — se ejecuta en línea, y el búfer a su
     lado conserva la retención, que es lo que leen `captureTrace()` y los
     ficheros de traza. No se le quitó nada al logger para alimentar al
     exportador.
  3. El nivel de tu logger decide lo que se *imprime*. Subir el nivel de pino
     por encima de `trace` vacía el bloque de log de arriba y no cambia nada
     de los spans.
- **Una llamada que lanza una excepción exporta el span fallido.** La segunda
  prueba del escenario rechaza la tarjeta: `PaymentService.charge` termina con
  un estado de error y un evento `exception`, que es en lo que se basa una vista
  de errores en tu backend.
- **Por qué esto no es un segundo sitio donde mirar.** Los spans son tuyos, en
  tu collector, bajo tu nombre de servicio, junto a los spans que tu framework
  ya emite. Lo que NarrativeTrace añade es un span por *llamada a método
  trazado* con los parámetros y el resultado en él — un nivel por debajo del
  span HTTP que ya tienes.

## Lo que no se captura

- **Lo que tu stack haga con los spans es cosa de tu stack.** El muestreo, la
  retención, la indexación y si un atributo es buscable son decisiones del
  collector y del backend. Esta página muestra lo que sale del proceso; no se
  afirma nada sobre la interfaz de ningún proveedor.
- **Los ids no se comparten.** OpenTelemetry genera sus propios ids de traza y
  de span para los spans que crea aquí (el escenario comprueba que los cuatro
  comparten un id de traza de OTel, y que no es el de NarrativeTrace), y la
  identidad de NarrativeTrace viaja como los atributos `nt.trace_id` /
  `nt.traceName`. La posición de un span en la cascada de tu backend es de
  OTel; emparejarlo con una línea de log es trabajo del atributo.
- **Un span que nunca termina se acota, no se repara.** El consumidor en vivo
  crea un span mientras un método se ejecuta, así que un proceso terminado a
  mitad de una llamada deja uno abierto; el consumidor acota cuántos retiene y
  durante cuánto tiempo (`maxActiveSpans`, `spanTtlMs`). El exportador por
  lotes solo ve árboles terminados.
- **El coste es un consumidor en el camino de la llamada del llamante.** Un
  consumidor compuesto en el camino en vivo se ejecuta en línea, así que la
  creación de spans está en el camino de la llamada trazada. Ese es el
  intercambio por la durabilidad, y el pipeline lo aísla: un consumidor que
  lanza una excepción nunca rompe la llamada de negocio.
- **Solo se exporta lo que se traza.** No existe ningún span para una llamada
  que ninguna integración interceptó — el camino de exportación hereda
  exactamente la frontera del camino de captura.

**La skill para esto:** `narrativetrace-doctor` — una comprobación de conexión
por integración de framework, e informa de si algún destino recibe realmente lo
que se traza.
