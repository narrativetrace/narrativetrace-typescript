<!-- source: documentation/sixty-seconds.md blob bb2f0edb007e | translated: 2026-09-16 | reviewed: - -->
# Ve una traza en 60 segundos

[English](../sixty-seconds.md) | **Español** | [Português](../pt-BR/sessenta-segundos.md) | [简体中文](../zh-CN/60秒.md)

Sin sentencias de log, sin framework de pruebas, sin ningún fichero que abrir después. Un script
sencillo, una ejecución, y la traza aparece en tu terminal. Todo lo de abajo se ejecutó de verdad
contra los paquetes publicados `@narrativetrace/core-node` y `@narrativetrace/proxy` — la salida
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
logger — cambia el import por `createWinstonEventConsumer`). Las líneas comentadas de abajo son el
cambio respecto al paso 1:

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
```

```js
// index-with-logger.js
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  DualPathPipeline, // reparte los eventos entre dos consumidores: el puente de pino y el búfer en memoria
  BufferedEventConsumer, // mantiene captureTrace() funcionando junto al logger
  parseTraceparent, // convierte una cabecera traceparent en el id de traza fijado abajo
  renderMarkdownBody,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createPinoEventConsumer } from "@narrativetrace/pino"; // conecta los eventos de traza con Pino
import pino from "pino";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

// Una constante documentada solo para ESTE ejemplo — nunca el valor por defecto de la librería,
// que siempre genera un id de traza aleatorio — para que nt.traceName/trace_id de abajo se
// mantengan con la misma frase cada vez que se regenera la salida de esta página.
const FIXED_TRACEPARENT = "00-a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4-a1b2c3d4a1b2c3d4-01";
const fixedTraceId = parseTraceparent(FIXED_TRACEPARENT);

const logger = pino(); // cualquier instancia de pino funciona — esta mantiene sus valores por defecto
const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
const context = new SyncNarrativeContext(
  new NarrativeTraceConfig(),
  undefined, // parentResolver — un script sencillo no tiene ningún span padre ambiental que resolver
  pipeline, // enruta los eventos tanto al logger de arriba como al búfer que lee captureTrace()
  null, // rootParentOverride — sin span padre entrante para esta llamada raíz
  undefined, // serviceIdentity — no hace falta para este ejemplo
  fixedTraceId, // siembra el id de traza que llevaría una cabecera traceparent entrante en una petición real
);
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```

```bash
node index-with-logger.js
```

Salida real, de la ejecución que produjo esta página:

```text
{"level":30,"time":1789269258472,"pid":22805,"hostname":"9a9362dce156","code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C1\""},{"name":"productId","value":"\"P1\""},{"name":"quantity","value":"2"}],"trace_id":"a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4","nt.traceName":"loose hook parks","span_id":"5bbbf25ced9a35c4","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 1ms
{"level":30,"time":1789269258474,"pid":22805,"hostname":"9a9362dce156","nt.outcome":"returned","nt.depth":0,"trace_id":"a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4","nt.traceName":"loose hook parks","span_id":"5bbbf25ced9a35c4","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C1-P1-2\"","msg":"← returned: \"ORD-C1-P1-2\""}
```

`time`, `pid`, `hostname` y `span_id` están fijados a un valor de relleno para esta muestra
capturada — una ejecución real acuña los cuatro de nuevo, igual que la duración, y en tu máquina
verás valores distintos en cada ejecución. `trace_id` y `nt.traceName` son los únicos
identificadores que de verdad son iguales en cada ejecución, porque la constante
`FIXED_TRACEPARENT` hace las veces de una cabecera `traceparent` que enviaría una petición real
desde upstream; consulta la Guía de integración de frameworks para leer una desde una petición
real. Aquí no hay ningún campo `nt.runName` en absoluto — un script sencillo no pertenece a
ninguna ejecución de suite de tests, así que no hay ninguna ejecución que nombrar (la opción
`runName` de `createPinoEventConsumer` es cómo un caller que SÍ tiene una — `runIdentity().name`
de `@narrativetrace/vitest`, entre otros — la añade). Esto demuestra que la traza llega al destino
que ya tienes, sin tocar la salida de consola. Configuración completa (niveles por evento, la
opción `runName`, el mixin de `LogContext` para marcar tus propias líneas de log, configuración de
Winston): [Guía de integración de frameworks § Winston y
Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## A continuación

| Quieres | Ve a |
|---|---|
| Usarlo en tus tests | [Guía de instalación § Opción B: plugin de Vitest](guia-de-instalacion.md#opción-b-plugin-de-vitest-contexto-automático--salida-de-trazas) |
| Mantener un valor fuera de la traza (ocultación) | [Privacidad y ocultación](privacidad-y-ocultacion.md) |
| Puntuar la claridad de tus nombres | [Guía de claridad](guia-de-claridad.md) |
| Cada opción de configuración | [Guía de configuración](guia-de-configuracion.md) |
| Algo de lo anterior no funcionó como se mostraba | [Solución de problemas](solucion-de-problemas.md) |
