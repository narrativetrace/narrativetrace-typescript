<!-- source: documentation/recipes/add-logging-to-this-service.md blob d1f021856897 | translated: 2026-10-11 | reviewed: - -->
# Adicione logs a este serviço

[English](../../recipes/add-logging-to-this-service.md) | [Español](../../es/recetas/anade-registro-a-este-servicio.md) | **Português** | [简体中文](../../zh-CN/实用方案/给这个服务加日志.md)

## O problema

> Adicione logs a este serviço.

O serviço é um checkout. Ele reserva o estoque, cobra um cartão e salva um
pedido, e não contém nenhuma instrução de log:

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

O que você realmente quer é aquilo para que o log é um meio: o que esta
chamada fez, com os valores com que fez, no log que sua equipe já lê. Por isso
a resposta abaixo também não escreve nenhuma instrução de log.

## Configuração mínima

Além da [instalação](../guia-de-instalacao.md) — `@narrativetrace/core-node`
e `@narrativetrace/proxy` —, esta página precisa da ponte para o logger que
você já usa e do pacote próprio desse logger:

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
```

([`@narrativetrace/winston`](../guia-de-integracao-de-frameworks.md#9-winston--pino)
funciona da mesma forma se o seu logger for o Winston.) A ponte é o único lugar
em que o logger aparece. Ela é um consumidor de eventos, e o contexto entrega
cada evento a ela, além do buffer que `captureTrace()` lê — nada no checkout,
e nada ao redor de suas chamadas, a menciona:

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

`trace` é o nível em que a ponte escreve as entradas e os retornos por padrão,
então o logger precisa estar escutando nesse nível. `base: null` e
`timestamp: false` apenas removem de cada linha o id do processo, o nome do
host e o relógio, porque esta página incorpora byte a byte o arquivo de log de
uma execução real e esses campos mudariam a cada execução — coloque-os de
volta no seu próprio projeto, nada mais muda.

## O cenário

Cada colaborador é encapsulado uma vez, onde é construído — o próprio checkout
por último, para que as chamadas feitas através dele sejam capturadas antes de
chegar à implementação real. O JavaScript não preserva em tempo de execução
nem os nomes dos parâmetros nem as interfaces, então o encapsulamento informa
os dois: os nomes dos parâmetros de cada método e o nome da interface sob o
qual cada chamada deve ser registrada. Nada mais muda:

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

O teste que executa isso é um teste comum do Vitest, porque é onde um fluxo
como este já é exercitado; a mesma configuração funciona em um script simples
ou em um handler do Express:

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

`useStableSpanIds` e o `traceparent` adotado são o que mantém a saída desta
página igual a cada execução: uma execução real gera ids de span aleatórios e,
a menos que o cabeçalho `traceparent` de uma requisição de entrada diga o
contrário, um id de trace aleatório. Ambos são andaimes da página, não parte
da resposta.

## A saída real

O log que a execução acima escreveu, através do logger do próprio projeto — um
objeto JSON por evento, exatamente como o pino o escreveu:

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

## Como ler a saída

- Uma linha cujo `msg` começa com `→` abre uma chamada e uma que começa com
  `←` a fecha, pareadas pelo `span_id`: a primeira e a última linha são o mesmo
  span, `0000000000000001`, que é `OrderService.placeOrder`, e tudo o que está
  entre elas aconteceu dentro dele. `parent_span_id` diz quem chamou quem. Nos
  artefatos de trace, as mesmas quatro chamadas levam os ids de span `#1`,
  `#1.1`, `#1.2` e `#1.3` — [Revise um fluxo complexo antes de alterá-lo](revise-um-fluxo-complexo-antes-de-altera-lo.md)
  as lê dessa forma.
- Cada linha de entrada traz os *nomes* de parâmetros que o encapsulamento
  declarou, e é isso que a transforma em uma frase e não em uma tupla:
  `nt.parameters` de `reserve` é `sku: "SKU-KB"` e `quantity: 2`, sem
  necessidade de legenda.
- `← returned: null` é um método sem nada a retornar — o JavaScript não tem
  `void`, então `undefined` é escrito como `null`. `← returned: "PAY-C-1234-7998"`
  carrega o valor: é o id do próprio gateway, e `amountCents: 7998` é de onde
  vem o preço de dois teclados.
- Dois valores sumiram. `cardNumber` é `[REDACTED]` por causa do seu *nome* —
  a lista de bloqueio sempre ativa, sem anotação, sem configuração. `card`, uma
  chamada abaixo, é `[REDACTED]` por causa do seu *valor*: o parâmetro se chama
  `card`, que a lista de bloqueio não conhece, e o número que ele continha é
  válido pelo algoritmo de Luhn, então a regra de formato de valor o capturou
  mesmo assim. Veja
  [Privacidade e ocultação](../privacidade-e-ocultacao.md).
- `nt.traceName`, `solid wand romps`, é o nome do próprio trace em todas as
  linhas, de modo que todas as linhas de um checkout podem ser extraídas com
  grep de um log movimentado.

A conclusão que isso sustenta: a narrativa veio dos nomes dos métodos, dos
nomes dos parâmetros e dos valores, e nenhuma instrução de log foi escrita
para obtê-la.

## O que não é capturado

- **Somente o código encapsulado é registrado.** Quatro objetos foram
  encapsulados acima, então aparecem quatro chamadas. Uma chamada entre duas
  classes não encapsuladas — ou um método privado dentro de
  `DefaultOrderService` — fica invisível aqui, assim como uma chamada que um
  objeto encapsulado faz a si mesmo. Se encapsular cada colaborador à mão não
  é o que você quer, [Escolhendo uma integração](../escolhendo-uma-integracao.md)
  mostra o trade-off de cada caminho.
- **Um valor que corresponde às regras de ocultação é substituído antes de ser
  escrito,** inclusive nesta linha de log. Isso não é configurável para baixo, e
  significa que um parâmetro ocultado não pode ser recuperado a partir do log.
- **O nível do próprio logger continua valendo.** Estas linhas são `trace` no
  logger; em `info` o arquivo fica vazio e nada avisa você. O nível de tracing
  é o outro dial: ele decide o que é capturado, e o logger decide o que é
  escrito ([Guia de configuração, dois diais](../guia-de-configuracao.md#9-dois-diais-dois-caminhos)).
- **Os tempos não estão nas linhas de log.** A duração de cada chamada está nos
  artefatos de trace, não aqui.

**A skill para isso:** `add-narrative-tracing` — ela instala os pacotes,
encapsula a primeira classe e confere a configuração com `narrativetrace-doctor`.
