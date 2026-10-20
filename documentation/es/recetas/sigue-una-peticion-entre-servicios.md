<!-- source: documentation/recipes/follow-one-request-across-services.md blob 6ef2b77d5d7c | translated: 2026-10-18 | reviewed: - -->
# Sigue una petición entre servicios (trazado distribuido)

[English](../../recipes/follow-one-request-across-services.md) | **Español** | [Português](../../pt-BR/receitas/acompanhe-uma-requisicao-entre-servicos.md) | [简体中文](../../zh-CN/实用方案/跨服务追踪一次请求.md)

## El problema

> El checkout llama al servicio de pagos por HTTP. Cuando un pedido sale mal,
> quiero ver una sola petición a través de ambos — no dos logs que tengo que
> alinear a mano.

Dos servicios, dos ficheros de log, dos conjuntos de ids. Lo que los convierte
en una sola historia es un único valor que viaja con la petición: la cabecera
W3C [`traceparent`](https://www.w3.org/TR/trace-context/#traceparent-header).
El llamante envía la traza en la que está y el span desde el que llama; el
llamado adopta esa traza en lugar de iniciar una propia. A continuación hay una
ejecución de exactamente eso, con las líneas de ambos servicios en un solo
fichero.

## Configuración mínima

Además de la [instalación](../guia-de-instalacion.md), el llamante no necesita
nada nuevo: `tracedFetch(context)` y `traceparentHeaders(context)` están en
`@narrativetrace/core-node`, que ya tiene. El llamado necesita la mitad de
entrada — y qué código es depende de cómo esté construido:

| El llamado es | La mitad de entrada es |
|---|---|
| Una aplicación Express | El middleware `narrativeTrace()` de `@narrativetrace/express`, que adopta la cabecera por ti |
| Una aplicación Hono | El middleware `narrativeTrace()` de `@narrativetrace/hono`, del mismo modo |
| Cualquier otra cosa — un servidor `node:http` simple, un framework de handlers | Tres líneas en lo primero que se ejecute por petición: leer `traceparent`, `parseTraceparent(header)`, atender dentro de `context.run(fn, thatTraceparent)` |

El servicio de pagos de esta página es la tercera fila: el proyecto de checkout
funciona sin framework, así que el handler lee la cabecera él mismo. Es también
el ejemplo honesto de lo que hace el middleware, porque son las mismas tres
líneas ([Guía de integración de frameworks](../guia-de-integracion-de-frameworks.md)).

Las líneas de log salen del puente de pino, como en
[Añade registro a este servicio](anade-registro-a-este-servicio.md). Ambos
servicios escriben a un solo fichero a través de él, cada uno con un contexto
propio que nombra su servicio, porque el id de traza es lo que se sigue:

```ts
// support/service-log.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/**
 * Whose lines these are (absent: no `service.name`, for a project with one service), and whether
 * this service starts the file (the default) or joins one already started.
 */
export interface ServiceLogOptions {
  readonly serviceName?: string;
  readonly fresh?: boolean;
}

function loggerAppendingTo(logFile: string, fresh: boolean): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  if (fresh) rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * The context of one service among several: its events reach `logFile` through the project's own
 * pino logger and carry `service.name`. Two services pointed at one file write one interleaved
 * log, and the trace id on a line says which request it belongs to.
 *
 * @llmNote The context is asynchronous (`AsyncNarrativeContext`) because the services here answer
 * over HTTP: `run()` gives each request a scope of its own and `tracedFetch` reads the span that is
 * open in it.
 */
export function serviceContextLoggingTo(
  logFile: string,
  options: ServiceLogOptions = {},
): AsyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerAppendingTo(logFile, options.fresh ?? true));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  const identity =
    options.serviceName === undefined ? undefined : { serviceName: options.serviceName };
  return new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline, identity);
}
```

## El escenario

**El lado del llamante: una cabecera.** El colaborador de pagos del checkout
es ahora un cliente HTTP. `tracedFetch(context)` es el `fetch` global que lee
el span abierto en el momento de la llamada y fija una cabecera — todo lo demás
es una petición corriente:

```ts
// src/http-payment-service.ts
import { type AsyncNarrativeContext, tracedFetch } from "@narrativetrace/core-node";
import { PaymentDeclinedError } from "./payments.js";

/** Charges a card through a payment service that is a different process; the answer is a promise. */
export interface RemotePaymentService {
  charge(customerId: string, amountCents: number, card: string): Promise<string>;
}

const DECLINED_STATUS = 402;

/**
 * The checkout's payment collaborator when the payment service is another process.
 *
 * INTENT: the outbound half of cross-service correlation, in the shape any HTTP client copies:
 * `tracedFetch(context)` is global `fetch` that stamps the W3C `traceparent` of the span open at
 * call time. The callee then continues this trace instead of starting its own.
 *
 * @llmNote The request body is a comma-separated line rather than JSON on purpose: this class exists
 * to show the header, and a parser would be the only thing a reader had to skip. `tracedFetch` is
 * the first thing `charge` calls, before any `await`: the header names the span that is open while
 * the call is made, and that is `charge`'s own only until the method first yields.
 *
 * @edgeCase With no span open there is nothing to name, and `tracedFetch` sends no header at all —
 * the honest outcome, since a header without a real parent id would point the callee at a span that
 * never existed.
 */
export class HttpPaymentService implements RemotePaymentService {
  private readonly send: typeof globalThis.fetch;

  constructor(
    context: AsyncNarrativeContext,
    private readonly endpoint: string,
  ) {
    this.send = tracedFetch(context);
  }

  async charge(customerId: string, amountCents: number, card: string): Promise<string> {
    const response = await this.send(this.endpoint, {
      method: "POST",
      body: `${customerId},${amountCents},${card}`,
    });
    const body = await response.text();
    if (response.status === DECLINED_STATUS) {
      throw new PaymentDeclinedError(body);
    }
    return body;
  }
}
```

El checkout que lo rodea es el que usan todas las páginas, con `await` donde
está la llamada de pago (`src/remote-order-service.ts`): reservar, cobrar,
guardar y liberar si se rechaza.

**El lado del llamado: su propio contexto.** El servicio de pagos es un segundo
servicio, lo que significa un segundo contexto de narrativa — creado con su
propio nombre de servicio, para que un solo fichero de log pueda distinguir a
los dos (`support/payment-service-process.ts`):

```ts
    this.context = serviceContextLoggingTo(logFile, {
      serviceName: "payment-service",
      fresh: false,
    });
    this.payments = traceObject(
      new CardPaymentService(),
      this.context,
      { charge: ["customerId", "amountCents", "card"] },
      { className: "PaymentService" },
    );
```

**El lado del llamado: leer, ejecutar, capturar, reiniciar.** Esta es toda la
mitad de entrada, en el mismo fichero — y la misma secuencia que realizan los
middleware de Express y Hono para una aplicación construida sobre ellos:

```ts
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const traceparent = req.headers.traceparent as string | undefined;
    const body = await readBody(req);
    await this.context.run(async () => {
      try {
        const [customerId, amountCents, card] = body.split(",") as [string, string, string];
        respond(res, OK, this.payments.charge(customerId, Number(amountCents), card));
      } catch (error) {
        if (!(error instanceof PaymentDeclinedError)) throw error;
        respond(res, PAYMENT_REQUIRED, error.message);
      } finally {
        this.served = { traceparent, trace: this.context.captureTrace() };
        this.context.reset();
      }
    }, parseTraceparent(traceparent));
  }
```

**La ejecución.** El checkout, envuelto como siempre, con el cliente HTTP donde
antes estaba el servicio de pagos local. El servidor es un servidor `node:http`
en loopback dentro del mismo proceso: la petición cruza realmente un socket y
la cabecera llega realmente como cabecera, que es de lo que trata esta página —
un segundo proceso añadiría un segundo arranque y no probaría nada más:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AsyncNarrativeContext,
  parseTraceparent,
  renderMarkdownBody,
  renderStructuralDocument,
  type TraceNode,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpPaymentService } from "../src/http-payment-service.js";
