<!-- source: documentation/recipes/follow-a-flow-across-threads.md blob ab7b7ff9f6ac | translated: 2026-10-18 | reviewed: - -->
# Sigue un flujo entre hilos

[English](../../recipes/follow-a-flow-across-threads.md) | **Español** | [Português](../../pt-BR/receitas/acompanhe-um-fluxo-entre-threads.md) | [简体中文](../../zh-CN/实用方案/跨线程追踪一个流程.md)

## El problema

> El checkout entrega las partes lentas a trabajo en segundo plano. La traza se
> detiene en el traspaso y no puedo ver qué hizo ese trabajo.

Node ejecuta tu JavaScript en un solo hilo, así que "entre hilos" aquí significa
*entre ámbitos asíncronos*: tareas que se ejecutan en paralelo, y workers que
se iniciaron antes de que llegara la petición. Lo que sigue a una petición a
través de los `await` corrientes es el ámbito de su `AsyncLocalStorage`; lo que
no la sigue es cualquier cosa que se ejecute en otro ámbito. Entregar trabajo a
ese ámbito entrega el trabajo y nada más — la traza también hay que entregarla,
de forma explícita, en el momento del lanzamiento. A continuación hay una
ejecución que lo hace y otra que no.

## Configuración mínima

Nada más allá de la [instalación](../guia-de-instalacion.md): `ForkJoinGroup` y
`FireAndForgetGroup` están en `@narrativetrace/core-node`, junto al propio
contexto. Cuál usar depende de lo que haga el llamante a continuación:

| La llamada que lanza | El helper | El paso final |
|---|---|---|
| Espera al trabajo en segundo plano (esta página) | `ForkJoinGroup.all(context, tasks)`, o `create()` + `fork()` + `await join()` | `join()`, cuando las tareas terminan — publica lo que registraron bajo el span que las lanzó |
| Retorna sin esperar | `FireAndForgetGroup.create(context).launch(task)` | Ninguno. Cada tarea se publica cuando termina, y una tarea que falla no puede romper el flujo que la lanzó |

Cada tarea recibe un contexto bifurcado que lleva el id de traza del llamante y
el span que la lanzó. Todo lo que se trace dentro de la tarea tiene que trazarse
*por ese contexto* — por eso el escenario de abajo construye sus colaboradores
por contexto. Si tu framework ya propaga el ámbito (una petición de Express o
Hono envuelta por `@narrativetrace/express` / `@narrativetrace/hono`, una
cadena con `await` dentro de ella), no escribes ninguna de las dos cosas. La
[Guía de funcionalidades](../guia-de-funcionalidades.md) es la versión fila por
fila.

Las líneas de log usan el mismo puente de pino que
[Sigue una petición entre servicios](sigue-una-peticion-entre-servicios.md),
con el contexto asíncrono, porque el id de traza es lo que se sigue.

## El escenario

**El checkout, con los dos pasos lentos en paralelo.** El traspaso es
`ForkJoinGroup.all` alrededor de las dos tareas, cada una haciendo su trabajo a
través de colaboradores trazados por su propio contexto bifurcado:

