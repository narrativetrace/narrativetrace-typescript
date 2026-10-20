<!-- source: documentation/recipes/follow-a-flow-across-threads.md blob ab7b7ff9f6ac | translated: 2026-10-18 | reviewed: - -->
# Acompanhe um fluxo entre threads

[English](../../recipes/follow-a-flow-across-threads.md) | [Español](../../es/recetas/sigue-un-flujo-entre-hilos.md) | **Português** | [简体中文](../../zh-CN/实用方案/跨线程追踪一个流程.md)

## O problema

> O checkout entrega as partes lentas para trabalho em segundo plano. O trace
> para na passagem e não consigo ver o que o trabalho em segundo plano fez.

O Node executa o seu JavaScript em uma única thread, então "entre threads" aqui
significa *entre escopos assíncronos*: tarefas que rodam lado a lado e workers
que foram iniciados antes mesmo de a requisição chegar. O que acompanha uma
requisição por `await`s comuns é o escopo do seu `AsyncLocalStorage`; o que não
a acompanha é tudo o que roda em outro escopo. Entregar trabalho a esse escopo
entrega o trabalho e nada mais — o trace também precisa ser entregue,
explicitamente, no momento do lançamento. Abaixo está uma execução que faz isso
e outra que não faz.

## Configuração mínima

Nada além da [instalação](../guia-de-instalacao.md): `ForkJoinGroup` e
`FireAndForgetGroup` estão em `@narrativetrace/core-node`, ao lado do próprio
contexto. Qual usar depende do que quem lança faz em seguida:

| A chamada que lança | O auxiliar | O passo final |
|---|---|---|
| Espera o trabalho em segundo plano (esta página) | `ForkJoinGroup.all(context, tasks)`, ou `create()` + `fork()` + `await join()` | `join()`, depois que as tarefas terminam — ele publica o que elas registraram sob o span que lançou |
| Retorna sem esperar | `FireAndForgetGroup.create(context).launch(task)` | Nenhum. Cada tarefa é publicada quando termina, e uma tarefa que falha não pode quebrar o fluxo que a lançou |

Cada tarefa recebe um contexto bifurcado que carrega o id do trace de quem
chamou e o span que a lançou. Tudo o que tiver trace dentro da tarefa precisa
ter trace *por esse contexto* — por isso o cenário abaixo constrói seus
colaboradores por contexto. Se o seu framework já propaga o escopo (uma
requisição Express ou Hono encapsulada por `@narrativetrace/express` /
`@narrativetrace/hono`, uma cadeia com `await` dentro dela), você não escreve
nenhuma das duas coisas acima. O [Guia de funcionalidades](../guia-de-funcionalidades.md)
é a versão linha a linha.

As linhas de log usam a mesma ponte do pino de
[Acompanhe uma requisição entre serviços](acompanhe-uma-requisicao-entre-servicos.md),
com o contexto assíncrono, porque o id do trace é justamente o que está sendo
acompanhado.

## O cenário

**O checkout, com as duas etapas lentas lado a lado.** A passagem é o
`ForkJoinGroup.all` em torno das duas tarefas, cada uma fazendo seu trabalho por
meio de colaboradores com trace do seu próprio contexto bifurcado:

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

**O mesmo trabalho sem a passagem.** Um worker iniciado antes de qualquer
requisição executa os jobs que recebe no escopo em que foi iniciado, que é o que
faz um consumidor de fila, o callback de um pool ou um laço orientado a eventos:

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

**A execução — e o mesmo trabalho sem a passagem.** O segundo teste envia uma
chamada com trace a esse worker sem grupo e sem fork, que é como o código era
antes de a passagem ser adicionada:

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

## A saída real

**O log da execução que mantém o trace:**

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

**O trace estrutural dessa execução**
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

O artefato Markdown da mesma execução traz mais três coisas — o join do segmento
de fork, o tempo de relógio dele e uma dica de "async sequencial" onde as
tarefas não se sobrepuseram — e não é embutido aqui porque os números mudam a
cada execução.

## Como ler a saída

- **A passagem é visível na estrutura.** `~ fork [2]` no `.nt` é o grupo: dois
  membros, unidos, sob `#1`. O log carrega também o ciclo de vida do próprio
  grupo, não só os spans: uma linha `⑂ fork group created` para cada membro,
  que nomeia a raiz do membro como `span_id` e o span que o lançou como
  `parent_span_id`, e uma linha `⑃ fork joined` com a contagem de membros, as
  três com o mesmo `nt.groupId` (a ponte do pino as escreve no nível de
  entrada, como o listener do Java). O tempo de parede da união está no
  artefato Markdown, não na linha de log.