import { InMemoryInventory } from "../src/inventory.js";
import { InMemoryOrderRepository } from "../src/orders.js";
import { DECLINING_CARD } from "../src/payments.js";
import { DefaultRemoteOrderService, type RemoteOrderService } from "../src/remote-order-service.js";
import { PaymentServiceProcess } from "../support/payment-service-process.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { serviceContextLoggingTo } from "../support/service-log.js";
import { useStableSpanIds } from "../support/stable-ids.js";

/**
 * Proves documentation/recipes/follow-one-request-across-services.md: the checkout charges a card
 * through a second service over HTTP, the W3C `traceparent` goes with the request, and the callee's
 * own trace carries the caller's trace id (release rule 8, docs as tests).
 *
 * @llmNote The callee's narrative is rendered here, not by the Vitest fixture: the fixture writes
 * the trace of the context it manages, and the point of this page is that the second service has a
 * context — and a narrative — of its own. The caller's `.nt` is embedded rather than its Markdown:
 * the HTTP round trip is the one span whose duration can cross the renderer's 200 ms "slow" marker
 * on a loaded host, and the structural trace carries no durations at all.
 */
const SLUG = "follow-one-request-across-services";
const LOG_FILE = recipeOutput(SLUG, "checkout.log");
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";
const DEMO_TRACE = parseTraceparent(DEMO_TRACEPARENT);
const DEMO_TRACE_ID = DEMO_TRACE?.traceId;