```ts
// src/parallel-checkout.ts
import { ForkJoinGroup, type NarrativeContext } from "@narrativetrace/core-node";
import type { FraudCheckService } from "./fraud-check.js";
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";
import type { RemoteOrderService } from "./remote-order-service.js";

const UNIT_PRICE_CENTS = 3999;

/** The collaborators of one checkout, as traced by one particular context. */
export interface ParallelCollaborators {
  readonly inventory: InventoryService;
  readonly fraud: FraudCheckService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the collaborators traced by `context` — the caller's, or a forked task's. */
export type CollaboratorsFor = (context: NarrativeContext) => ParallelCollaborators;

/**
 * The checkout with its two slow steps run side by side: reserve the stock and ask the fraud check
 * at once, wait for both, then charge and save.
 *
 * INTENT: shows the handover for documentation/recipes/follow-a-flow-across-threads.md.
 * `ForkJoinGroup.all` gives each task a forked context that carries the caller's trace id and the
 * span that launched it, so a task must do its traced work through collaborators traced by THAT
 * context — hence `collaboratorsFor`, called once for the caller and once per task. The group joins
 * the tasks back under the launching span when every one has settled.
 *
 * @llmNote Reaching for the caller's own traced collaborators inside a task is the mistake this
 * class exists to avoid: the call would run, and the trace would not know the task belonged to it.
 *
 * @sideEffects Reserves stock; a refused order releases the reservation before it throws, like
 * `DefaultOrderService`.
 */
export class ParallelCheckout implements RemoteOrderService {
  private readonly local: ParallelCollaborators;

  constructor(
    private readonly context: NarrativeContext,
    private readonly collaboratorsFor: CollaboratorsFor,
  ) {
    this.local = collaboratorsFor(context);
  }

  async placeOrder(
    customerId: string,
    sku: string,
    quantity: number,
    cardNumber: string,
  ): Promise<string> {
    const amountCents = UNIT_PRICE_CENTS * quantity;
    const [, approved] = await ForkJoinGroup.all(this.context, [
      (forked) => this.collaboratorsFor(forked).inventory.reserve(sku, quantity),
      (forked) => this.collaboratorsFor(forked).fraud.approve(customerId, amountCents),
    ]);
    if (!approved) {
      this.local.inventory.release(sku, quantity);
      throw new PaymentDeclinedError("the fraud check refused the order");
    }
    this.local.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.local.orders.save(order);
    return orderId;
  }
}
```

**El mismo trabajo sin el traspaso.** Un worker iniciado antes de cualquier
petición ejecuta los trabajos que se le entregan en el ámbito en el que
arrancó, que es lo que hace un consumidor de cola, el callback de un pool o un
bucle dirigido por eventos:

```ts
// support/background-worker.ts
import { EventEmitter, once } from "node:events";

/**
 * A long-lived worker started before any request, which runs the jobs it is handed in the
 * asynchronous scope it was started in — the shape of a queue consumer, a connection pool's callback
 * or an event-driven worker.
 *
 * INTENT: the "no handover" half of documentation/recipes/follow-a-flow-across-threads.md. A job
 * handed to this worker travels as a closure and nothing else: it runs in the worker's own scope,
 * not the scope of the request that submitted it, so the request's trace does not come with it.
 *
 * @llmNote The worker waits on an event emitter it created at start-up. A promise continues in the
 * scope that awaited it, so the job resumes in the worker's scope whoever emits — which is exactly
 * what makes this a faithful stand-in for a worker thread, a timer owned by a pool or a consumer
 * loop, and why a plain `await` of the job's result inside the request does not change that.
 */
export class BackgroundWorker {
  private readonly inbox = new EventEmitter();
  private readonly stopped = new AbortController();
  private readonly serving: Promise<void>;

  constructor() {
    this.serving = this.serve();
  }

  /** Hands `job` to the worker and resolves with its result once the worker has run it. */
  run<T>(job: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.inbox.emit("job", () => Promise.resolve().then(job).then(resolve, reject));
    });
  }

  async stop(): Promise<void> {
    this.stopped.abort();
    await this.serving;
  }

  private async serve(): Promise<void> {
    try {
      for (;;) {
        const [job] = (await once(this.inbox, "job", { signal: this.stopped.signal })) as [
          () => Promise<void>,
        ];
        await job();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  }
}
```

**La ejecución — y el mismo trabajo sin el traspaso.** La segunda prueba envía
una llamada trazada a ese worker sin grupo y sin bifurcación, que es el aspecto
que tenía el código antes de añadir el traspaso:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AsyncNarrativeContext,
  parseTraceparent,
  renderStructuralDocument,
  type TraceId,
  type TraceNode,
} from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FRAUD_LIMIT_CENTS } from "../src/fraud-check.js";
import { BackgroundWorker } from "../support/background-worker.js";
import { tracedParallelCheckout } from "../support/parallel-wiring.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { serviceContextLoggingTo } from "../support/service-log.js";
import { useNumberedTraceIds, useStableSpanIds } from "../support/stable-ids.js";

