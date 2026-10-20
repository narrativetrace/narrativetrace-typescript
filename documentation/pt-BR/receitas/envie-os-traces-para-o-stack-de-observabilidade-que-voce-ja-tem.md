<!-- source: documentation/recipes/send-traces-to-the-observability-stack-you-already-run.md blob 81e8e4768488 | translated: 2026-10-18 | reviewed: - -->
# Envie os traces para o stack de observabilidade que você já tem

[English](../../recipes/send-traces-to-the-observability-stack-you-already-run.md) | [Español](../../es/recetas/envia-las-trazas-al-stack-de-observabilidad-que-ya-tienes.md) | **Português** | [简体中文](../../zh-CN/实用方案/把追踪发到你已有的可观测性栈.md)

## O problema

> Já temos tracing e dashboards. Não vou adotar um segundo lugar para olhar —
> isto pode entrar no stack que já rodamos?

Pode: uma execução, dois consumidores. As linhas da narrativa continuam indo
para o seu logger, e os mesmos eventos viram spans do OpenTelemetry na saída.
Abaixo está um checkout com as duas saídas lado a lado.

## Configuração mínima

`@narrativetrace/opentelemetry` mais a API do OTel, que o pacote deixa por sua
conta (uma peer dependency, de modo que a versão do seu SDK prevalece):

```bash
npm add @narrativetrace/opentelemetry @opentelemetry/api
```

Há duas formas de entrar, e a diferença é *quando* um span existe:

| Modo | Exportação | Use quando |
|---|---|---|
| Ao vivo, enquanto os métodos executam | `createOtelEventConsumer({ tracer })` | Você quer spans no seu coletor mesmo que o processo morra no meio da requisição — esta página |
| Em lote, depois do fato | `new TraceSpanExporter(tracer).export(context.captureTrace().roots)` | Você já tem uma árvore de trace concluída e quer seus spans exportados de uma só vez |