let paymentService: PaymentServiceProcess;
let context: AsyncNarrativeContext;
let stock: InMemoryInventory;
let repository: InMemoryOrderRepository;
let checkout: RemoteOrderService;
let endpoint: string;

/** The checkout, with the HTTP payment client where the local one used to be. */
function checkoutCalling(endpoint: string): RemoteOrderService {
  const inventory = traceObject(
    stock,
    context,
    { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
    { className: "InventoryService" },
  );
  const payments = traceObject(
    new HttpPaymentService(context, endpoint),
    context,
    { charge: ["customerId", "amountCents", "card"] },
    { className: "PaymentService" },
  );
  const orders = traceObject(
    repository,
    context,
    { save: ["order"] },
    { className: "OrderRepository" },
  );
  return traceObject(
    new DefaultRemoteOrderService(inventory, payments, orders),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
}

async function startServices(logFile: string): Promise<void> {
  context = serviceContextLoggingTo(logFile, { serviceName: "checkout", fresh: true });
  paymentService = new PaymentServiceProcess(logFile);
  stock = new InMemoryInventory("SKU-KB", 5);
  repository = new InMemoryOrderRepository();
  endpoint = await paymentService.start();
  checkout = checkoutCalling(endpoint);
}

function child(parent: TraceNode, methodName: string): TraceNode {
  const found = parent.children.find((node) => node.signature.methodName === methodName);
  if (found === undefined) throw new Error(`no ${methodName} under ${parent.signature.methodName}`);
  return found;
}

beforeEach(useStableSpanIds);

afterEach(async () => {
  await paymentService.stop();
});

describe("follow one request across services", () => {
  it("the payment service continues the trace the checkout sent", async () => {
    await startServices(LOG_FILE);
    const caller = await context.run(async () => {
      const orderId = await checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");
      expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
      return context.captureTrace();
    }, DEMO_TRACE);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(repository.saved()).toHaveLength(1);
    writeBothNarratives(caller);
    assertTheTraceCrossedTheWire(caller.roots[0] as TraceNode);
  });

  it("a request sent outside any span carries no traceparent", async () => {
    await startServices(recipeOutput(SLUG, "untraced.log"));
    const payments = new HttpPaymentService(context, endpoint);

    await context.run(() => payments.charge("C-1234", 7998, "4242424242424242"), DEMO_TRACE);

    expect(paymentService.lastServed().traceparent).toBeUndefined();
  });
});

describe("follow one request across services, declined", () => {
  it("a declined card crosses the wire as an error and the stock is released", async () => {
    await startServices(recipeOutput(SLUG, "declined.log"));
    const attempt = context.run(
      () => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD),
      DEMO_TRACE,
    );

    await expect(attempt).rejects.toThrow("card declined by the issuer");
    expect(stock.availableUnits("SKU-KB")).toBe(5);
    expect(repository.saved()).toHaveLength(0);
    expect(paymentService.lastServed().trace.roots[0]?.outcome.kind).toBe("threw");
  });
});

/**
 * One trace id in both services, and the parent the header named is the caller's own `charge` span.
 * The callee adopts the trace id and records the sent parent span as its root's parent.
 */
function assertTheTraceCrossedTheWire(placeOrder: TraceNode): void {
  const served = paymentService.lastServed();
  expect(parseTraceparent(served.traceparent)?.traceId).toBe(DEMO_TRACE_ID);
  const sentParent = (served.traceparent as string).split("-")[2];
  const callerCharge = child(placeOrder, "charge");
  expect(callerCharge.spanContext?.spanId).toBe(sentParent);

  const calleeRoot = served.trace.roots[0] as TraceNode;
  expect(calleeRoot.signature.methodName).toBe("charge");
  expect(calleeRoot.spanContext?.traceId).toBe(DEMO_TRACE_ID);
  expect(calleeRoot.spanContext?.parentSpanId).toBe(sentParent);
  expect(readFileSync(LOG_FILE, "utf-8")).toContain('"service.name":"payment-service"');
}

/** The caller's value-free `.nt` and the callee's own narrative, into the directory the page embeds. */
function writeBothNarratives(caller: Parameters<typeof renderStructuralDocument>[0]): void {
  mkdirSync(recipeOutput(SLUG), { recursive: true });
  writeFileSync(
    join(recipeOutput(SLUG), "checkout.nt"),
    `${renderStructuralDocument(caller, "a customer checks out against the payment service")}\n`,
  );
  writeFileSync(
    join(recipeOutput(SLUG), "payment-service.md"),
    `${renderMarkdownBody(paymentService.lastServed().trace)}\n`,
  );
}
```

## La salida real

**Las líneas de ambos servicios, un solo fichero** — las del llamante llevan
`"service.name":"checkout"`, las del servicio de pagos
`"service.name":"payment-service"`:

```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","parent_span_id":"c4e1d0a7c4e1d0a7","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000003","service.name":"payment-service","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000003","service.name":"payment-service","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","parent_span_id":"c4e1d0a7c4e1d0a7","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```

**La traza propia del llamante,** el artefacto estructural sin valores de esa
ejecución
(`narrativetrace-output/recipes/follow-one-request-across-services/checkout.nt`)
— los ids de span de abajo son los que usa esta página para leer:

```text
scenario: a customer checks out against the payment service

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)

