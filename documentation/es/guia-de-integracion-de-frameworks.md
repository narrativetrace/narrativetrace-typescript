<!-- source: documentation/framework-integration-guide.md blob 6eb6ea48f177 | translated: 2026-09-03 | reviewed: - -->
# Guía de integración de frameworks de NarrativeTrace TypeScript

[English](../framework-integration-guide.md) | **Español** | [Português](../pt-BR/guia-de-integracao-de-frameworks.md) | [简体中文](../zh-CN/框架集成指南.md)

Esta guía cubre la integración de NarrativeTrace en aplicaciones web y en el navegador, desde el middleware de Express/Hono hasta el renderizado en el navegador y la propagación de contexto entre operaciones asíncronas.

## Paquetes

| Paquete | Propósito |
|---|---|
| `@narrativetrace/core` | `SyncNarrativeContext`, `AsyncNarrativeContext` — contexto y renderizadores |
| `@narrativetrace/proxy` | `traceObject()` — interceptación de métodos basada en ES Proxy |
| `@narrativetrace/browser` | `renderToConsole`, `postToCollector` — salida específica del navegador |
| `@narrativetrace/nestjs` | `AutoProxyModule`, `NoAutoProxy`, `NarrativeStorage` — módulo de auto-proxy para NestJS |
| `@narrativetrace/react` | `NarrativeTraceProvider`, `useTraced`, `useTraceCapture` — hooks y proveedor de React |
| `@narrativetrace/react-router` | `useNavigationCapture` — captura de trazas por cada navegación |
| `@narrativetrace/opentelemetry` | `createOtelEventConsumer`, `TraceSpanExporter` — puente de spans de OTel |
| `@narrativetrace/winston` | `createWinstonEventConsumer`, `createWinstonFormat` — puente de logs de Winston |
| `@narrativetrace/pino` | `createPinoEventConsumer`, `createPinoMixin` — puente de logs de Pino |

## 1. Middleware de Express

Trazado por petición usando `AsyncNarrativeContext` (envuelve `AsyncLocalStorage`):

```ts
import express from "express";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

// Middleware: crea un contexto de traza aislado por cada petición
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Cada paso de limpieza es best-effort de forma independiente — una exportación que lanza no
      // debe omitir el reset. Sin él, los spans de esta petición permanecen en la tubería compartida
      // durante toda la vida del proceso (el middleware `narrativeTrace()` incluido, §1 debajo de su
      // «Cómo funciona», hace esto por ti).
      asyncContext.reset();
    });
    next();
  });
});

// Manejador de ruta: traza llamadas a servicios
app.get("/api/orders/:id", (req, res) => {
  const orderService = traceObject(new DefaultOrderService(/* deps */), asyncContext);
  const result = orderService.placeOrder(req.params.id, "P1", 2);
  res.json(result);
});

app.listen(3000);
```

### Cómo funciona

1. `AsyncNarrativeContext.run()` crea un nuevo `SyncNarrativeContext` dentro de `AsyncLocalStorage` para cada petición
2. Todas las llamadas trazadas dentro de la petición comparten el mismo contexto aislado
3. Al finalizar la respuesta, la traza se captura, se renderiza y el contexto se reinicia
4. Las peticiones concurrentes tienen trazas completamente aisladas

### Exportación de trazas personalizada

Sustituye el manejador `res.on("finish")` por tu propio exportador — la captura, la exportación y el
reset siguen siendo independientes, así que un exportador que falla igual reinicia el contexto:

```ts
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      try {
        const tree = asyncContext.captureTrace();
        if (!tree.isEmpty) {
          // Exporta como JSON a tu plataforma de observabilidad
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

## 2. Middleware de Hono

El mismo patrón que Express, usando la API de middleware de Hono:

```ts
import { Hono } from "hono";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = new Hono();