/**
 * Proves documentation/recipes/follow-a-flow-across-threads.md: the two tasks the checkout hands to
 * a `ForkJoinGroup` stay inside the caller's trace, and a job handed to a long-lived worker with no
 * handover starts a trace of its own (release rule 8, docs as tests).
 *
 * @llmNote The no-handover run's log is not embedded: its trace id is minted fresh every run, which
 * is the finding it reports and the one thing no embedded block can hold. The test asserts it by
 * reading the id the worker saw.
 */
const SLUG = "follow-a-flow-across-threads";
const DEMO_TRACE_ID = parseTraceparent(
  "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01",
)?.traceId;

let context: AsyncNarrativeContext;

beforeEach(useStableSpanIds);

/** A context that logs to `fileName` under this page's output directory. */
function contextLoggingTo(fileName: string): AsyncNarrativeContext {
  return serviceContextLoggingTo(recipeOutput(SLUG, fileName));
}

function names(nodes: readonly TraceNode[]): string[] {
  return nodes.map((node) => `${node.signature.className}.${node.signature.methodName}`);
}

describe("follow a flow across threads", () => {
  it("the background tasks stay in the customers trace", async () => {
    context = contextLoggingTo("checkout.log");
    const { checkout, stock, repository } = tracedParallelCheckout(context);

    const trace = await context.run(async () => {
      const orderId = await checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");
      expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
      return context.captureTrace();
    }, DEMO_TRACE_ID);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(repository.saved()).toHaveLength(1);
    writeFileSync(
      join(recipeOutput(SLUG), "checkout.nt"),
      `${renderStructuralDocument(trace, "the background tasks stay in the customers trace")}\n`,
    );
    assertTheChildrenCameHome(trace.roots[0] as TraceNode);
    assertTheLogCarriesTheForkLifecycle(recipeOutput(SLUG, "checkout.log"));
  });

  it("a refused order releases the reservation the task made", async () => {
    context = contextLoggingTo("refused.log");
    const { checkout, stock } = tracedParallelCheckout(context, 100);
    const quantityOverTheLimit = Math.ceil(FRAUD_LIMIT_CENTS / 3999) + 1;

    const attempt = context.run(
      () => checkout.placeOrder("C-1234", "SKU-KB", quantityOverTheLimit, "4242424242424242"),
      DEMO_TRACE_ID,
    );

    await expect(attempt).rejects.toThrow("the fraud check refused the order");
    expect(stock.availableUnits("SKU-KB")).toBe(100);
  });
});

describe("follow a flow across threads, without the handover", () => {
  let worker: BackgroundWorker;

  beforeEach(() => {
    useNumberedTraceIds();
    worker = new BackgroundWorker();
  });

  afterEach(async () => {
    await worker.stop();
  });

  it("a job handed to a worker without the handover starts a new trace", async () => {
    context = contextLoggingTo("no-handover.log");
    const { stock, collaboratorsFor } = tracedParallelCheckout(context);
    let seenByTheWorker: TraceId | undefined;

    const caller = await context.run(async () => {
      // No ForkJoinGroup, no snapshot: the job is handed over, the trace is not.
      await worker.run(() => {
        collaboratorsFor(context).inventory.reserve("SKU-KB", 2);
        seenByTheWorker = context.traceId();
      });
      return { traceId: context.traceId(), trace: context.captureTrace() };
    }, DEMO_TRACE_ID);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(seenByTheWorker).toBeDefined();
    expect(seenByTheWorker).not.toBe(caller.traceId);
    expect(names(caller.trace.roots)).not.toContain("InventoryService.reserve");
    expect(readFileSync(recipeOutput(SLUG, "no-handover.log"), "utf-8")).toContain(
      `"trace_id":"${seenByTheWorker}"`,
    );
  });
});

