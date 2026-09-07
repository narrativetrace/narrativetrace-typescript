<!-- source: documentation/framework-integration-guide.md blob 6eb6ea48f177 | translated: 2026-09-03 | reviewed: - -->
# Guia de Integração de Frameworks do NarrativeTrace TypeScript

[English](../framework-integration-guide.md) | [Español](../es/guia-de-integracion-de-frameworks.md) | **Português** | [简体中文](../zh-CN/框架集成指南.md)

Este guia cobre a integração do NarrativeTrace em aplicações web e no navegador, desde o middleware do Express/Hono até a renderização no navegador e a propagação de contexto entre chamadas assíncronas.

## Pacotes

| Pacote | Finalidade |
|---|---|
| `@narrativetrace/core` | `SyncNarrativeContext`, `AsyncNarrativeContext` — contexto e renderizadores |
| `@narrativetrace/proxy` | `traceObject()` — interceptação de métodos baseada em ES Proxy |
| `@narrativetrace/browser` | `renderToConsole`, `postToCollector` — saída específica do navegador |
| `@narrativetrace/nestjs` | `AutoProxyModule`, `NoAutoProxy`, `NarrativeStorage` — módulo de auto-proxy para NestJS |
| `@narrativetrace/react` | `NarrativeTraceProvider`, `useTraced`, `useTraceCapture` — hooks e provider do React |
| `@narrativetrace/react-router` | `useNavigationCapture` — captura de trace por navegação |
| `@narrativetrace/opentelemetry` | `createOtelEventConsumer`, `TraceSpanExporter` — ponte de spans para OTel |
| `@narrativetrace/winston` | `createWinstonEventConsumer`, `createWinstonFormat` — ponte de logs para o Winston |
| `@narrativetrace/pino` | `createPinoEventConsumer`, `createPinoMixin` — ponte de logs para o Pino |

## 1. Middleware do Express

Tracing por requisição usando `AsyncNarrativeContext` (que encapsula `AsyncLocalStorage`):

```ts
import express from "express";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

// Middleware: cria um contexto de trace isolado por requisição
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Cada etapa de limpeza é best-effort de forma independente — uma exportação que lança
      // não pode pular o reset. Sem isso, os spans desta requisição permanecem no pipeline
      // compartilhado durante toda a vida do processo (o middleware `narrativeTrace()` embutido,
      // §1 logo abaixo do seu "Como funciona", faz isso por você).
      asyncContext.reset();
    });
    next();
  });
});

// Manipulador de rota: aplica trace às chamadas de serviço
app.get("/api/orders/:id", (req, res) => {
  const orderService = traceObject(new DefaultOrderService(/* deps */), asyncContext);
  const result = orderService.placeOrder(req.params.id, "P1", 2);
  res.json(result);
});

app.listen(3000);
```

### Como funciona

1. `AsyncNarrativeContext.run()` cria um novo `SyncNarrativeContext` dentro de `AsyncLocalStorage` para cada requisição
2. Todas as chamadas traceadas dentro da requisição compartilham o mesmo contexto isolado
3. Ao finalizar a resposta, o trace é capturado, renderizado e o contexto é resetado
4. Requisições concorrentes têm traces completamente isolados

### Exportação de trace personalizada

Substitua o handler `res.on("finish")` pelo seu próprio exportador — captura, exportação e reset
permanecem independentes entre si, então um exportador que falha ainda assim reseta:

```ts
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      try {
        const tree = asyncContext.captureTrace();
        if (!tree.isEmpty) {
          // Exporta como JSON para a sua plataforma de observabilidade
          const json = exportJson(tree, {
            scenario: `${req.method} ${req.path}`,
          });
          sendToCollector(json);
        }
      } finally {
        asyncContext.reset();
      }
    });
    next();
  });
});
```

## 2. Middleware do Hono

Mesmo padrão do Express, usando a API de middleware do Hono:

```ts
import { Hono } from "hono";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = new Hono();

// Middleware: contexto de trace por requisição
app.use("*", async (c, next) => {
  await asyncContext.run(async () => {
    try {
      await next();
    } finally {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Reseta mesmo que a captura/exportação acima lance uma exceção — um contexto com escopo de
      // requisição deixado sem reset vaza seus spans para o pipeline compartilhado durante toda a
      // vida do processo.
      asyncContext.reset();
    }
  });
});

app.get("/api/orders/:id", (c) => {
  const orderService = traceObject(new DefaultOrderService(/* deps */), asyncContext);
  const result = orderService.placeOrder(c.req.param("id"), "P1", 2);
  return c.json(result);
});

export default app;
```

## 3. Navegador

