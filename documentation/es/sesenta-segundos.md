<!-- source: documentation/sixty-seconds.md blob fd3478465b06 | translated: 2026-09-12 | reviewed: - -->
# Ve una traza en 60 segundos

[English](../sixty-seconds.md) | **Español** | [Português](../pt-BR/sessenta-segundos.md) | [简体中文](../zh-CN/60秒.md)

Sin sentencias de log, sin framework de pruebas, sin ningún fichero que abrir después. Un script
sencillo, una ejecución, y la traza aparece en tu terminal. Todo lo de abajo se ejecutó de verdad
contra los paquetes publicados `@narrativetrace/core-node` y `@narrativetrace/proxy` (0.1.1, la
versión que está en vivo en npm en el momento de escribir esto — ejecuta
`npm view @narrativetrace/core version` para ver cuál es la actual cuando tú lo leas) — la salida
está pegada tal cual, no es una ilustración. Necesitas Node 20+ (el paquete publicado
`@narrativetrace/core` lo declara en `engines`); abajo se usa pnpm, pero npm también funciona, con
una diferencia explicada en el paso 1.

## 1. Proyecto nuevo, añade los paquetes

```bash
mkdir narrativetrace-quickstart && cd narrativetrace-quickstart
pnpm init
pnpm add @narrativetrace/core-node @narrativetrace/proxy
```

`core-node` reexporta todo lo que hay en `@narrativetrace/core` y registra el generador de id de
Node. `@narrativetrace/core` solo también funciona — recurre directamente a Web Crypto cuando
está disponible — pero `core-node` es la vía probada y documentada. `pnpm init` escribe un
`package.json` con `"type": "module"`, así que la sintaxis `import` de abajo
funciona sin ninguna otra configuración. ¿Usas npm? `npm init -y` usa CommonJS por defecto —
ejecuta `npm pkg set type=module` justo después (antes de `npm add`), o el `import` del paso 2
fallará con `SyntaxError: Cannot use import statement outside a module`.

## 2. El programa

```js
// index.js
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```

`OrderService` es una clase corriente — sin interfaz, sin clase base, sin decorador
obligatorio. `traceObject()` envuelve la instancia concreta en un `Proxy` de ES; su tercer
argumento aporta los nombres de los parámetros de `placeOrder`, porque JavaScript no los conserva
en tiempo de ejecución. Llama al objeto envuelto en lugar de al original, y cada llamada que haga
queda registrada en `context`.

## 3. Ejecútalo

```bash
node index.js
```

Salida real, de la ejecución que produjo esta página:

```text
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 0.5849169999999901ms
```

El `Nms` final es tiempo de reloj — en tu máquina será un número distinto, y la próxima vez que lo
ejecutes será otro número distinto. Todo lo demás de la línea es determinista: el nombre de la
clase, el nombre del método, los nombres y valores de los parámetros, y el valor de retorno.

No escribiste ninguna sentencia de log. La narrativa vino del nombre de tu método, de los nombres
de tus parámetros y del valor que devolvió el método — la información ya estaba ahí.

## Qué acaba de pasar

- **Un contexto** (`new SyncNarrativeContext(new NarrativeTraceConfig())`) es el lugar donde se
  registran las llamadas — un objeto corriente, no un global, no un singleton. (El código de Node
  que atraviesa un `await` a lo largo de una petición necesita `AsyncNarrativeContext` en su
  lugar; consulta la [Guía de integración de frameworks](guia-de-integracion-de-frameworks.md).)
- **El envoltorio** (`traceObject(new OrderService(), context, {...})`) es la única línea que
  activa el trazado para ese objeto. Nada en `OrderService` cambió — sin import, sin clase base,
  sin anotación. Una clase de la que eres dueño puede usar los decoradores `@traced`/`@narrated`
  en lugar del mapa de nombres de parámetros; consulta la
  [Guía de decoradores](guia-de-decoradores.md).
- **Captura y luego renderiza** — `context.captureTrace()` toma una instantánea de lo que pasó en
  un árbol corriente; `renderMarkdownBody()` es uno de varios renderizadores sobre ese mismo
  árbol. `renderIndentedText()` dibuja un árbol ASCII en su lugar,
  `@narrativetrace/diagrams` lo convierte en un diagrama de secuencia Mermaid o PlantUML, y
  `renderToConsole()` de `@narrativetrace/browser` lo imprime con buen formato en la consola de
  DevTools del navegador.

## Envíalo a tu logger

La línea de consola de arriba es solo uno de los renderizadores sobre la traza; la misma traza
puede fluir directo al logger que ya usas en producción. Añade el puente de
[Pino](https://github.com/pinojs/pino) (`@narrativetrace/winston` funciona igual si Winston es tu
logger — cambia el import por `createWinstonEventConsumer`):

```diff
-import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
+import { NarrativeTraceConfig, SyncNarrativeContext, DualPathPipeline, BufferedEventConsumer, renderMarkdownBody } from "@narrativetrace/core-node";
 import { traceObject } from "@narrativetrace/proxy";
+import { createPinoEventConsumer } from "@narrativetrace/pino";
+import pino from "pino";

 class OrderService {
   placeOrder(customerId, productId, quantity) {
     return `ORD-${customerId}-${productId}-${quantity}`;
   }
 }

-const context = new SyncNarrativeContext(new NarrativeTraceConfig());
+const logger = pino();
+const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
+const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
+const context = new SyncNarrativeContext(new NarrativeTraceConfig(), undefined, pipeline);
 const service = traceObject(new OrderService(), context, {
   placeOrder: ["customerId", "productId", "quantity"],
 });

 service.placeOrder("C1", "P1", 2);
 console.log(renderMarkdownBody(context.captureTrace()));
```

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
node index.js
```

Salida real, de la ejecución que produjo esta página:

```text
{"level":30,"time":1789158304041,"pid":44606,"hostname":"Danijels-MacBook-Air.local","code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C1\""},{"name":"productId","value":"\"P1\""},{"name":"quantity","value":"2"}],"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 1.2094590000000096ms
{"level":30,"time":1789158304042,"pid":44606,"hostname":"Danijels-MacBook-Air.local","nt.outcome":"returned","nt.depth":0,"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C1-P1-2\"","msg":"← returned: \"ORD-C1-P1-2\""}
```

Igual que con el tiempo de arriba, cada campo específico de la ejecución (`time`, `pid`,
`hostname`, `trace_id`, `span_id`, `nt.traceName`) es un valor distinto en tu máquina y en cada
ejecución; la forma de las dos líneas JSON y de la línea markdown entre ellas no cambia. Esto
demuestra que la traza llega al destino que ya tienes, sin tocar la salida de consola.
Configuración completa (niveles por evento, el mixin de `LogContext` para marcar tus propias
líneas de log, configuración de Winston): [Guía de integración de frameworks § Winston y
Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## A continuación

| Quieres | Ve a |
|---|---|
| Usarlo en tus tests | [Guía de instalación § Opción B: plugin de Vitest](guia-de-instalacion.md#opción-b-plugin-de-vitest-contexto-automático--salida-de-trazas) |
| Mantener un valor fuera de la traza (ocultación) | [Privacidad y ocultación](privacidad-y-ocultacion.md) |
| Puntuar la claridad de tus nombres | [Guía de claridad](guia-de-claridad.md) |
| Cada opción de configuración | [Guía de configuración](guia-de-configuracion.md) |
| Algo de lo anterior no funcionó como se mostraba | [Solución de problemas](solucion-de-problemas.md) |
