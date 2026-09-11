<!-- source: documentation/examples-guide.md blob f3ca6de1fcee | translated: 2026-09-11 | reviewed: - -->

# Guía de ejemplos

[English](../examples-guide.md) | **Español** | [Português](../pt-BR/guia-de-exemplos.md) | [简体中文](../zh-CN/示例指南.md)

NarrativeTrace incluye 12 ejemplos ejecutables en `examples/`. Cada uno es un paquete independiente con sus propias pruebas. Cuatro de ellos — ecommerce, clarity, minecraft (ambas mitades) y plain-js — también son accesibles a través del lanzador `pnpm demo`, descrito [más abajo](#lanzador-de-la-demo).

## Referencia rápida

| Ejemplo | Qué demuestra | Comando de ejecución |
|---|---|---|
| [ecommerce](#ecommerce) | El buque insignia: seis escenarios sobre un grafo de servicios trazado — éxito, fallos, un decorador inestable, fork/join | `pnpm run example:ecommerce` |
| [clarity](#clarity) | Lo que el analizador de claridad premia y penaliza: un dominio hotelero en cuatro niveles de nomenclatura, más el informe | `pnpm run example:clarity` |
| [express](#express) | Middleware de Express + contexto de traza HTTP | `pnpm run example:express` |
| [hono](#hono) | Middleware de Hono + contexto de traza HTTP | `pnpm run example:hono` |
| [distributed](#distributed) | 5 microservicios + Jaeger + correlación OTel | `pnpm run example:distributed` |
| [minecraft](#minecraft) | Nomenclatura orientada al dominio, legibilidad de la traza | `pnpm run example:minecraft` |
| [minecraft-generic](#minecraft-generic) | Nomenclatura genérica, comparación de trazas | `pnpm run example:minecraft-generic` |
| [plain-js](#plain-js) | La API desde JavaScript puro: `.mjs`, tipos JSDoc, sin decoradores | `pnpm run example:plain-js` |
| [script-tag](#etiqueta-script) | Página de navegador con etiquetas `<script>` clásicas: `window.NarrativeTrace` desde un único archivo empaquetado, sin bundler | `pnpm run example:script-tag` |
| [browser](#navegador) | Página Vite: traza renderizada en la página, consola de DevTools, POST al colector | `pnpm run example:browser` |
| [express-angular](#angular--express) | Full-stack: frontend en Angular + backend en Express | `pnpm run example:express-angular` |
| [nestjs-react](#nestjs--react) | Full-stack: trazado por DI sin código en NestJS + frontend en React | `pnpm --filter @narrativetrace/example-nestjs-react start` |

## Lanzador de la demo

`pnpm demo` es la forma más rápida de ver los ejemplos en acción: un solo comando, la narración en
vivo coloreada e indentada según la profundidad de la llamada, y cada renderizado anunciado como su
propia sección. Abre un selector interactivo; `--example <name>` se ejecuta de forma no interactiva;
`--list` enumera los ejemplos. Compila una vez primero (`pnpm run build`) — los ejemplos importan el
`dist` de los paquetes.

```bash
pnpm demo                                     # selector: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce              # no interactivo
pnpm demo -- --example ecommerce --classic    # logs con marca de tiempo a través del puente de winston
pnpm demo -- --example ecommerce --no-pause   # se reproduce de corrido, sin puntos de pausa
pnpm demo -- --example ecommerce --lang es    # vuelve a renderizar la ejecución a través de examples/ecommerce/glossary.json
pnpm demo -- --list
```

**Camina, no se desplaza sola.** En una terminal, la demo se detiene después de cada escenario —
`[Enter]` avanza, `q` sale — y cada escenario se abre con una nota sobre *cómo está configurada la
traza de ese escenario*: `@traced`/`@narrated`/`@onError`/`@notTraced` aquí, un `traceObject` a
secas con un mapa `paramNames` allá, `ForkJoinGroup` para el concurrente. Las notas viven junto al
código en el `src/scenarios.ts` de cada ejemplo (`Scenario { title, wiring, run }`), y la prueba
raíz `tools/__tests__/demo-wiring.test.ts` falla si un escenario alguna vez pierde su nota o si el
registro y `--list` no coinciden. Las ejecuciones pausadas se graban primero y luego se recorren, de
modo que un punto de pausa nunca puede inflar las duraciones que reporta el árbol de traza;
`--no-pause` reproduce la ejecución de corrido, en vivo, y es lo que reciben los pipes y la CI.
`NO_COLOR` quita los colores, `FORCE_COLOR` los conserva en un pipe.

**De dónde vienen los renderizados** se responde una vez por ejecución, en la primera sección de
renderizado. No hay un renderer por defecto ni nada que configurar: la captura produce un
`TraceTree` y tú llamas al renderer que quieras — `renderIndentedText(tree)`, `renderProse`,
`renderMermaidSequence`, `renderPlantUmlSequence`. Las líneas en vivo `→ ← !!` no son un renderer en
absoluto: eso es un `EventConsumer` en la ruta en línea del `DualPathPipeline` del ejemplo
(`tools/demo-stream.ts`, el gemelo del `Slf4jTraceEventListener` de Java) — la única vista que no
cuesta código de renderizado. La configuración selecciona un renderer en exactamente un lugar, los
archivos de traza escritos desde las pruebas: `createNarrativeTest` los escribe por su cuenta —
sin necesidad de ningún flag — y `NARRATIVETRACE_FORMAT=md|mmd|json|puml` elige cuáles. Define
`NARRATIVETRACE_OUTPUT=false` para desactivar la escritura de archivos.

**La salida de log clásica es un modo de primera clase.** `--classic` envía la misma ejecución a
través de `@narrativetrace/winston` con un formato tradicional `yyyy-MM-dd HH:mm:ss.SSS LEVEL
[thread] [logger] - message` — la idea es que la narración son líneas de log ordinarias que
cualquier herramienta de logging ingiere.

**Cada ejecución también llega a un logger real, en todos los modos.** Independientemente de
`--classic`, el lanzador compone un consumidor de `@narrativetrace/pino` sobre el listener que el
modo ya esté usando y escribe líneas estructuradas por evento en `demo-trace.log`, en la raíz del
repositorio (`createDemoLogger()` de `tools/demo.ts` — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino)).
Las vistas de consola coloreada, clásica y traducida no cambian; `tail -f demo-trace.log` muestra
la misma traza aterrizando en un logger configurado a medida que corre la demo. El punto de
entrada propio de cada ejemplo (`pnpm run example:<name>`, sin el lanzador de por medio) conecta
el mismo puente directamente a stdout — consulta "Logger" debajo de cada ejemplo.

**Las trazas traducidas también son un modo de primera clase.** Cada ejemplo del lanzador incluye
un glosario de dominio (`examples/<name>/glossary.json` — un contexto delimitado con términos
curados en español y en chino simplificado), y `--lang es` (o `zh-CN`) vuelve a renderizar la misma
ejecución a través de él: los identificadores aparecen en el idioma elegido con el original entre
corchetes (`buscar cliente [findCustomer]`), mientras que los valores de los parámetros, los valores
de retorno y los mensajes de error permanecen idénticos byte a byte. El selector ofrece exactamente
los locales que lleva el glosario *y* el paquete de scaffolding de la biblioteca. Las frases sin
traducir se acumulan en un pie de página de "vacíos del glosario" — la cola de trabajo de curación —
y los escenarios con nombres deficientes (la mitad sin refactorizar de minecraft, el procesamiento
legado de clarity) permanecen sin traducir a propósito: los nombres que no cuentan ninguna historia
no se pueden traducir en una. Las plantillas de `@narrated`/`@onError` están en los glosarios pero
aún no traducidas (el esquema de exportación todavía no transporta la plantilla).

Código del lanzador: `tools/demo.ts` (integración con la terminal), `tools/demo-runner.ts`
(orquestación, probada contra una terminal falsa), `tools/demo-args.ts`, `tools/demo-colors.ts`,
`tools/demo-stream.ts`, `tools/demo-registry.ts`, `tools/demo-translate.ts`. Cero dependencias en
tiempo de ejecución más allá del workspace; se ejecuta desde la raíz del repositorio.

## Ecommerce

El buque insignia. Cinco servicios en memoria (customer, catalog, inventory, payment, notification)
están envueltos con `traceObject()`; la orquestación interesante es `DefaultOrderService`. Los
nombres de los parámetros vienen de `@traced`, la narración de `placeOrder` de `@narrated`, el texto
de fallo entre corchetes de `@onError`, y el token de la tarjeta se imprime como `[REDACTED]`
gracias a `@notTraced(2)`. `src/scenarios.ts` ejecuta los seis escenarios de Java, cada uno
imprimiendo `--- Trace tree ---`, `--- Prose ---` y `--- Mermaid ---` (o PlantUML):

1. **Pedido exitoso + notificación asíncrona** — el camino feliz; la notificación esperada (`await`)
   aterriza en la misma traza porque `AsyncNarrativeContext` lleva el span a través del `await`.
2. **Fallo de pago — bug de fuga de inventario** — la traza muestra que se llamó a
   `InventoryService.reserve` pero nunca a `release`: las trazas sacan a la luz un bug real.
3. **Servicio externo inestable** — `FlakyNotificationService`, que decora un stub, tiene éxito una
   vez y luego lanza `ExternalServiceError`; envuelto con un `traceObject` a secas en el sitio de la
   llamada.
4. **Cliente desconocido** — rama de fallo de validación de entrada.
5. **Sin stock** — rama de fallo de regla de negocio, adicionalmente renderizada como PlantUML.
6. **Captura asíncrona explícita** — `ForkJoinGroup.all` sobre dos búsquedas concurrentes de
   `RemoteCatalogService` unidas en un solo segmento `⑂ fork`.

```bash
pnpm run example:ecommerce      # cada escenario, solo las secciones (el lanzador añade el stream en vivo)
pnpm demo -- --example ecommerce
```

**Archivos clave:**
- `examples/ecommerce/src/scenarios.ts` — el registro de escenarios con las notas de cableado
- `examples/ecommerce/src/scenario.ts` — `Scenario`/`ScenarioContext` y `createDemoContext(listener)`
- `examples/ecommerce/src/traced-services.ts` — fábrica `createTracedServices()`
- `examples/ecommerce/src/order-service.ts` — orquestador que llama a todos los demás servicios
- `examples/ecommerce/glossary.json` — el contexto delimitado a través del cual traduce `--lang`

**Logger:** `src/demo.ts` envía la misma traza a un logger real de
[Pino](https://github.com/pinojs/pino) (`@narrativetrace/pino`), intercalada con la narración en
consola de arriba — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Clarity

El `ClarityDemoExample` de Java: un dominio de reservas de hotel en cuatro niveles de calidad de
nomenclatura, y luego el informe de claridad sobre los cuatro árboles capturados. El cableado es
idéntico en todos los niveles — la variable bajo prueba es la nomenclatura, no la configuración.

1. **El huésped reserva una habitación** — nomenclatura excelente y específica del dominio
   (`DefaultReservationService`).
2. **Reserva a través de un manager** — nomenclatura adecuada pero menos expresiva
   (`DefaultBookingManager`).
3. **Procesamiento de datos legado** — nomenclatura intencionalmente débil (`DefaultDataProcessor`).
4. **Operaciones del repositorio de huéspedes** — un desajuste de cohesión (búsqueda, renderizado de
   informes y envío de correo en un solo repositorio).
5. **Informe de análisis de claridad** — `analyzeClarity` sobre los árboles capturados, impreso con
   `renderClarityReport` y `renderClaritySuiteReport`.

```bash
pnpm run example:clarity
pnpm demo -- --example clarity
```

**Archivos clave:**
- `examples/clarity/src/scenarios.ts` — `createClarityScenarios()`; el escenario del informe lee los
  árboles que capturaron los primeros cuatro
- `examples/clarity/src/reservation-service.ts` — el nivel bien nombrado

**Logger:** `src/demo.ts` envía la misma traza a un logger real de Pino (`@narrativetrace/pino`),
intercalada con la narración en consola de arriba — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Express

Un servidor HTTP de Express que envuelve los servicios de ecommerce con el middleware
`narrativeTrace()`. Cada solicitud obtiene su propio contexto de traza a través de
`AsyncNarrativeContext`.

```bash
pnpm run example:express
```

Luego abre `http://localhost:3000` en un navegador. Envía el formulario de pedido — la respuesta
JSON incluye tanto el resultado del pedido como el árbol de traza completo.

**Archivos clave:**
- `examples/express/src/app.ts` — app de Express con el middleware `narrativeTrace(ctx)`

**Logger:** `src/app.ts` construye el contexto con `createExpressNarrativeContext(config, {
pipeline })`, conectando un logger real de Pino (`@narrativetrace/pino`) a la ruta síncrona del
pipeline, junto al `BufferedEventConsumer` que `ctx.captureTrace()` sigue necesitando — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Hono

Igual que el ejemplo de Express, pero usando el framework Hono.

```bash
pnpm run example:hono
```

Abre `http://localhost:3001`. El mismo formulario de pedido, la misma traza en la respuesta.

**Archivos clave:**
- `examples/hono/src/app.ts` — app de Hono con el middleware `narrativeTrace(ctx)`

**Logger:** `src/app.ts` construye el contexto con `createHonoNarrativeContext(config, { pipeline
})`, con el mismo cableado que el puente de Pino del ejemplo [Express](#express).

## Distributed

Cinco microservicios ejecutándose en contenedores Docker, conectados por HTTP, con correlación de
trazas distribuidas a través de OpenTelemetry y Jaeger.

**Arquitectura:**

```
Navegador → Gateway (:3000) → Customer-Catalog (:3001)
                             → Inventory (:3002)
                             → Payment (:3003) → Fraud (:3004)
```

Todos los servicios comparten el mismo `traceId` mediante la propagación del header W3C
`traceparent`. Cada servicio produce tanto trazas de NarrativeTrace a nivel de método como spans de
OTel.

### Requisitos previos

- Docker y Docker Compose

### Ejecución

```bash
pnpm run example:distributed
```

Esto levanta 6 contenedores:

| Contenedor | Propósito | Puerto expuesto |
|---|---|---|
| jaeger | Colector de trazas + UI | `localhost:16686` |
| gateway | API gateway, orquesta el flujo de pedidos | `localhost:3000` |
| customer-catalog | Búsqueda de clientes + productos | interno |
| inventory | Reserva de stock | interno |
| payment | Procesamiento de pagos, llama a fraud | interno |
| fraud | Evaluación de fraude | interno |

### Realizar un pedido

Abre `http://localhost:3000` en un navegador. Envía el formulario de pedido con un cliente, un
producto y una cantidad.

La respuesta JSON incluye:
- `order` — el resultado del pedido (totalCharged, transactionId)
- `trace` — el árbol de NarrativeTrace desde la perspectiva del gateway

### Ver las trazas en Jaeger

Abre `http://localhost:16686`. Selecciona un servicio en el desplegable (por ejemplo,
`api-gateway`) y haz clic en **Find Traces**. Haz clic en una traza para ver el árbol de spans
distribuido completo a través de los 5 servicios.

**Prueba estos escenarios:**
- **C1 + P1** — camino feliz, todos los servicios tienen éxito
- **C3 + P1** — pago rechazado (Charlie está en la lista negra), la traza muestra la propagación del
  error a través de payment → gateway
- **Any + P2 qty 999** — stock insuficiente, el servicio de inventario rechaza la reserva

### Detener

```bash
docker compose -f examples/distributed/src/docker-compose.yml down
```

**Archivos clave:**
- `examples/distributed/src/gateway-app.ts` — orquesta las llamadas a los servicios descendentes
- `examples/distributed/src/traced-service-factory.ts` — crea contextos de traza integrados con OTel
- `examples/distributed/src/docker-compose.yml` — definiciones de contenedores

**Logger:** el `buildPipeline` de `src/traced-service-factory.ts` transmite la traza de cada
servicio a un logger real de Pino (`@narrativetrace/pino`) por stdout — el destino nativo del
contenedor — junto a los spans de OTel y al consumidor enriquecedor que ya tenía cableado; una
única fábrica compartida cubre los 5 servicios — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Minecraft

Un dominio inspirado en Minecraft (generador de mundo, inventario del jugador, mesa de crafteo,
generador de criaturas, servidor de mundo) con nombres descriptivos y orientados al dominio. La
traza se lee como documentación.

```bash
pnpm run example:minecraft
```

**Salida:**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", ...}
  PlayerInventory.addItem(item: {"name": "oak_log", ...}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", ...}) -> {"name": "oak_planks", ...}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> ...
-> "Steve joined the world in plains biome"
```

**Logger:** `src/demo.ts` envía la misma traza a un logger real de Pino (`@narrativetrace/pino`),
intercalada con la salida en consola de arriba — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Minecraft-Generic

La misma lógica exacta que el ejemplo de minecraft, pero con nombres genéricos y opacos
(GameManager, DataProcessor, StateManager, ThingFactory, EntityHandler). Compara las dos trazas una
junto a la otra — la diferencia en la calidad de la nomenclatura es inmediatamente visible. Este es
el argumento central de NarrativeTrace: si tu traza es ilegible, tu código necesita renombrarse, no
más sentencias de log.

```bash
pnpm run example:minecraft-generic
pnpm demo -- --example minecraft     # ambas mitades, refactorizada primero, como el único ejemplo de Java
```

Ambas mitades están cableadas exactamente de la misma manera, byte a byte — `traceObject(impl,
context, paramNames, { className })`, sin decoradores — así que el mapa `paramNames` es lo que
nombra a los parámetros.

**Logger:** `src/demo.ts` envía la misma traza a un logger real de Pino (`@narrativetrace/pino`),
intercalada con la salida en consola de arriba — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Plain-JS

El análogo de la plataforma al ejemplo `library` en Kotlin de Java: un consumidor ESM en JavaScript
puro (`.mjs`, tipos JSDoc verificados por `tsc --checkJs`, sin decoradores, sin TypeScript) que traza
un pequeño dominio de préstamo de libros (`CatalogService`, `MemberService`, `LendingService`)
mediante `traceObject` con mapas `paramNames`. Dos escenarios: un préstamo exitoso (árbol, prosa,
Mermaid) y un fallo `BookUnavailableError`.

```bash
pnpm run example:plain-js
pnpm demo -- --example plain-js
```

**Archivos clave:**
- `examples/plain-js/src/scenarios.mjs` — el registro, `createTracedLendingService(context)`
- `examples/plain-js/src/lending-service.mjs` — recibe un reloj inyectable para que las pruebas sean
  reproducibles

**Logger:** `src/demo.mjs` envía la misma traza a un logger real de Pino (`@narrativetrace/pino`),
intercalada con la narración en consola de arriba — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Navegador

Una página de navegador real servida por Vite. Usa `SyncNarrativeContext` (no hay
`AsyncLocalStorage` en el navegador) y `@narrativetrace/core-web` para el generador de id de Web
Crypto. Al hacer clic en **Run traced calculation** se envuelve un `Calculator` con `traceObject()`,
incluyendo un `divide(1, 0)` capturado para que se vea un resultado `✗`, y luego:

- renderiza la traza en la página con `renderIndentedText`,
- la refleja en la consola de DevTools con `renderToConsole`,
- la envía como JSON con `postToCollector` a `/traces`, un middleware colector solo para desarrollo
  en `vite.config.ts` que registra cada traza recibida en la terminal. La página informa el
  resultado (accepted / rejected / unreachable).

```bash
pnpm run example:browser      # servidor de desarrollo de Vite en http://localhost:5175
```

Las pruebas se ejecutan bajo jsdom con `core-web` (nunca `core-node`), de modo que la suite ejercita
la ruta de la plataforma de navegador; `pnpm --filter @narrativetrace/example-browser build` verifica
los tipos y produce un bundle de producción con `vite build`.

**Archivos clave:**
- `examples/browser/index.html` — la página; carga `src/app.ts`
- `examples/browser/src/app.ts` — punto de entrada: importa `@narrativetrace/core-web`, monta la demo
- `examples/browser/src/demo.ts` — `mountDemo()`: trazado, renderizado en la página + en consola,
  exportación al colector
- `examples/browser/src/calculator.ts` — la clase trazada
- `examples/browser/vite.config.ts` — servidor de desarrollo + middleware colector de `/traces`

**Logger:** no aplica — este ejemplo se ejecuta enteramente en el navegador, donde
`renderToConsole()` (la consola de DevTools) ya es el destino realista; `@narrativetrace/pino` y
`@narrativetrace/winston` son puentes exclusivos de Node, sin ningún stream de TraceEvent al que
conectarse aquí.

## Etiqueta script

La contraparte en navegador de [plain-js](#plain-js): JavaScript puro en una página web sin **TypeScript, sin bundler y sin módulos ES**. `public/index.html` carga dos scripts clásicos en orden: `/narrativetrace.global.js` — el bundle de [`@narrativetrace/standalone`](../../packages/standalone/README.md), que define `window.NarrativeTrace` y registra el generador de id para navegador — y `/app.js`, JavaScript escrito a mano al estilo ES5 (función constructora + métodos de prototipo; a `traceObject` no le importa cómo se construyeron los objetos). Al hacer clic en **Run traced checkout** se traza un `ShoppingCart`, incluyendo un `checkout("EXPIRED")` capturado para que se vea un resultado `✗`, luego renderiza la traza en la página, la refleja en la consola de DevTools y la envía por POST a `/traces`.

Un servidor `node:http` de ~60 líneas (`src/server.ts`) sirve los tres archivos desde una tabla de rutas explícita (sin recorrer directorios) y responde a `POST /traces` con 202 mientras registra `[collector] received trace (N bytes)`; cualquier otro método sobre `/traces` es 405, cualquier otra cosa es 404.

```bash
pnpm run example:script-tag      # http://localhost:5176
```

Pruebas: el servidor contra un puerto efímero (rutas, tipos de contenido, colector, 405/404, traversal), y el propio `app.js` bajo jsdom — cargado de la misma manera que lo hace un navegador (cuerpo HTML, luego los dos scripts clásicos) — verificando las cuatro líneas de traza renderizadas y los estados accepted / rejected / unreachable del colector.

**Archivos clave:**
- `examples/script-tag/public/index.html` — la página; se explica a sí misma mediante comentarios HTML
- `examples/script-tag/public/app.js` — la aplicación en JavaScript puro
- `examples/script-tag/src/server.ts` — rutas estáticas + colector de `/traces`; `src/entry.ts` lo arranca

**Logger:** la traza en sí se produce en el navegador (`public/app.js`), así que no hay ningún
stream local de TraceEvent al que un puente de Node pueda conectarse; el colector de
`src/server.ts` registra el documento de traza recibido a través de un logger real de Pino,
estructurado, junto a su línea de consola existente.

## Angular + Express

Ejemplo full-stack: frontend en Angular que llama al backend de ecommerce en Express con
correlación de trazas de extremo a extremo.

Demuestra todas las funcionalidades de `@narrativetrace/angular`:
- `provideNarrativeTrace()` — configuración en una sola llamada con headers `traceparent`
  automáticos
- `provideTraced(OrderService)` — trazado de servicios sin código a través de la DI de Angular
- `TraceCaptureService` — captura la traza del lado del cliente después de cada pedido
- `traceInterceptor` — añade automáticamente el header W3C `traceparent` a cada solicitud de
  `HttpClient`

### Ejecución

```bash
pnpm run example:express-angular
```

Esto inicia el backend de Express en `:3000` y el servidor de desarrollo de Vite en `:4200`. Abre
`http://localhost:4200`.

Realiza un pedido y observa:
- **Resultado del pedido** — orderId, transactionId, totalCharged
- **Traza del cliente** — traza del lado de Angular mostrando `OrderService.placeOrder` (a través de
  `provideTraced`)
- **Traza del servidor** — traza del lado de Express mostrando CustomerService, CatalogService,
  InventoryService, PaymentService
- **ID de traza** — el mismo ID de 32 hexadecimales en ambos lados (correlación traceparent)

**Archivos clave:**
- `examples/express-angular/client/app.config.ts` — configuración de `provideNarrativeTrace()` +
  `provideTraced(OrderService)`
- `examples/express-angular/client/order.service.ts` — envoltorio de `HttpClient`, trazado
  automáticamente
- `examples/express-angular/client/order-form.component.ts` — UI del formulario + visualización de
  la traza
- `examples/express-angular/server/app.ts` — backend de Express con CORS + middleware
  `narrativeTrace(ctx)`

**Logger:** `server/app.ts` usa el mismo cableado de `createExpressNarrativeContext(config, {
pipeline })` que el puente de Pino del ejemplo [Express](#express).

## NestJS + React

Ejemplo full-stack: un backend de NestJS que traza su grafo de servicios con **cero código de
aplicación** a través de la inyección de dependencias de Nest, junto con un frontend en React que
traza las llamadas del lado del cliente. Ambos lados devuelven su árbol de traza para que puedas ver
la solicitud de extremo a extremo.

Demuestra:
- `AutoProxyModule.forRoot(...)` — módulo de `@narrativetrace/nestjs` que crea un auto-proxy para
  cada provider (`OrdersService`, `InventoryService`, `PaymentService`) para que sus llamadas a
  métodos queden trazadas sin tocar el cuerpo de los servicios
- `NarrativeStorage` — inyectado en `OrdersController` para hacer `captureTrace()` de la solicitud
  actual
- `@narrativetrace/react` en el cliente — `NarrativeTraceProvider`, `useTraced()` (envuelve
  `OrderService`), `useTracedFetch()`, y `useTraceCapture()` para la traza del lado del cliente

### Ejecución

El ejemplo no tiene un script `example:` en la raíz; ejecútalo a través de los propios scripts del
`package.json` del paquete con `pnpm --filter`:

```bash
# Inicia tanto el servidor de NestJS como el servidor de desarrollo de Vite juntos
pnpm --filter @narrativetrace/example-nestjs-react start

# ...o inícialos de forma independiente
pnpm --filter @narrativetrace/example-nestjs-react start:server   # NestJS en :3000
pnpm --filter @narrativetrace/example-nestjs-react start:client   # servidor de desarrollo de Vite en :5173
```

El backend de NestJS escucha en `:3000` (sobrescríbelo con `PORT`) y el servidor de desarrollo de
Vite en `:5173`, haciendo proxy de `/orders` hacia el backend. Abre `http://localhost:5173`.

Realiza un pedido y observa:
- **Resultado del pedido** — orderId (`ORD-*`), transactionId (`TXN-*`), totalCharged
- **Traza del cliente** — traza del lado de React de `OrderService.placeOrder` (a través de
  `useTraced`)
- **Traza del servidor** — traza del lado de NestJS de `OrdersService` → `InventoryService` /
  `PaymentService`, con auto-proxy aplicado por la DI

### Pruebas

```bash
pnpm --filter @narrativetrace/example-nestjs-react test
```

**Archivos clave:**
- `examples/nestjs-react/server/app.module.ts` — cableado de `AutoProxyModule.forRoot(...)`
- `examples/nestjs-react/server/orders.controller.ts` — captura la traza de la solicitud a través
  del `NarrativeStorage` inyectado
- `examples/nestjs-react/server/orders.service.ts` — orquestador (`InventoryService` +
  `PaymentService`)
- `examples/nestjs-react/client/order-form.tsx` — `useTraced` / `useTracedFetch` /
  `useTraceCapture` + visualización de la traza

**Logger:** `server/app.module.ts` pasa un `pipeline` explícito (un logger real de Pino más un
`BufferedEventConsumer`) a `AutoProxyModule.forRoot()` — sin él, los spans capturados van a parar a
un consumidor desechable que nadie drena (el propio vacío TS-DI-1, ya documentado, de
`AutoProxyOptions.pipeline`) — consulta la
[Guía de integración de frameworks § Winston y Pino](guia-de-integracion-de-frameworks.md#9-winston-y-pino).

## Ejecutar todos los ejemplos

```bash
pnpm run example:all
```

Ejecuta ecommerce, minecraft, minecraft-generic, clarity y plain-js de forma secuencial, y luego
inicia express y hono en paralelo. El ejemplo distributed requiere Docker y se ejecuta por separado.
Para el recorrido guiado y pausado, usa `pnpm demo` en su lugar.

## Ejecutar las pruebas

Cada ejemplo tiene su propia suite de pruebas:

```bash
cd examples/ecommerce && pnpm run test      # 51 pruebas (dominio + trazado + los seis escenarios)
cd examples/clarity && pnpm run test        # 8 pruebas (dominio + los niveles y el informe)
cd examples/express && pnpm run test         # 4 pruebas
cd examples/hono && pnpm run test            # 5 pruebas
cd examples/distributed && pnpm run test     # 40 pruebas
cd examples/minecraft && pnpm run test       # 22 pruebas (dominio + integración de trazado)
cd examples/minecraft-generic && pnpm run test  # 18 pruebas
cd examples/plain-js && pnpm run test        # 8 pruebas (.mjs con tipos JSDoc)
cd examples/browser && pnpm run test         # 4 pruebas
cd examples/express-angular && pnpm run test # 16 pruebas (servidor + componentes y servicios de Angular)
cd examples/nestjs-react && pnpm run test    # 13 pruebas (NestJS supertest + componentes y servicios de React)

# O ejecuta todo mediante turbo:
pnpm run test

# Las pruebas propias del lanzador (parser, colorizador, stream, verificación de registro/cableado, traducción, runner)
pnpm run test:root
```