O pacote `@narrativetrace/browser` fornece dois mecanismos de saída para ambientes de navegador.
No navegador, importe a API principal de `@narrativetrace/core-web`: ela reexporta
`@narrativetrace/core` e registra o gerador de ids do Web Crypto. Importar `@narrativetrace/core`
diretamente não deixa nenhum gerador registrado, e a primeira chamada traceada lança uma exceção.

### Renderização no console

Renderiza a árvore de trace usando `console.group()` e `console.log()` para uma saída hierárquica no DevTools:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
renderToConsole(context.captureTrace());
```

### Exportação via rede

Envie a árvore de trace via POST como JSON (o documento `exportJson`) para um endpoint coletor. A
promise resolve com o `Response` para qualquer status HTTP e só rejeita em caso de falha de rede —
portanto, verifique `response.ok`:

```ts
import { postToCollector } from "@narrativetrace/browser";

const tree = context.captureTrace();
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
if (!response.ok) console.warn(`collector rejected the trace: HTTP ${response.status}`);
```

Uma página completa que faz tudo isso — trace ao clicar, renderização na página, espelhamento para o
console, POST para um coletor de desenvolvimento — está em `examples/browser` (`pnpm run example:browser`).

### Sem bundler: páginas com `<script>` simples

Os pacotes regulares se importam mutuamente por bare specifier (`"@narrativetrace/core"`), algo que um
navegador não consegue resolver sozinho. Para páginas sem bundler use `@narrativetrace/standalone`:
um único arquivo com `core-web` + `proxy` + `browser` empacotados, como um script clássico
(`dist/narrativetrace.global.js` → `window.NarrativeTrace`) ou um módulo ES
(`dist/narrativetrace.js`). Executável: `examples/script-tag` (`pnpm run example:script-tag`).

### Limitações do navegador

O contexto principal, o ES Proxy e a renderização de valores são JavaScript puro, sem nenhuma dependência do Node. O que muda no navegador:

| Recurso | Navegador | Node |
|---------|---------|------|
| Contexto | `SyncNarrativeContext` | `SyncNarrativeContext` ou `AsyncNarrativeContext` |
| Propagação assíncrona | Manual via `snapshot()` | `AsyncLocalStorage` via `AsyncNarrativeContext` |
| Timing | `performance.now()` | `performance.now()` |
| Saída em arquivo | Não disponível | `writeTraceOutput()` |
| Saída no console | `renderToConsole()` | `renderIndentedText()` / `console.log()` |
| Gerador de id | `@narrativetrace/core-web` (Web Crypto) | `@narrativetrace/core-node` (`node:crypto`) |
| Saída via rede | `postToCollector()` | Personalizada (fetch/axios) |

### Propagação assíncrona manual no navegador

Sem `AsyncLocalStorage`, propague o contexto manualmente:

```ts
const snapshot = context.snapshot();
const worker = new SyncNarrativeContext(config);

// Encapsula callbacks assíncronos
someAsyncApi.onComplete(() => {
  snapshot.wrapFn(worker, () => {
    // As chamadas traceadas aqui entram no trace do contexto que tirou o snapshot, e são
    // reportadas pelo captureTrace() dele a partir do momento em que são publicadas — não
    // apenas quando o callback retorna.
    tracedService.processResult();
  });
});
```

## 4. AsyncNarrativeContext

`AsyncNarrativeContext` encapsula o `AsyncLocalStorage` do Node para fornecer isolamento de trace por requisição:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

// Cada run() cria um SyncNarrativeContext isolado
asyncContext.run(() => {
  // Todas as chamadas de trace aqui são isoladas
  tracedService.placeOrder("C1", "P1", 2);
  const tree = asyncContext.captureTrace(); // apenas os eventos deste run
});
```

### Como funciona

- `run(fn)` — cria um novo `SyncNarrativeContext` dentro de `AsyncLocalStorage` e executa `fn`
- Todas as chamadas `enterMethod`/`exitMethodWithReturn`/`exitMethodWithException` delegam para o store atual
- `captureTrace()` retorna apenas a árvore de trace do store atual
- Se chamado fora de um `run()`, delega para um contexto padrão

### Isolamento de requisições concorrentes

```ts
// A requisição 1 e a requisição 2 são executadas concorrentemente
asyncContext.run(() => {
  // Os traces da requisição 1 estão isolados
  tracedService.handleOrder("order-1");
});

asyncContext.run(() => {
  // Os traces da requisição 2 estão isolados
  tracedService.handleOrder("order-2");
});
```

## 5. Integração manual (SyncNarrativeContext)

Para controle manual completo, sem middleware:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

// Aplica trace aos serviços
const orderService = traceObject(new DefaultOrderService(/* deps */), context);