```

**La narrativa propia del servicio de pagos,** capturada por su propio contexto
al final de la petición y renderizada junto a la del llamante:

```text
- `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.96ms #1
```

## Cómo leerlo

- **Un id de traza, en las líneas de ambos servicios.**
  `c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` es el `trace_id` de cada línea de arriba,
  la del llamante y la del llamado por igual. El del llamante es la traza en la
  que está esta ejecución; el del llamado es ese mismo id porque lo *adoptó* de
  la cabecera. Nada los correlaciona a posteriori — nunca estuvieron separados.
- **Los dos servicios se distinguen por `service.name`, no por el id.**
  `checkout` es el llamante, `payment-service` es el llamado, porque cada
  contexto se construyó con su propia identidad de servicio. Los dos nunca
  comparten contexto: un servicio tiene el suyo, que es también lo que tienes
  en producción, donde el otro servicio es un proceso distinto en otra máquina.
- **El `#1.2` del llamante y el `#1` del llamado son el mismo trabajo, visto
  desde ambos extremos.** En la traza del llamante, `#1.2 PaymentService.charge`
  es el span *cliente*: empieza cuando el checkout llama al cliente y termina
  cuando vuelve la respuesta, así que incluye todo el viaje de ida y vuelta. En
  la narrativa del servicio de pagos, `#1 PaymentService.charge` es el span
  *servidor*: el trabajo que realmente hizo. Cada servicio numera sus propios
  spans desde `#1` — la unión es el id de traza, no el número.
