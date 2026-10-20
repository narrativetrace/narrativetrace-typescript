<!-- source: documentation/recipes/follow-one-request-across-services.md blob 6ef2b77d5d7c | translated: 2026-10-18 | reviewed: - -->
# Acompanhe uma requisição entre serviços (tracing distribuído)

[English](../../recipes/follow-one-request-across-services.md) | [Español](../../es/recetas/sigue-una-peticion-entre-servicios.md) | **Português** | [简体中文](../../zh-CN/实用方案/跨服务追踪一次请求.md)

## O problema

> O checkout chama o serviço de pagamento por HTTP. Quando um pedido dá errado,
> quero ver uma única requisição atravessando os dois — não dois logs que eu
> preciso alinhar à mão.

Dois serviços, dois arquivos de log, dois conjuntos de ids. O que os transforma
em uma única história é um valor que viaja junto com a requisição: o cabeçalho
[`traceparent`](https://www.w3.org/TR/trace-context/#traceparent-header) do
W3C. Quem chama envia o trace em que está e o span a partir do qual chama; quem
é chamado adota esse trace em vez de iniciar um próprio. A seguir está uma
execução exatamente disso, com as linhas dos dois serviços em um único arquivo.

## Configuração mínima

Além da [instalação](../guia-de-instalacao.md), quem chama não precisa de nada
novo: `tracedFetch(context)` e `traceparentHeaders(context)` estão em
`@narrativetrace/core-node`, que ele já tem. Quem é chamado precisa da metade de
entrada — e qual código é essa metade depende de como ele foi construído:

| O serviço chamado é | A metade de entrada é |
|---|---|
| Uma aplicação Express | O middleware `narrativeTrace()` de `@narrativetrace/express`, que adota o cabeçalho para você |
| Uma aplicação Hono | O middleware `narrativeTrace()` de `@narrativetrace/hono`, do mesmo modo |
| Qualquer outra coisa — um servidor `node:http` puro, um framework de handlers | Três linhas no que rodar primeiro a cada requisição: ler `traceparent`, `parseTraceparent(header)`, atender dentro de `context.run(fn, thatTraceparent)` |

O serviço de pagamento desta página é a terceira linha: o projeto do checkout
roda sem framework, então o handler lê o cabeçalho por conta própria. Esse
também é o exemplo honesto do que o middleware faz, já que são as mesmas três
linhas ([Guia de integração de frameworks](../guia-de-integracao-de-frameworks.md)).

As linhas de log vêm da ponte do pino, como em
[Adicione logs a este serviço](adicione-logs-a-este-servico.md). Os dois
serviços escrevem em um único arquivo por meio dela, cada um com um contexto
próprio que dá o nome do seu serviço, porque o id do trace é justamente o que
está sendo acompanhado:

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

## O cenário

**O lado de quem chama: um cabeçalho.** O colaborador de pagamento do checkout
agora é um cliente HTTP. `tracedFetch(context)` é o `fetch` global que lê o span
aberto no momento da chamada e define um único cabeçalho — todo o resto é uma
requisição comum:

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

O checkout ao redor é o mesmo de todas as páginas, com `await` onde está a
chamada de pagamento (`src/remote-order-service.ts`): reservar, cobrar, salvar
e liberar em caso de recusa.

**O lado de quem é chamado: um contexto próprio.** O serviço de pagamento é um
segundo serviço, o que significa um segundo contexto de narrativa — criado com
seu próprio nome de serviço, para que um único arquivo de log consiga distinguir
os dois (`support/payment-service-process.ts`):

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

**O lado de quem é chamado: ler, executar, capturar, reiniciar.** Esta é a
metade de entrada inteira, no mesmo arquivo — e a mesma sequência que os
middlewares do Express e do Hono executam para uma aplicação construída sobre
eles:

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

**A execução.** O checkout, encapsulado como sempre, com o cliente HTTP no lugar
em que ficava o serviço de pagamento local. O servidor é um servidor
`node:http` em loopback, no mesmo processo: a requisição realmente atravessa um
socket e o cabeçalho realmente chega como cabeçalho, que é o assunto desta
página — um segundo processo traria uma segunda inicialização e não provaria
nada além disso:

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

## A saída real

**As linhas dos dois serviços, em um único arquivo** — as de quem chama levam
`"service.name":"checkout"`, as do serviço de pagamento levam
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

**O trace de quem chama,** o artefato estrutural sem valores dessa execução
(`narrativetrace-output/recipes/follow-one-request-across-services/checkout.nt`)
— os ids de span abaixo são aqueles pelos quais esta página lê:

```text
scenario: a customer checks out against the payment service

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)

```

**A narrativa do próprio serviço de pagamento,** capturada pelo contexto dele ao
fim da requisição e renderizada ao lado da de quem chama:

```text
- `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.96ms #1
```

## Como ler a saída

- **Um id de trace, nas linhas dos dois serviços.**
  `c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` é o `trace_id` de todas as linhas acima,
  tanto as de quem chama quanto as de quem é chamado. O de quem chama é o trace
  em que esta execução está; o de quem é chamado é esse mesmo id porque ele o
  *adotou* a partir do cabeçalho. Nada os correlaciona depois do fato — eles
  nunca estiveram separados.
- **Os dois serviços se distinguem por `service.name`, não pelo id.**
  `checkout` é quem chama, `payment-service` é quem é chamado, porque cada
  contexto foi construído com a sua própria identidade de serviço. Os dois nunca
  compartilham um contexto: um serviço tem o seu, que é também o que você tem em
  produção, onde o outro serviço é um processo diferente em um host diferente.
- **O `#1.2` de quem chama e o `#1` de quem é chamado são o mesmo trabalho, visto
  das duas pontas.** No trace de quem chama, `#1.2 PaymentService.charge` é o
  span *cliente*: começa quando o checkout chama o cliente e termina quando a
  resposta volta, então inclui a viagem de ida e volta inteira. Na narrativa do
  serviço de pagamento, `#1 PaymentService.charge` é o span *servidor*: o
  trabalho que ele realmente fez. Cada serviço numera os próprios spans a
  partir de `#1` — a ligação é o id do trace, não o número.
- **O cabeçalho nomeia o span `charge` de quem chama como pai.** A requisição
  levou `00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-<o id do span #1.2 de quem chama>-01`.
  Em uma execução real os ids de span são aleatórios, então o teste os fixa em
  um contador para tornar o log reproduzível (`support/stable-ids.ts`; nunca
  faça isso no seu próprio projeto): o `charge` de quem chama é
  `0000000000000003`, e `assertTheTraceCrossedTheWire`, acima, afirma que o
  campo pai do cabeçalho *é* esse id, que a raiz de quem é chamado carrega o id
  de trace enviado e que a raiz `charge` de quem é chamado registra esse mesmo
  id como seu `parentSpanId`. Esse pai é o elo entre as duas árvores.
- **Como juntá-los em uma busca de logs.** O id do trace é o campo `trace_id` em
  toda linha que o NarrativeTrace escreve, em qualquer um dos serviços. Uma
  requisição atravessando os dois é `grep c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` — ou,
  no agregador que você usar, `trace_id:"c4e1…"`. O *nome* do trace pelo qual
  [Adicione logs a este serviço](adicione-logs-a-este-servico.md) faz o grep
  (`nt.traceName`) deriva do mesmo id, então também serve de chave de busca, e é
  mais agradável para um humano ler.
- **As duas narrativas continuam duas.** Os spans do serviço de pagamento estão
  no trace do serviço de pagamento, não no de quem chama: `captureTrace()` de
  qualquer um dos lados devolve o trabalho daquele lado. Um id de trace, duas
  árvores.

## O que não é capturado

- **Um salto por um serviço que não repassa o cabeçalho quebra a cadeia.** A
  correlação é cooperativa: a cadeia se sustenta enquanto todo serviço nela
  *repassar o `traceparent`*. Um proxy, um consumidor de fila ou um serviço de
  terceiros que descarta o cabeçalho deixa o próximo serviço com NarrativeTrace
  sem nada para adotar, e ele inicia um trace novo — corretamente, já que não
  tem um pai honesto para nomear. Um serviço sem NarrativeTrace nenhum não tem
  problema *se* repassar o cabeçalho que recebeu.
- **Nenhum cabeçalho é enviado quando não há nada a nomear.** Sem nenhum span
  aberto, `tracedFetch` não adiciona nada, em vez de um `traceparent` apontando
  para um span que nunca existiu (o segundo teste do cenário afirma isso). Uma
  chamada sem trace saindo do checkout, portanto, não pode ser ligada, e isso é
  proposital. Um `traceparent` que você mesmo definir nunca é sobrescrito.
- **O cabeçalho é lido quando a chamada é feita.** `tracedFetch` nomeia o span
  que está aberto naquele momento, então a chamada HTTP precisa ser feita
  enquanto o método com trace ainda executa sua parte síncrona —
  `HttpPaymentService.charge` a chama antes do seu primeiro `await`. Uma
  chamada de cliente feita depois de um `await` anterior dentro do mesmo método
  não nomearia o span de `charge`.
- **Somente `traceparent`.** O cliente acima não envia `tracestate` nem baggage:
  nada neste caminho lê ou escreve estado de fornecedor, e nenhum valor da
  aplicação atravessa a rede por causa do tracing.
- **Nada volta.** A resposta não carrega cabeçalho de trace, então a narrativa
  de quem chama diz o que enviou e o que recebeu, nunca o que quem é chamado
  fez por dentro. A narrativa do próprio serviço chamado é o registro disso, e
  o id do trace é o que a encontra.
- **Dois serviços, um processo, um socket.** O que esta execução não exercita é
  um segundo processo e uma rede que pode falhar. O mecanismo do cabeçalho não
  muda com nenhum dos dois; os modos de falha da chamada em si são do seu
  cliente HTTP. O `.nt` de quem chama é embutido em vez do seu Markdown porque o
  Markdown marca como lento um nó acima de 200 ms, e uma viagem de ida e volta é
  o span com mais chance de ultrapassar isso em um host carregado; o trace
  estrutural não carrega duração alguma.

**A skill para isso:** `narrativetrace-verify` — uma mudança que atravessa
serviços é exatamente o caso para o qual ela existe: escreva a intenção,
execute o menor caminho real e leia o trace contra ela antes de dar a mudança
por concluída.