/** The log names the group: one launch line per member, then the join that closes it. */
function assertTheLogCarriesTheForkLifecycle(logFile: string): void {
  const lines = readFileSync(logFile, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const launches = lines.filter((line) => line["nt.eventType"] === "fork");
  const joins = lines.filter((line) => line["nt.eventType"] === "join");
  expect(launches).toHaveLength(2);
  expect(joins).toHaveLength(1);
  const groupId = joins[0]["nt.groupId"];
  expect(joins[0].msg).toBe(`⑃ fork joined [groupId: ${groupId}, members: 2]`);
  expect(launches.map((line) => line["nt.groupId"])).toEqual([groupId, groupId]);
}

/** The merged children are under the span that launched them, in the caller's own trace. */
function assertTheChildrenCameHome(root: TraceNode): void {
  expect(names(root.children)).toEqual([
    "InventoryService.reserve",
    "FraudCheckService.approve",
    "PaymentService.charge",
    "OrderRepository.save",
  ]);
  for (const task of root.children.slice(0, 2)) {
    expect(task.spanContext?.traceId).toBe(root.spanContext?.traceId);
    expect(task.spanContext?.parentSpanId).toBe(root.spanContext?.spanId);
    expect(task.concurrency?.kind).toBe("fork-join");
  }
}
```

## La salida real

**El log de la ejecución que conserva la traza:**

```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"FraudCheckService","code.function":"approve","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ FraudCheckService.approve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"true","msg":"← returned: true"}
{"level":10,"nt.eventType":"fork","nt.groupId":"fork-1","nt.strategy":"fork-join","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑂ fork group created [groupId: fork-1]"}
{"level":10,"nt.eventType":"fork","nt.groupId":"fork-1","nt.strategy":"fork-join","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑂ fork group created [groupId: fork-1]"}
{"level":10,"nt.eventType":"join","nt.groupId":"fork-1","nt.memberCount":2,"nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑃ fork joined [groupId: fork-1, members: 2]"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```

**La traza estructural de esa ejecución**
(`narrativetrace-output/recipes/follow-a-flow-across-threads/checkout.nt`):

```text
scenario: the background tasks stay in the customers trace

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  ~ fork [2]
    #1.1 - FraudCheckService.approve(customerId, amountCents) → value
    #1.2 - InventoryService.reserve(sku, quantity)
  #1.3 - PaymentService.charge(customerId, amountCents, card) → value
  #1.4 - OrderRepository.save(order)

```

El artefacto Markdown de la misma ejecución lleva tres cosas más — la unión del
segmento fork, su tiempo de reloj y una pista de "sequential async" donde las
tareas no se solaparon — y no se incluye aquí porque los números difieren en
cada ejecución.

## Cómo leerlo

- **El traspaso se ve en la estructura.** `~ fork [2]` en el `.nt` es el grupo:
  dos miembros, unidos, bajo `#1`. El log lleva también el ciclo de vida del
  propio grupo, no solo los spans: una línea `⑂ fork group created` por cada
  miembro, que nombra la raíz del miembro como `span_id` y el span que lo
  lanzó como `parent_span_id`, y una línea `⑃ fork joined` con el número de
  miembros, las tres con el mismo `nt.groupId` (el puente de pino las escribe
  al nivel de entrada, como el listener de Java). El tiempo de pared de la
  unión está en el artefacto Markdown, no en la línea de log.
- **Las líneas de los hijos llevan el id de traza del cliente y nombran como
  padre al span que las lanzó.** `InventoryService.reserve` y
  `FraudCheckService.approve` se escriben con
  `"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7"` — el mismo id que todas las
  líneas que las rodean — y `"parent_span_id":"0000000000000001"`, que es el
  `span_id` de `OrderService.placeOrder`. (Los ids de span son aleatorios en una
  ejecución real; la prueba los numera para que el log sea reproducible,
  `support/stable-ids.ts` — nunca hagas eso en tu propio proyecto.) La
  aserción `assertTheChildrenCameHome` de arriba dice lo mismo en código: el id
  de traza de cada hijo es el de la raíz, el padre de cada hijo es el span de la
  raíz, y cada uno se registra como miembro `fork-join`. Esa aserción es la
  prueba de esta página.
- **Cada hijo aparece en el árbol del llamante, y dos veces en el log.** Las
  tareas se ejecutaron en sus propios contextos bifurcados, y el grupo las
  publicó bajo el span que las lanzó cuando se unió: las líneas de entrada y
  retorno del propio hijo, escritas mientras se ejecutaba, y la línea
  `⑂ fork group created` del grupo para él, escrita en la unión; `#1.1` y
  `#1.2` en el `.nt` dentro de `~ fork [2]`. El `.nt` lista los miembros de un
  fork en un orden fijo propio, no en el orden en que empezaron, por lo que
  `FraudCheckService.approve` precede ahí a `InventoryService.reserve` mientras
  que el log muestra primero `reserve`.
- **Las llamadas posteriores a la unión pertenecen al llamante.**
  `PaymentService.charge` y `OrderRepository.save` se ejecutan en el ámbito que
  lanzó tras el `await`, así que son `#1.3` y `#1.4` fuera del fork — la forma
  del código, leída de vuelta como un árbol.
- **En qué se diferencia la segunda ejecución.** Entrega la misma llamada
  trazada al worker sin grupo y el trabajo se ejecuta en el ámbito del worker,
  que no tiene traza: su primera llamada trazada hace lo que hace cualquier
  primera llamada trazada e inicia una. La prueba comprueba las dos
  consecuencias — el id de traza observado *en el worker* no es el del
  llamante, y la traza capturada del propio llamante no contiene ningún
  `InventoryService.reserve`. El trabajo sigue ocurriendo, el stock sigue
  reservado, las líneas siguen registrándose. Simplemente son la historia de
  otro, bajo un id que nadie busca. Ese log no se incluye: una ejecución real
  genera ese id al azar, y un id que difiere en cada ejecución es el hallazgo,
  no un bloque que una página pueda contener.
- **Por qué las tareas de aquí solo se solapan en un `await`.** La reserva es
  una llamada simple y la comprobación de fraude espera un salto, así que en un
  hilo se intercalan en ese `await` y no más allá. Es una propiedad de este
  escenario, elegido para que el log de una ejecución sea reproducible — no del
  traspaso, que es el mismo código para tareas de cualquier duración.

## Lo que no se captura

- **El trabajo iniciado sin el traspaso inicia una traza nueva.** Esa es toda la
  segunda mitad de esta página: sin grupo, sin id de traza compartido. Nada te
  avisa, porque desde el punto de vista de la biblioteca una llamada trazada en
  un ámbito sin traza es una traza nueva corriente.
- **Un `Worker` real de `worker_threads` es otro isolate.** Nada de un contexto
  cruza hacia él; solo los mensajes. Lleva la traza en el mensaje —
  `traceparentHeaders(context)` da la cadena `traceparent` — y adóptala del otro
  lado exactamente como hace el llamado en
  [Sigue una petición entre servicios](sigue-una-peticion-entre-servicios.md).
- **Un framework que propaga el ámbito solo está cubierto donde su integración
  lo dice.** El middleware de Express y Hono da a una petición su ámbito y el
  `AsyncLocalStorage` lo lleva a través del código con `await`; fuera de lo que
  lista la [Guía de integración de frameworks](../guia-de-integracion-de-frameworks.md),
  asume que escribir el traspaso te corresponde a ti.
- **`captureTrace()` está ligado al ámbito.** Devuelve lo que el ámbito desde el
  que se llama puede informar: llamado fuera de `context.run(...)` lee el ámbito
  por defecto del proceso y devuelve un árbol vacío, no un error. La prueba
  captura dentro de `run`, como hace un handler de peticiones — por eso es el
  grupo, y no la consulta, lo que une los dos ámbitos.
- **El trabajo que sobrevive a la llamada es otro helper.** `FireAndForgetGroup`
  no tiene unión por diseño — el método que lanza ya retornó, así que no queda
  nadie que espere. Cada tarea se publica cuando termina.
- **Intercalado.** Con concurrencia real, las líneas de los hijos llegan en el
  orden en que las tareas terminan, por lo que un log se lee por id de traza y
  no por posición. Los artefactos de traza no se ven afectados: la filiación
  viene del fork, no del orden en que se escribieron las líneas.

**La skill para esto:** `narrativetrace-verify` — "runs async" y "carries
state between calls" son dos de los casos para los que existe, y lee la traza
estructural contra la intención antes de dar nada por terminado.