Qualquer um recebe um `Tracer` — em um deploy, o do SDK que você já roda,
`trace.getTracer("orders")`. O consumidor ao vivo é composto no pipeline em
código; nada o descobre sozinho. O cenário abaixo entrega o tracer de um
provider em memória que nunca é registrado globalmente, o que também é a imagem
mais clara do que a ligação faz: um provider global vazaria de um teste para o
seguinte, e um exportador em memória não tem global no qual vazar
([Guia de integração de frameworks § OpenTelemetry](../guia-de-integracao-de-frameworks.md#8-opentelemetry)).

## O cenário

O pipeline é a única ideia nova: o consumidor de narração que você já tem, com o
consumidor do OTel ao lado dele no mesmo caminho ao vivo. O checkout em si é
encapsulado exatamente como em todas as outras páginas:

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

A execução constrói o provider em memória, roda o checkout e escreve os spans
exportados já ordenados, de modo que o dump de uma execução seja igual ao da
seguinte:

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

## A saída real

**As linhas de log**, inalteradas por tudo isto — a mesma narração que
[Adicione logs a este serviço](adicione-logs-a-este-servico.md) produz:

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

**Os spans que saíram da mesma execução**, como o exportador em memória os
recebeu — nome, pai e todos os atributos, ordenados:

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

## Como ler a saída

- **Quatro chamadas com trace, quatro spans, uma árvore.** Os spans chegam na
  ordem em que *terminaram* — o mais interno primeiro, a raiz por último, que é
  como qualquer pipeline de OTel enxerga uma árvore concluída. O parentesco não
  é inferido dessa ordem: o consumidor lê o id de span pai explícito de cada
  evento, e por isso `InventoryService.reserve`, `PaymentService.charge` e
  `OrderRepository.save` nomeiam todos `OrderService.placeOrder` como pai, mesmo
  tendo terminado antes dele.
- **O que cada span carrega.** `code.namespace` e `code.function` são a
  chamada; `narrative.param.<name>` é um atributo por parâmetro, tipado
  (`narrative.param.quantity: 2` é um número, não a string `"2"`);
  `narrative.outcome` é o valor retornado, e está ausente nas duas chamadas
  `void` porque não havia nada a retornar. `nt.trace_id` e `nt.traceName` são a
  identidade do trace própria do NarrativeTrace, levada como atributos para que
  um span no seu backend possa ser casado com a linha de log que descreve a
  mesma chamada — [Acompanhe uma requisição entre
  serviços](acompanhe-uma-requisicao-entre-servicos.md) é o mesmo id fazendo o
  mesmo trabalho através da fronteira de um processo. `nt.entryType`,
  `nt.schemaVersion`, `nt.storyId` e `nt.chapterId` marcam o esquema que esses
  atributos seguem e a história a que o span pertence.
- **Um parâmetro estruturado chega achatado.** `OrderRepository.save(order)` é
  um parâmetro, e foi exportado como `narrative.param.order.orderId`,
  `narrative.param.order.customerId`, `narrative.param.order.sku`,
  `narrative.param.order.quantity`, `narrative.param.order.amountCents` — campo
  a campo, porque foi assim que o valor foi renderizado: lendo o seu estado.
- **A ocultação alcança este caminho também.** Não há atributo
  `narrative.param.cardNumber` nem `narrative.param.card` em nenhum span acima —
  não um atributo contendo `[REDACTED]`, atributo nenhum. Um valor bloqueado é
  descartado na captura, antes de o evento existir, então nenhum consumidor, em
  nenhum dos dois caminhos, pode recebê-lo; o cenário afirma isso além da árvore
  de spans ([Mantenha os segredos fora dos logs](mantenha-os-segredos-fora-dos-logs.md)).
- **Qual configuração levou um evento a qual consumidor.** Três decisões, nesta
  ordem:
  1. O nível de tracing decide se um evento é criado. Em `summary`, estes mesmos
     quatro spans são exportados *sem* os atributos `narrative.param.*`, porque
     os valores dos parâmetros não são renderizados nesse nível; em `off` não há
     evento e, portanto, não há span — os outros dois testes do cenário afirmam
     ambos ([Trace em produção sem o custo](trace-em-producao-sem-o-custo.md)).
  2. O formato do pipeline decide quem vê o evento. Aqui um consumidor ao vivo —
     narração, depois exportação — roda inline, e o buffer ao lado dele mantém a
     retenção, que é o que `captureTrace()` e os arquivos de trace leem. Nada foi
     tirado do logger para alimentar o exportador.
  3. O nível do seu logger decide o que é *impresso*. Subir o nível do pino acima
     de `trace` esvazia o bloco de log acima e não muda nada nos spans.
- **Uma chamada que lança exceção exporta o span que falhou.** O segundo teste do
  cenário recusa o cartão: `PaymentService.charge` termina com status de erro e
  um evento `exception`, que é no que uma visão de erros no seu backend se
  baseia.
- **Por que isto não é um segundo lugar para olhar.** Os spans são seus, no seu
  coletor, sob o nome do seu serviço, ao lado dos spans que o seu framework já
  emite. O que o NarrativeTrace acrescenta é um span por *chamada de método com
  trace*, com os parâmetros e o resultado nele — um nível abaixo do span HTTP que
  você já tem.

## O que não é capturado

- **O que o seu stack faz com os spans é do seu stack.** Amostragem, retenção,
  indexação e se um atributo é pesquisável são decisões do coletor e do backend.
  Esta página mostra o que sai do processo; nenhuma afirmação é feita sobre a UI
  de qualquer fornecedor.
- **Os ids não são compartilhados.** O OpenTelemetry gera seus próprios ids de
  trace e de span para os spans que cria aqui (o cenário afirma que os quatro
  compartilham um id de trace do OTel, e que ele não é o do NarrativeTrace), e a
  identidade do NarrativeTrace vai junto como os atributos `nt.trace_id` /
  `nt.traceName`. A posição de um span na cascata do seu backend é do OTel;
  casá-lo com uma linha de log é trabalho do atributo.
- **Um span que nunca termina é limitado, não reparado.** O consumidor ao vivo
  cria um span enquanto o método executa, então um processo morto no meio da
  chamada deixa um aberto; o consumidor limita quantos ele guarda e por quanto
  tempo (`maxActiveSpans`, `spanTtlMs`). O exportador em lote só vê árvores
  concluídas.
- **O custo é um consumidor no caminho da chamada de quem chama.** Um consumidor
  composto no caminho ao vivo roda inline, então a criação do span está no
  caminho da chamada com trace. Essa é a troca pela durabilidade, e o pipeline a
  isola: um consumidor que lança exceção nunca quebra a chamada de negócio.
- **Só o que tem trace é exportado.** Não existe span para uma chamada que
  nenhuma integração interceptou — o caminho de exportação herda exatamente a
  fronteira do caminho de captura.

**A skill para isso:** `narrativetrace-doctor` — uma verificação de ligação por
integração de framework, e ela informa se algum destino realmente recebe o que
tem trace.
