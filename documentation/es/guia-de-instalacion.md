<!-- source: documentation/installation-guide.md blob 888db3e4a9fb | translated: 2026-09-12 | reviewed: - -->
# Guía de instalación de NarrativeTrace TypeScript

[English](../installation-guide.md) | **Español** | [Português](../pt-BR/guia-de-instalacao.md) | [简体中文](../zh-CN/安装指南.md)

Esta guía cubre la instalación y el cableado de NarrativeTrace TypeScript en un proyecto de Node.js o del navegador.

## Requisitos previos

- Node.js 20+
- pnpm (o npm/yarn)

## Inicio rápido

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node (usa @narrativetrace/core-web en el navegador)
```

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
```

## 1. Añade las dependencias

Empieza con el stack mínimo y luego añade solo las integraciones que necesites.

```bash
# Mínimo — elige el punto de entrada de la plataforma para tu runtime
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node
pnpm add @narrativetrace/core-web @narrativetrace/proxy    # Navegador / Web Worker

# `core-node` y `core-web` reexportan todo lo de `@narrativetrace/core` y registran el
# generador de id optimizado de la plataforma (node:crypto frente a Web Crypto). Usar solo
# `@narrativetrace/core` sigue funcionando — recurre directamente a Web Crypto donde está
# disponible (todos los runtimes que soporta esta librería) — pero el paquete de plataforma
# sigue siendo el que hay que instalar: es la vía probada y documentada, y la única que
# garantiza no lanzar un error en un runtime sin Web Crypto en absoluto.

# Integraciones opcionales
pnpm add -D @narrativetrace/vitest           # Plugin de Vitest
pnpm add @narrativetrace/diagrams            # Mermaid + PlantUML
pnpm add @narrativetrace/clarity             # Análisis de claridad de nombres
pnpm add @narrativetrace/browser             # Consola del navegador + exportación de red
pnpm add @narrativetrace/standalone          # Paquete de un solo archivo para páginas <script> simples (sin bundler)
```

## 2. Elige una vía de integración

### Opción A: Proxy de ES (funciona en cualquier aplicación TypeScript/JavaScript)

```ts
// Node: "@narrativetrace/core-node" — Navegador: "@narrativetrace/core-web"
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

const tracedOrderService = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

tracedOrderService.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
context.reset();
```

Usa esta opción cuando quieras control explícito sobre el trazado. Funciona en Node, Deno, Bun y navegadores.

### Opción B: plugin de Vitest (contexto automático + salida de trazas)

```bash
pnpm add -D @narrativetrace/vitest @narrativetrace/proxy vitest
```

`vitest` es la única dependencia de pares (`peerDependency`) de `@narrativetrace/vitest`; sus otras
cuatro dependencias de NarrativeTrace (core-node, clarity, diagrams, glossary) se instalan
automáticamente con él — se publican al mismo ritmo y nunca se versionan por separado.
`@narrativetrace/proxy` se indica explícitamente porque los ejemplos de abajo importan
`traceObject` directamente desde ahí: pnpm solo expone las dependencias propias de un paquete, no
las dependencias de una dependencia, así que cualquier cosa que importes tú mismo sigue
necesitando ser tu propia dependencia (el `node_modules` más plano de npm no traza esta línea,
pero pnpm — el que se muestra aquí — sí). *(since 0.1.3, unreleased)*

#### Fixture básico (sin salida a archivo)

```ts
import { narrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

narrativeTest("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
  // narrativeContext está disponible para las aserciones
});
```

#### Con salida a archivo

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "json", "mmd", "puml", "clarity-json"],
});

test("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
});
```

Características:
- `NarrativeContext` por prueba mediante fixture de Vitest
- Emisión automática de archivos de traza tras cada prueba
- Nombre del escenario derivado del nombre de la prueba
- Varios formatos de salida: Markdown, JSON, Mermaid, PlantUML, JSON de claridad

### Opción C: middleware de Express/Hono

Trazado por petición en aplicaciones web usando `AsyncNarrativeContext`:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

app.use((req, res, next) => {
  asyncContext.run(() => {
    // Todas las llamadas trazadas dentro de esta petición comparten el mismo contexto
    next();
  });
});

app.get("/orders", (req, res) => {
  const traced = traceObject(orderService, asyncContext);
  const result = traced.placeOrder("C1", "P1", 2);
  console.log(renderIndentedText(asyncContext.captureTrace()));
  res.json(result);
});
```

### Opción D: navegador (renderizado en consola + exportación de red)

```bash
pnpm add @narrativetrace/core-web @narrativetrace/proxy @narrativetrace/browser
```

```ts
// core-web registra el generador de id de Web Crypto — impórtalo a él, no a @narrativetrace/core
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole, postToCollector } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
const tree = context.captureTrace();

// Mostrarlo en la página
document.querySelector("pre#trace").textContent = renderIndentedText(tree);

// Reflejarlo en la consola de DevTools
renderToConsole(tree);

// Enviarlo (POST) como JSON a un endpoint recolector (se resuelve para cualquier estado HTTP — comprueba response.ok)
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
```