// Middleware: contexto de traza por petición
app.use("*", async (c, next) => {
  await asyncContext.run(async () => {
    try {
      await next();
    } finally {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Reinicia incluso si la captura/exportación anterior lanza — un contexto de ámbito de
      // petición que queda sin reset filtra sus spans a la tubería compartida durante toda la vida
      // del proceso.
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

El paquete `@narrativetrace/browser` ofrece dos mecanismos de salida para entornos de navegador.
En el navegador, importa la API del core desde `@narrativetrace/core-web`: reexporta
`@narrativetrace/core` y registra el generador de ids de Web Crypto. Importar `@narrativetrace/core`
directamente no deja ningún generador registrado, y la primera llamada trazada lanza una excepción.

### Renderizado en consola

Renderiza el árbol de traza usando `console.group()` y `console.log()` para obtener una salida
jerárquica en DevTools:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
renderToConsole(context.captureTrace());
```

### Exportación por red

Envía el árbol de traza mediante POST como JSON (el documento `exportJson`) a un endpoint recolector.
La promesa se resuelve con el `Response` para cualquier estado HTTP y solo se rechaza ante un fallo
de red, así que comprueba `response.ok`:

```ts
import { postToCollector } from "@narrativetrace/browser";

const tree = context.captureTrace();
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
if (!response.ok) console.warn(`collector rejected the trace: HTTP ${response.status}`);
```

Una página completa que hace todo lo anterior — traza al hacer clic, renderiza en la página, refleja
en la consola y hace POST a un recolector de desarrollo — es `examples/browser`
(`pnpm run example:browser`).

### Sin bundler: páginas con `<script>` simple

Los paquetes normales se importan entre sí mediante un especificador desnudo
(`"@narrativetrace/core"`), que un navegador no puede resolver por sí solo. Para páginas sin bundler
usa `@narrativetrace/standalone`: un único archivo con `core-web` + `proxy` + `browser`
empaquetados, ya sea como script clásico (`dist/narrativetrace.global.js` →
`window.NarrativeTrace`) o como módulo ES (`dist/narrativetrace.js`). Ejecutable:
`examples/script-tag` (`pnpm run example:script-tag`).

### Limitaciones en el navegador

El contexto core, ES Proxy y el renderizado de valores son JavaScript puro sin dependencias de Node. Lo que cambia en el navegador:

| Característica | Navegador | Node |
|---------|---------|------|
| Contexto | `SyncNarrativeContext` | `SyncNarrativeContext` o `AsyncNarrativeContext` |
| Propagación asíncrona | Manual mediante `snapshot()` | `AsyncLocalStorage` mediante `AsyncNarrativeContext` |
| Medición de tiempo | `performance.now()` | `performance.now()` |
| Salida a archivo | No disponible | `writeTraceOutput()` |
| Salida en consola | `renderToConsole()` | `renderIndentedText()` / `console.log()` |
| Generador de ids | `@narrativetrace/core-web` (Web Crypto) | `@narrativetrace/core-node` (`node:crypto`) |
| Salida por red | `postToCollector()` | Personalizada (fetch/axios) |

### Propagación asíncrona manual en el navegador

Sin `AsyncLocalStorage`, propaga el contexto manualmente:

```ts
const snapshot = context.snapshot();
const worker = new SyncNarrativeContext(config);

// Envuelve callbacks asíncronos
someAsyncApi.onComplete(() => {
  snapshot.wrapFn(worker, () => {
    // Las llamadas trazadas aquí se unen a la traza del contexto que tomó el snapshot, y son
    // reportadas por su captureTrace() desde el momento en que se publican — no solo cuando el
    // callback termina.
    tracedService.processResult();
  });
});
```

## 4. AsyncNarrativeContext

`AsyncNarrativeContext` envuelve `AsyncLocalStorage` de Node para ofrecer aislamiento de trazas por petición:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

// Cada run() crea un SyncNarrativeContext aislado
asyncContext.run(() => {
  // Todas las llamadas de traza aquí están aisladas
  tracedService.placeOrder("C1", "P1", 2);
  const tree = asyncContext.captureTrace(); // solo los eventos de este run
});
```

### Cómo funciona

- `run(fn)` — crea un nuevo `SyncNarrativeContext` dentro de `AsyncLocalStorage` y ejecuta `fn`
- Todas las llamadas a `enterMethod`/`exitMethodWithReturn`/`exitMethodWithException` delegan en el store actual
- `captureTrace()` devuelve únicamente el árbol de traza del store actual
- Si se llama fuera de un `run()`, delega en un contexto por defecto

### Aislamiento de peticiones concurrentes

```ts
// La petición 1 y la petición 2 se ejecutan de forma concurrente
asyncContext.run(() => {
  // Las trazas de la petición 1 están aisladas
  tracedService.handleOrder("order-1");
});

asyncContext.run(() => {
  // Las trazas de la petición 2 están aisladas
  tracedService.handleOrder("order-2");
});
```

## 5. Integración manual (SyncNarrativeContext)

Para tener control manual total sin middleware:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

// Traza servicios
const orderService = traceObject(new DefaultOrderService(/* deps */), context);

// Ejecuta la lógica de negocio
orderService.placeOrder("C1", "P1", 2);

// Captura y renderiza
const tree = context.captureTrace();
console.log(renderIndentedText(tree));

// Reinicia para la siguiente operación
context.reset();
```

### ContextSnapshot (propagación entre límites)

La propagación funciona en ambas direcciones. El snapshot lleva el id de traza, el span que lanza la
operación y los metadatos de la petición *hacia* el trabajo asíncrono, y el trabajo trazado allí
**regresa**: el contexto que tomó el snapshot lo reporta — desde el momento en que se publica una
llamada, no solo cuando el ámbito se cierra.

```ts
const snapshot = context.snapshot();

// Activa en el ámbito de otro contexto
const scope = snapshot.activate(otherContext);
try {
  tracedService.processOrder("order-1");
} finally {
  scope.close(); // devuelve el trabajo a `context`, y luego termina el registro activo
}

// O usa el envoltorio de conveniencia
snapshot.wrapFn(otherContext, () => {
  tracedService.processOrder("order-1");
});

// Excluir cuando publicas los hijos tú mismo — lo que hacen ForkJoinGroup y FireAndForgetGroup.
// No registra nada ni entrega nada, en cada salto.
const detached = snapshot.activateWithoutAdoption(otherContext);
```

La ubicación sigue el momento de **envío** (submit): un snapshot tomado mientras la llamada que lo
lanza sigue abierta convierte el trabajo en hijo de esa llamada; tomado después de que esta retornó,
el trabajo pasa a ser la siguiente raíz de la misma traza. El primer span abierto bajo un snapshot
activado se etiqueta con `concurrency.kind === "async"`.

La adopción está acotada — 10.000 spans por contexto, un lote que superaría el límite se rechaza
**por completo** en lugar de dejar varados a hijos cuyo padre quedó fuera — y los rechazos se cuentan
en `context.traceLoss()` junto con las propias pérdidas del buffer de captura.

## 6. NestJS

El paquete `@narrativetrace/nestjs` ofrece `AutoProxyModule`, que aplica auto-proxy a cada provider para que las llamadas a servicios se capturen sin tocar tu código de negocio. Ejecuta un contexto por petición y dispara un hook de finalización que lleva el árbol de traza capturado.

```ts
import { AutoProxyModule, NoAutoProxy } from "@narrativetrace/nestjs";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "orders-api",
      level: "detail",
      // Una tubería real (p. ej. conectada a pino/winston/otel) — sin ella, las trazas
      // se capturan pero no se exportan.
      pipeline,
      // Providers que se dejan sin trazar.
      exclude: [HealthController],
      // Se dispara después de cada petición con el árbol capturado, el estado HTTP y la duración.
      onRequestComplete: (ctx, { statusCode, durationMs, tree }) => {
        console.log(statusCode, durationMs, tree);
      },
    }),
  ],
  providers: [OrderService],
})
export class AppModule {}