- **La cabecera nombra el span `charge` del llamante como padre.** La petición
  llevaba `00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-<el id de span del #1.2 del llamante>-01`.
  Los ids de span son aleatorios en una ejecución real, así que la prueba los
  fija a un contador para que el log sea reproducible (`support/stable-ids.ts`;
  nunca hagas eso en tu propio proyecto): el `charge` del llamante es
  `0000000000000003`, y `assertTheTraceCrossedTheWire` de arriba comprueba que
  el campo padre de la cabecera *es* ese id, que la raíz del llamado lleva el
  id de traza enviado y que el `charge` raíz del llamado registra ese mismo id
  como su `parentSpanId`. Ese padre es el vínculo entre los dos árboles.
- **Cómo unirlos en una búsqueda de logs.** El id de traza es el campo
  `trace_id` de cada línea que escribe NarrativeTrace, en cualquiera de los
  servicios. Una petición a través de ambos es
  `grep c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` — o, en el agregador que uses,
  `trace_id:"c4e1…"`. El *nombre* de traza por el que
  [Añade registro a este servicio](anade-registro-a-este-servicio.md) hace grep
  (`nt.traceName`) deriva del mismo id, así que también sirve de clave de
  búsqueda, y se lee mejor para una persona.
- **Las dos narrativas siguen siendo dos.** Los spans del servicio de pagos
  están en la traza del servicio de pagos, no en la del llamante:
  `captureTrace()` en cualquiera de los lados devuelve el trabajo de ese lado.
  Un id de traza, dos árboles.

## Lo que no se captura

- **Un salto por un servicio que no reenvía la cabecera rompe la cadena.** La
  correlación es cooperativa: la cadena se sostiene mientras cada servicio de
  ella *pase `traceparent` al siguiente*. Un proxy, un consumidor de cola o un
  servicio de terceros que descarta la cabecera deja al siguiente servicio con
  NarrativeTrace sin nada que adoptar, y este inicia una traza nueva — con
  razón, pues no tiene un padre honesto que nombrar. Un servicio sin
  NarrativeTrace en absoluto está bien *si* reenvía la cabecera que recibió.
- **No se envía cabecera cuando no hay nada que nombrar.** Sin ningún span
  abierto, `tracedFetch` no añade nada en lugar de un `traceparent` que apunte
  a un span que nunca existió (la segunda prueba del escenario lo comprueba).
  Una llamada sin traza desde el checkout, por tanto, no puede unirse, y es a
  propósito. Un `traceparent` que fijes tú mismo nunca se sobrescribe.
- **La cabecera se lee cuando se hace la llamada.** `tracedFetch` nombra el
  span que está abierto en ese momento, así que la llamada HTTP tiene que
  hacerse mientras el método trazado aún ejecuta su parte síncrona —
  `HttpPaymentService.charge` la llama antes de su primer `await`. Una llamada
  de cliente hecha tras un `await` anterior dentro del mismo método no nombraría
  el span de `charge`.
- **Solo `traceparent`.** El cliente de arriba no envía `tracestate` ni
  baggage: nada en este camino lee ni escribe estado de proveedor, y ningún
  valor de la aplicación cruza el cable a causa del trazado.
- **Nada vuelve.** La respuesta no lleva cabecera de traza, así que la
  narrativa del llamante dice lo que envió y lo que recibió, nunca lo que hizo
  el llamado por dentro. La narrativa propia del llamado es el registro de eso,
  y el id de traza es lo que la encuentra.
- **Dos servicios, un proceso, un socket.** Lo que esta ejecución no ejercita
  es un segundo proceso y una red que puede fallar. El mecanismo de la cabecera
  no cambia por ninguno de los dos; los modos de fallo de la llamada en sí son
  los de tu cliente HTTP. El `.nt` del llamante se incluye en lugar de su
  Markdown porque el Markdown marca como lento un nodo de más de 200 ms, y un
  viaje de ida y vuelta es el span con más probabilidad de superarlo en una
  máquina cargada; la traza estructural no lleva duraciones.

**La skill para esto:** `narrativetrace-verify` — un cambio que cruza servicios
es exactamente el caso para el que existe: escribe la intención, ejecuta el
camino real más pequeño y lee la traza contra ella antes de darlo por
terminado.