El contexto núcleo, el Proxy de ES y el renderizado de valores son JavaScript puro sin dependencias de Node. `AsyncLocalStorage` es exclusivo de Node; en el navegador, propaga el contexto manualmente mediante `snapshot()`.
Versión ejecutable: `pnpm run example:browser` (consulta la [Guía de ejemplos](guia-de-ejemplos.md#navegador)).

### Opción E: página JavaScript simple, sin bundler (etiqueta script)

```bash
pnpm add @narrativetrace/standalone
```

`@narrativetrace/standalone` distribuye un solo archivo que contiene `core-web` + `proxy` + `browser` en dos formatos: `dist/narrativetrace.global.js` (script clásico → `window.NarrativeTrace`) y `dist/narrativetrace.js` (módulo ES). Copia el que necesites junto a tu página; cargarlo registra el generador de id del navegador, así que no se importa nada más.

```html
<script src="narrativetrace.global.js"></script>
<script>
  var NT = window.NarrativeTrace;
  var context = new NT.SyncNarrativeContext(new NT.NarrativeTraceConfig());
  var traced = NT.traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });

  traced.placeOrder("C1", "P1", 2);

  var tree = context.captureTrace();
  document.getElementById("trace").textContent = NT.renderIndentedText(tree);
  NT.renderToConsole(tree);
</script>
```

Versión ejecutable: `pnpm run example:script-tag` (consulta la [Guía de ejemplos](guia-de-ejemplos.md#etiqueta-script)). Prefiere la opción A/D con un bundler cuando dispongas de uno — grafos más pequeños y tree-shaking.

## 3. Configurar la salida de trazas

### Vitest (recomendado)

Usa `createNarrativeTest` con opciones:

```ts
const test = createNarrativeTest({
  outputDir: "narrativetrace-output",   // por defecto: "narrativetrace-output"
  formats: ["md", "json"],              // por defecto: ["md", "json", "mmd"]
  bufferCapacity: 8192,                 // por defecto: 8192 eventos (~4000 llamadas trazadas)
});
```

Una prueba que traza más eventos de los que admite `bufferCapacity` pierde sus eventos más
antiguos. No lo hace en silencio: la ejecución imprime una línea que indica el conteo y el
valor al que subirlo, y los artefactos de Markdown y de diagramas llevan el mismo pie de página.

Formatos disponibles:

| Formato | Extensión | Contenido |
|--------|-----------|---------|
| `md` | `.md` | Markdown con frontmatter YAML |
| `json` | `.json` | JSON con eventos de entrada/salida |
| `mmd` | `.mmd` | Diagrama de secuencia de Mermaid |
| `puml` | `.puml` | Diagrama de secuencia de PlantUML |
| `clarity-json` | `.clarity-json` | JSON de análisis de claridad |

### Salida manual

Para configuraciones sin Vitest, usa los renderizadores directamente:

```ts
import { renderMarkdown, renderIndentedText, renderProse, exportJson } from "@narrativetrace/core";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";

const tree = context.captureTrace();

// Elige tu formato
console.log(renderIndentedText(tree));
console.log(renderMarkdown(tree, { scenarioName: "Order placement" }));
console.log(renderProse(tree));
console.log(exportJson(tree, { scenario: "Order placement" }));
console.log(renderMermaidSequence(tree));
console.log(renderPlantUmlSequence(tree));
```

## 4. Valida la instalación

Ejecuta las pruebas:

```bash
pnpm test
```

Si usas `createNarrativeTest`, los archivos de traza aparecen en el directorio de salida configurado:

```
narrativetrace-output/
├── customer_places_order.md
├── customer_places_order.json
├── customer_places_order.mmd
├── customer_places_order.puml
└── customer_places_order.clarity-json
```

## Referencia de selección de paquetes

| Paquete | Cuándo añadirlo |
|---------|----------------|
| `@narrativetrace/core` | Siempre requerido |
| `@narrativetrace/proxy` | Trazado con Proxy de ES (el más común) |
| `@narrativetrace/vitest` | Fixture de Vitest y emisión de archivos de traza |
| `@narrativetrace/diagrams` | Renderizadores de Mermaid / PlantUML |
| `@narrativetrace/clarity` | Análisis e informes de claridad de nombres |
| `@narrativetrace/browser` | Renderizado en consola del navegador y exportación de red |

## Véase también

- [Guía de configuración](guia-de-configuracion.md) — niveles de trazado, opciones de renderizado, redacción de parámetros
- [Guía de decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guía de claridad](guia-de-claridad.md) — modelo de puntuación, componentes de NLP, escáner estático
- [Guía de integración de frameworks](guia-de-integracion-de-frameworks.md) — Express, Hono, navegador, AsyncLocalStorage