- **As linhas dos filhos carregam o id do trace do cliente e nomeiam o span que
  os lançou como pai.** `InventoryService.reserve` e
  `FraudCheckService.approve` são escritos com
  `"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7"` — o mesmo id de todas as
  linhas ao redor — e `"parent_span_id":"0000000000000001"`, que é o `span_id`
  de `OrderService.placeOrder`. (Em uma execução real os ids de span são
  aleatórios; o teste os numera para que o log seja reproduzível,
  `support/stable-ids.ts` — nunca faça isso no seu próprio projeto.) A asserção
  `assertTheChildrenCameHome`, acima, diz a mesma coisa em código: o id de trace
  de cada filho é o da raiz, o pai de cada filho é o span da raiz, e cada um é
  registrado como membro `fork-join`. Essa asserção é a prova desta página.
- **Cada filho aparece na árvore de quem chamou, e duas vezes no log.** As
  tarefas rodaram em seus próprios contextos bifurcados, e o grupo as publicou
  sob o span que as lançou quando uniu: as linhas de entrada e retorno do
  próprio filho, escritas enquanto rodava, e a linha `⑂ fork group created` do
  grupo para ele, escrita na união; `#1.1` e `#1.2` no `.nt` dentro de
  `~ fork [2]`. O `.nt` lista os membros de um fork em uma ordem
  fixa própria, não na ordem em que começaram, e por isso
  `FraudCheckService.approve` precede `InventoryService.reserve` ali enquanto o
  log mostra `reserve` primeiro.
- **As chamadas depois do join pertencem a quem chamou.**
  `PaymentService.charge` e `OrderRepository.save` rodam no escopo que lançou,
  depois do `await`, então são `#1.3` e `#1.4` fora do fork — o formato do
  código, lido de volta como uma árvore.
- **Como a segunda execução difere.** Entregue a mesma chamada com trace ao
  worker sem grupo e o job roda no escopo do worker, que não tem trace: a sua
  primeira chamada com trace faz o que qualquer primeira chamada com trace faz e
  inicia um. O teste afirma as duas consequências — o id de trace observado *no
  worker* não é o de quem chamou, e o trace capturado de quem chamou não contém
  `InventoryService.reserve` algum. O trabalho ainda acontece, o estoque ainda é
  reservado, as linhas ainda são registradas. Elas são simplesmente a história
  de outra pessoa, sob um id que ninguém está procurando. Esse log não é
  embutido: uma execução real gera esse id ao acaso, e um id que difere a cada
  execução é o achado, não um bloco que uma página consiga conter.
- **Por que as tarefas aqui só se sobrepõem em um `await`.** O reserve é uma
  chamada simples e a verificação de fraude espera um salto, então em uma única
  thread elas se intercalam nesse `await` e não além. Isso é uma propriedade
  deste cenário, escolhida para que o log de uma execução seja reproduzível — e
  não da passagem, que é o mesmo código para tarefas de qualquer duração.

## O que não é capturado

- **Trabalho iniciado sem a passagem inicia um trace novo.** Essa é toda a
  segunda metade desta página: sem grupo, sem id de trace compartilhado. Nada
  avisa você, porque do ponto de vista da biblioteca uma chamada com trace em um
  escopo sem trace é um trace novo comum.
- **Um `Worker` real de `worker_threads` é outro isolate.** Nada de um contexto
  atravessa para dentro dele; só mensagens atravessam. Leve o trace na
  mensagem — `traceparentHeaders(context)` fornece a string `traceparent` — e
  adote-o do outro lado exatamente como o serviço chamado em
  [Acompanhe uma requisição entre serviços](acompanhe-uma-requisicao-entre-servicos.md).
- **Um framework que propaga o escopo só é coberto onde a sua integração
  diz.** O middleware do Express e do Hono dá escopo a uma requisição e o
  `AsyncLocalStorage` o leva por código com `await`; fora do que o
  [Guia de integração de frameworks](../guia-de-integracao-de-frameworks.md)
  lista, presuma que a passagem é sua para escrever.
- **`captureTrace()` está preso ao escopo.** Ele devolve o que o escopo de onde
  é chamado consegue reportar: chamado fora de `context.run(...)`, lê o escopo
  padrão do processo e devolve uma árvore vazia, não um erro. O teste captura
  dentro de `run`, como um handler de requisição faz — e por isso é o grupo, e
  não a consulta, que reúne os dois escopos.
- **Trabalho que sobrevive à chamada é outro auxiliar.** `FireAndForgetGroup`
  não tem join por definição — o método que lançou já retornou, então não sobrou
  ninguém para esperar. Cada tarefa é publicada quando termina.
- **Intercalação.** Com concorrência real, as linhas dos filhos chegam na ordem
  em que as tarefas terminam, e por isso um log se lê pelo id do trace e não
  pela posição. Os artefatos de trace não são afetados: o parentesco vem do
  fork, não da ordem em que as linhas foram escritas.

**A skill para isso:** `narrativetrace-verify` — "executa de forma assíncrona" e
"carrega estado entre chamadas" são dois dos casos para os quais ela existe, e
ela lê o trace estrutural contra a intenção antes de qualquer coisa ser dada por
concluída.