// Executa a lógica de negócio
orderService.placeOrder("C1", "P1", 2);

// Captura e renderiza
const tree = context.captureTrace();
console.log(renderIndentedText(tree));

// Reseta para a próxima operação
context.reset();
```

### ContextSnapshot (propagação entre limites)

A propagação funciona nos dois sentidos. O snapshot carrega o trace id, o span de lançamento e os
metadados da requisição *para dentro* do trabalho assíncrono, e o trabalho traceado ali **volta**: o
contexto que tirou o snapshot o reporta — a partir do momento em que uma chamada é publicada, não
apenas quando o escopo se fecha.

```ts
const snapshot = context.snapshot();

// Ativa em outro escopo de contexto
const scope = snapshot.activate(otherContext);
try {
  tracedService.processOrder("order-1");
} finally {
  scope.close(); // devolve o trabalho para `context`, e então encerra o registro ativo
}

// Ou use o wrapper de conveniência
snapshot.wrapFn(otherContext, () => {
  tracedService.processOrder("order-1");
});

// Desative a adoção quando você mesmo publica os filhos — é o que ForkJoinGroup e FireAndForgetGroup fazem.
// Não registra nada nem devolve nada, em nenhum salto.
const detached = snapshot.activateWithoutAdoption(otherContext);
```

O posicionamento segue o momento do **submit**: um snapshot tirado enquanto a chamada de
lançamento ainda está aberta torna o trabalho um filho dessa chamada; tirado depois que ela
retornou, o trabalho é a próxima raiz do mesmo trace. O primeiro span aberto sob um snapshot
ativado é marcado com `concurrency.kind === "async"`.

A adoção é limitada — 10.000 spans por contexto, um lote que ultrapassaria esse limite é recusado
**por inteiro** em vez de deixar filhos órfãos cujo pai ficou de fora — e as recusas são
contabilizadas em `context.traceLoss()`, junto com os próprios descartes do buffer de captura.

## 6. NestJS

O pacote `@narrativetrace/nestjs` fornece o `AutoProxyModule`, que aplica auto-proxy a cada provider para que as chamadas de serviço sejam capturadas sem tocar no seu código de negócio. Ele executa um contexto por requisição e dispara um hook de conclusão carregando a árvore de trace capturada.

```ts
import { AutoProxyModule, NoAutoProxy } from "@narrativetrace/nestjs";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "orders-api",
      level: "detail",
      // Um pipeline de verdade (por exemplo, conectado a pino/winston/otel) — sem ele, os traces
      // são capturados mas não exportados.
      pipeline,
      // Providers a deixar sem trace.
      exclude: [HealthController],
      // Dispara após cada requisição com a árvore capturada, o status HTTP e a duração.
      onRequestComplete: (ctx, { statusCode, durationMs, tree }) => {
        console.log(statusCode, durationMs, tree);
      },
    }),
  ],
  providers: [OrderService],
})
export class AppModule {}

// Exclui um único provider do auto-proxy:
@NoAutoProxy()
export class LegacyService {}
```

### Como funciona

- `AutoProxyModule` é um módulo global: ele encapsula os providers registrados em proxies `traceObject()` e abre um novo contexto por requisição.
- Ele exporta `NarrativeStorage`, o mantenedor do contexto por requisição — injete-o onde você precisar de acesso direto ao contexto atual.
- `@NoAutoProxy()` marca um provider individual para ser ignorado pela passagem de auto-proxy.
- Após cada requisição, `onRequestComplete(ctx, { statusCode, durationMs, tree })` dispara com a `tree` capturada, permitindo que você renderize, exporte ou encaminhe a narrativa. Uma requisição capturada produz uma única árvore de trace abrangendo todas as chamadas de serviço proxeadas feitas durante o tratamento dessa requisição.

## 7. React & React Router

O pacote `@narrativetrace/react` captura traces de componentes e serviços a partir dos nomes dos seus métodos e parâmetros — sem boilerplate de logging nos componentes. Envolva a árvore em `NarrativeTraceProvider`, aplique trace a um serviço com `useTraced`, e extraia a árvore capturada com `useTraceCapture`:

```tsx
import {
  NarrativeTraceProvider,
  useTraced,
  useTraceCapture,
} from "@narrativetrace/react";
import { CheckoutService } from "./checkout-service";

function Checkout() {
  const checkout = useTraced(() => new CheckoutService(), "CheckoutService");
  const { captureAndReset } = useTraceCapture();

  function onPlaceOrder() {
    checkout.placeOrder("C1", "P1", 2);
    const tree = captureAndReset();
    console.log(tree.roots);
  }

  return <button onClick={onPlaceOrder}>Place order</button>;
}