// Excluye un único provider del auto-proxy:
@NoAutoProxy()
export class LegacyService {}
```

### Cómo funciona

- `AutoProxyModule` es un módulo global: envuelve los providers registrados en proxies de `traceObject()` y abre un contexto nuevo por cada petición.
- Exporta `NarrativeStorage`, el contenedor del contexto por petición — inyéctalo donde necesites acceso directo al contexto actual.
- `@NoAutoProxy()` marca un provider individual para que el paso de auto-proxy lo omita.
- Después de cada petición, `onRequestComplete(ctx, { statusCode, durationMs, tree })` se dispara con el `tree` capturado, permitiéndote renderizar, exportar o reenviar la narrativa. Una petición capturada produce un único árbol de traza que abarca todas las llamadas a servicios proxeados realizadas mientras se manejaba esa petición.

## 7. React y React Router

El paquete `@narrativetrace/react` captura trazas de componentes y servicios a partir de los nombres de tus métodos y parámetros — sin código repetitivo de logging en los componentes. Envuelve el árbol en `NarrativeTraceProvider`, traza un servicio con `useTraced`, y extrae el árbol capturado con `useTraceCapture`:

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

`useNarrativeTrace()` devuelve el contexto en bruto, y `useTracedFetch()` devuelve un `fetch` que estampa `traceparent` en las peticiones salientes.

### Captura de navegación de React Router

El paquete `@narrativetrace/react-router` captura un árbol de traza nuevo en cada navegación, de modo que cada cambio de ruta produce una traza autocontenida. Renderiza un componente dentro de tu router que llame a `useNavigationCapture` — cada vez que cambia el pathname captura la traza acumulada, se la entrega a tu callback y reinicia el contexto:

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
        {/* rutas */}
      </NarrativeTraceProvider>
    </BrowserRouter>
  );
}
```

