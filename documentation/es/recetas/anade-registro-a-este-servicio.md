<!-- source: documentation/recipes/add-logging-to-this-service.md blob d1f021856897 | translated: 2026-10-11 | reviewed: - -->
# Añade registro a este servicio

[English](../../recipes/add-logging-to-this-service.md) | **Español** | [Português](../../pt-BR/receitas/adicione-logs-a-este-servico.md) | [简体中文](../../zh-CN/实用方案/给这个服务加日志.md)

## El problema

> Añade registro a este servicio.

El servicio es un checkout. Reserva stock, cobra una tarjeta y guarda un
pedido, y no contiene ninguna sentencia de log:

```ts
// src/order-service.ts
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/** Places an order and returns its id. */
export interface OrderService {
  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string;
}

/** The checkout: reserve the stock, charge the card, save the order — and release on a decline. */
export class DefaultOrderService implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    try {
      this.payments.charge(customerId, amountCents, cardNumber);
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        this.inventory.release(sku, quantity);
      }
      throw error;
    }
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
```

Lo que de verdad quieres es aquello para lo que el logging es un medio: qué
hizo esta llamada, con qué valores lo hizo, en el log que tu equipo ya lee. Por
eso la respuesta de abajo tampoco escribe ninguna sentencia de log.

## Configuración mínima

Además de la [instalación](../guia-de-instalacion.md) — `@narrativetrace/core-node`
y `@narrativetrace/proxy` — esta página necesita el puente hacia el logger que
ya usas, y el paquete propio de ese logger:

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
```

([`@narrativetrace/winston`](../guia-de-integracion-de-frameworks.md#9-winston-y-pino)
funciona igual si tu logger es Winston.) El puente es el único lugar donde
aparece el logger. Es un consumidor de eventos: el contexto le entrega cada
evento, además del búfer que lee `captureTrace()` — nada en el checkout, ni
nada alrededor de sus llamadas, lo menciona:

```ts
// support/log-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

/** Any pino instance works; this one writes to a fresh file and drops the per-run fields. */
function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * A context whose events reach the project's own pino logger (as well as the in-memory buffer
 * `captureTrace()` reads), for a trace id fixed by an adopted `traceparent`.
 */
export function contextLoggingTo(logFile: string): SyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerWritingTo(logFile));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT),
  );
}
```

`trace` es el nivel con el que el puente escribe entradas y retornos por
defecto, así que el logger tiene que estar escuchando ahí. `base: null` y
`timestamp: false` solo quitan de cada línea el id del proceso, el nombre del
host y el reloj, porque esta página incrusta byte a byte el fichero de log de
una ejecución real y esos campos cambiarían en cada ejecución — vuelve a
ponerlos en tu propio proyecto, nada más cambia.

## El escenario

Cada colaborador se envuelve una sola vez, donde se construye — el checkout
mismo el último, de modo que las llamadas que pasan por él se capturan antes de
llegar a la implementación real. JavaScript no conserva en tiempo de ejecución
ni los nombres de los parámetros ni las interfaces, así que el envoltorio dice
ambas cosas: los nombres que tienen los parámetros de cada método, y el nombre
de la interfaz bajo el que se debe registrar cada llamada. Nada más cambia:

```ts
// support/wiring.ts
import type { NarrativeContext } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryInventory, type InventoryService } from "../src/inventory.js";
import { DefaultOrderService, type OrderService } from "../src/order-service.js";
import { InMemoryOrderRepository, type OrderRepository } from "../src/orders.js";
import { CardPaymentService, type PaymentService } from "../src/payments.js";