export function App() {
  return (
    <NarrativeTraceProvider level="detail">
      <Checkout />
    </NarrativeTraceProvider>
  );
}
```

`useNarrativeTrace()` retorna o contexto bruto, e `useTracedFetch()` retorna um `fetch` que estampa `traceparent` nas requisições de saída.

### Captura de navegação do React Router

O pacote `@narrativetrace/react-router` captura uma nova árvore de trace a cada navegação, de modo que cada mudança de rota gera um trace autocontido. Renderize um componente dentro do seu router que chama `useNavigationCapture` — a cada mudança de pathname ele captura o trace acumulado, entrega-o ao seu callback e reseta o contexto:

```tsx
import { NarrativeTraceProvider } from "@narrativetrace/react";
import { useNavigationCapture } from "@narrativetrace/react-router";
import type { TraceTree } from "@narrativetrace/core";
import { BrowserRouter } from "react-router-dom";

function NavigationTracer() {
  useNavigationCapture((tree: TraceTree) => {
    console.log("captured on navigation", tree.roots);
  });
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <NarrativeTraceProvider>
        <NavigationTracer />
        {/* routes */}
      </NarrativeTraceProvider>
    </BrowserRouter>
  );
}
```

O callback é opcional — omita-o para simplesmente resetar o trace a cada navegação. `useNavigationCapture` precisa ser usado dentro de um `NarrativeTraceProvider` e de um contexto do React Router, ambos ao mesmo tempo.

## 8. OpenTelemetry

O pacote `@narrativetrace/opentelemetry` mapeia narrativas de chamadas de método para spans do OTel, de modo que visualizações existentes no Jaeger/Tempo/Datadog passam a funcionar sem spans instrumentados manualmente. `createOtelEventConsumer` é a ponte ao vivo — ela inicia/encerra spans conforme os métodos são executados, aninhando spans filhos sob seus pais. Conecte-a a um pipeline:

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("orders");
const consumer = createOtelEventConsumer({ tracer, maxActiveSpans: 1024 });

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para exportação posterior, `TraceSpanExporter` transforma uma árvore de `TraceNode` capturada em spans aninhados em uma única passagem:

```ts
import { TraceSpanExporter } from "@narrativetrace/opentelemetry";

new TraceSpanExporter(tracer).export(roots);
```

### Vocabulário de atributos

Cada span é estampado com `nt.trace_id` e outros atributos de schema `nt.*` (identidade do trace, profundidade, concorrência, nível), além de valores tipados `narrative.param.<name>` para os parâmetros de método. Os mapeadores de atributos de span — `setSpanAttributes`, `setNtSchemaAttributes`, `setOutcomeAttributes`, `buildEventAttributes` e afins — são exportados para a construção de exportadores personalizados.

## 9. Winston & Pino

Os pacotes `@narrativetrace/winston` e `@narrativetrace/pino` transmitem eventos de chamada de método para o seu logger como linhas estruturadas por evento (`→ Class.method` na entrada, `← returned: …` / `!! Error` na saída) carregando `code.*`, `trace_id`, `service.*`, `nt.depth` e parâmetros tipados.

### Winston

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createWinstonEventConsumer } from "@narrativetrace/winston";
import winston from "winston";

const logger = winston.createLogger({ format: winston.format.json() });

// Entrada/retorno usam `debug` por padrão, exceções usam `warn` — sobrescreva por evento.
const consumer = createWinstonEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para estampar a identidade do trace ativo nas suas *próprias* chamadas `logger.*`, adicione `createWinstonFormat()` à cadeia de formatação do logger — ele mescla o `LogContext` atual (`trace_id`, `service.*`, `nt.depth`) em cada linha.

### Pino

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

const logger = pino();

// Entrada/retorno usam `trace` por padrão (o pino tem um nível TRACE de verdade), exceções usam `warn`.
const consumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para estampar a identidade do trace ativo nas suas *próprias* chamadas `logger.*`, passe `createPinoMixin()` como o `mixin` do logger — ele mescla o `LogContext` atual (`trace_id`, `service.*`, `nt.depth`) em cada linha.

### Níveis por evento

Ambos os consumers aceitam um mapa `levels` indexado pelo tipo de evento (`enter`, `return`, `exception`), permitindo elevar o ruído de entrada/retorno para `info` ou direcionar exceções para `error` de forma independente. O Winston usa `debug`/`debug`/`warn` por padrão; o Pino usa `trace`/`trace`/`warn` por padrão.

## Veja também

- [Guia de instalação](guia-de-instalacao.md) — dependências, caminhos de integração, seleção de módulos
- [Guia de configuração](guia-de-configuracao.md) — níveis de tracing, opções de renderização
- [Guia de decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