El callback es opcional — omítelo para simplemente reiniciar la traza en cada navegación. `useNavigationCapture` debe usarse dentro de un `NarrativeTraceProvider` y de un contexto de React Router.

## 8. OpenTelemetry

El paquete `@narrativetrace/opentelemetry` mapea las narrativas de llamadas a métodos sobre spans de OTel, de modo que las vistas existentes de Jaeger/Tempo/Datadog se activan sin spans instrumentados a mano. `createOtelEventConsumer` es el puente en vivo — inicia/termina spans a medida que se ejecutan los métodos, anidando spans hijos bajo su padre. Conéctalo a una tubería:

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("orders");
const consumer = createOtelEventConsumer({ tracer, maxActiveSpans: 1024 });

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para exportación posterior, `TraceSpanExporter` convierte un árbol `TraceNode` capturado en spans anidados en una sola pasada:

```ts
import { TraceSpanExporter } from "@narrativetrace/opentelemetry";

new TraceSpanExporter(tracer).export(roots);
```

### Vocabulario de atributos

Cada span se estampa con `nt.trace_id` y otros atributos de esquema `nt.*` (identidad de traza, profundidad, concurrencia, nivel), además de valores tipados `narrative.param.<name>` para los parámetros de método. Los mappers de atributos de span — `setSpanAttributes`, `setNtSchemaAttributes`, `setOutcomeAttributes`, `buildEventAttributes`, y afines — se exportan para construir exportadores personalizados.

## 9. Winston y Pino

Los paquetes `@narrativetrace/winston` y `@narrativetrace/pino` transmiten eventos de llamadas a métodos a tu logger como líneas estructuradas por evento (`→ Class.method` al entrar, `← returned: …` / `!! Error` al salir) que llevan `code.*`, `trace_id`, `service.*`, `nt.depth`, y parámetros tipados.

### Winston

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createWinstonEventConsumer } from "@narrativetrace/winston";
import winston from "winston";

const logger = winston.createLogger({ format: winston.format.json() });

// Entrada/retorno usan `debug` por defecto, las excepciones `warn` — sobrescribible por evento.
const consumer = createWinstonEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para estampar la identidad de traza activa en tus *propias* llamadas a `logger.*`, añade `createWinstonFormat()` a la cadena de formato del logger — combina el `LogContext` actual (`trace_id`, `service.*`, `nt.depth`) en cada línea.

### Pino

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

const logger = pino();

// Entrada/retorno usan `trace` por defecto (pino tiene un nivel TRACE real), las excepciones `warn`.
const consumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

Para estampar la identidad de traza activa en tus *propias* llamadas a `logger.*`, pasa `createPinoMixin()` como el `mixin` del logger — combina el `LogContext` actual (`trace_id`, `service.*`, `nt.depth`) en cada línea.

### Niveles por evento

Ambos consumidores aceptan un mapa `levels` indexado por tipo de evento (`enter`, `return`, `exception`), de modo que puedes elevar el ruido de entrada/retorno a `info` o llevar las excepciones a `error` de forma independiente. Winston usa por defecto `debug`/`debug`/`warn`; Pino usa por defecto `trace`/`trace`/`warn`.

## Ver también

- [Guía de instalación](guia-de-instalacion.md) — dependencias, rutas de integración, selección de módulos
- [Guía de configuración](guia-de-configuracion.md) — niveles de trazado, opciones de renderizado
- [Guía de decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