/** The three collaborators a checkout is built from, as the scenario's tests hand them over. */
export interface Collaborators {
  readonly inventory: InventoryService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the checkout under test from the (already traced) collaborators. */
export type CheckoutFactory = (collaborators: Collaborators) => OrderService;

/** What a scenario reads back: the traced checkout, and the real stock and repository behind it. */
export interface TracedCheckout {
  readonly checkout: OrderService;
  readonly stock: InMemoryInventory;
  readonly repository: InMemoryOrderRepository;
}

const defaultCheckout: CheckoutFactory = ({ inventory, payments, orders }) =>
  new DefaultOrderService(inventory, payments, orders);

/**
 * The checkout every recipe runs, wired the way the first recipe wires it: each collaborator
 * wrapped once where it is constructed, the checkout itself last. The class names are the
 * interfaces' — a trace names what a caller depends on, so two implementations of one interface
 * render as the same call and one approved baseline compares across them.
 */
export function tracedCheckout(
  context: NarrativeContext,
  makeCheckout: CheckoutFactory = defaultCheckout,
): TracedCheckout {
  const stock = new InMemoryInventory("SKU-KB", 5);
  const repository = new InMemoryOrderRepository();
  const inventory = traceObject(
    stock,
    context,
    { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
    { className: "InventoryService" },
  );
  const payments = traceObject(
    new CardPaymentService(),
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
  const checkout = traceObject(
    makeCheckout({ inventory, payments, orders }),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
  return { checkout, stock, repository };
}
```

La prueba que lo ejecuta es una prueba de Vitest corriente, porque ahí es donde
un flujo como este ya se ejercita; el mismo cableado funciona en un script
sencillo o en un handler de Express:

```ts
// __tests__/add-logging-recipe.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { contextLoggingTo } from "../support/log-context.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/add-logging-to-this-service.md: the checkout, with no log statement
 * anywhere in it, logs every call through the project's own pino logger once its collaborators are
 * wrapped. The page's output block is the file pino writes, not a rendering this test produces.
 */
const LOG_FILE = join(
  "narrativetrace-output",
  "recipes",
  "add-logging-to-this-service",
  "checkout.log",
);

beforeAll(useStableSpanIds);

it("a customer checks out", () => {
  const context = contextLoggingTo(LOG_FILE);
  const { checkout, stock, repository } = tracedCheckout(context);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
  expect(readFileSync(LOG_FILE, "utf-8")).toContain("→ OrderService.placeOrder");
});
```

`useStableSpanIds` y el `traceparent` adoptado son lo que mantiene igual la
salida de esta página en cada ejecución: una ejecución real genera ids de span
aleatorios y, salvo que la cabecera `traceparent` de una petición entrante diga
otra cosa, un id de traza aleatorio. Ambos son andamiaje de la página, no parte
de la respuesta.

## La salida real

El log que escribió la ejecución anterior, a través del logger propio del
proyecto — un objeto JSON por evento, exactamente como lo escribió pino:

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

## Cómo leerla

- Una línea cuyo `msg` empieza por `→` abre una llamada y una que empieza por
  `←` la cierra, emparejadas por `span_id`: la primera línea y la última son el
  mismo span, `0000000000000001`, que es `OrderService.placeOrder`, y todo lo
  que hay entre ellas ocurrió dentro de él. `parent_span_id` dice quién llamó a
  quién. En los artefactos de traza, esas mismas cuatro llamadas llevan los ids
  de span `#1`, `#1.1`, `#1.2` y `#1.3` — [Revisa un flujo complejo antes de cambiarlo](revisa-un-flujo-complejo-antes-de-cambiarlo.md)
  las lee así.
- Cada línea de entrada lleva los *nombres* de parámetro que declaró el
  envoltorio, y eso es lo que la convierte en una frase y no en una tupla:
  `nt.parameters` de `reserve` es `sku: "SKU-KB"` y `quantity: 2`, sin
  necesidad de leyenda.
- `← returned: null` es un método sin nada que devolver — JavaScript no tiene
  `void`, así que `undefined` se escribe como `null`. `← returned: "PAY-C-1234-7998"`
  lleva el valor: es el id propio de la pasarela, y `amountCents: 7998` es de
  donde sale el precio de dos teclados.
- Dos valores han desaparecido. `cardNumber` es `[REDACTED]` por su *nombre* —
  la lista de denegación siempre activa, sin anotación ni configuración.
  `card`, una llamada más abajo, es `[REDACTED]` por su *valor*: el parámetro
  se llama `card`, que la lista de denegación no conoce, y el número que
  contenía es válido según Luhn, así que la regla de forma del valor lo atrapó
  de todos modos. Consulta [Privacidad y ocultación](../privacidad-y-ocultacion.md).
- `nt.traceName`, `solid wand romps`, es el nombre propio de la traza en cada
  línea, de modo que todas las líneas de un mismo checkout se pueden extraer con
  grep de un log concurrido.

La conclusión que esto respalda: la narrativa salió de los nombres de los
métodos, los nombres de los parámetros y los valores, y no se escribió ni una
sola sentencia de log para obtenerla.

## Lo que no se captura

- **Solo se registra el código envuelto.** Arriba se envolvieron cuatro
  objetos, así que aparecen cuatro llamadas. Una llamada entre dos clases sin
  envolver — o un método privado dentro de `DefaultOrderService` — es invisible
  aquí, y también lo es una llamada que un objeto envuelto se hace a sí mismo.
  Si envolver a mano cada colaborador no es lo que quieres,
  [Eligiendo una integración](../eligiendo-una-integracion.md) recoge el
  balance de cada vía.
- **Un valor que coincide con las reglas de ocultación se reemplaza antes de
  escribirse,** también en esta línea de log. Eso no se puede relajar, y
  significa que un parámetro ocultado no se puede recuperar del log.
- **El nivel propio del logger sigue aplicándose.** Estas líneas son `trace` en
  el logger; con `info` el fichero queda vacío y nada te avisa. El nivel de
  trazado es el otro dial: decide qué se captura, y el logger decide qué se
  escribe ([Guía de configuración, dos diales](../guia-de-configuracion.md#9-dos-diales-dos-rutas)).
- **Los tiempos no están en las líneas de log.** La duración de cada llamada
  está en los artefactos de traza, no aquí.

**La skill para esto:** `add-narrative-tracing` — instala los paquetes, envuelve
la primera clase y comprueba el cableado con `narrativetrace-doctor`.
