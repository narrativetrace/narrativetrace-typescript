<!-- source: documentation/choosing-an-integration.md blob b965667a368c | translated: 2026-09-03 | reviewed: - -->
# Eligiendo una integración

[English](../choosing-an-integration.md) | **Español** | [Português](../pt-BR/escolhendo-uma-integracao.md) | [简体中文](../zh-CN/选择集成方式.md)

NarrativeTrace tiene un único modelo de captura — un evento de
entrada/salida, construido por el `Proxy` de ES de `traceObject()`,
publicado a un `NarrativeContext` — al que se llega mediante varios puntos
de conexión distintos. Esta página responde a «qué paquete necesito en
realidad», primero como tabla de referencia, luego como diagrama de
decisión, y por último con las salvedades de cada camino.

## Quieres... / Empieza con...

| Quieres | Empieza con |
|---|---|
| Trazas en tests, con el mínimo cableado | `@narrativetrace/vitest` (`createNarrativeTest`) |
| Elegir exactamente qué se envuelve, en TypeScript/JavaScript puro | `@narrativetrace/proxy` (`traceObject`) directamente |
| Trazado por petición en una app Express | `@narrativetrace/express` |
| Trazado por petición en Hono (edge/serverless) | `@narrativetrace/hono` |
| Trazado de providers de Nest sin código de aplicación | `@narrativetrace/nestjs` (`AutoProxyModule`) |
| Trazado de servicios/DI de Angular + correlación HTTP | `@narrativetrace/angular` |
| Trazado de componentes/servicios de React | `@narrativetrace/react` (+ `@narrativetrace/react-router` para navegación) |
| Página de navegador con bundler | `@narrativetrace/core-web` + `@narrativetrace/browser` |
| Página de navegador, sin bundler, `<script>` clásico | `@narrativetrace/standalone` |
| Visibilidad entre peticiones/asíncrona en Node | `AsyncNarrativeContext` (`@narrativetrace/core-node`, basado en `AsyncLocalStorage`) |
| Trabajo en paralelo bajo una misma traza | `ForkJoinGroup` / `FireAndForgetGroup` (`@narrativetrace/core`) |
| Trazas en tu flujo de logs de producción | `@narrativetrace/winston` o `@narrativetrace/pino` |
| Spans de OpenTelemetry | `@narrativetrace/opentelemetry` |

Esta es la misma matriz que lleva el
[README raíz](../../LEAME.md#elige-tu-integración); vive también aquí como
ancla para el diagrama y el detalle de más abajo.

## La decisión

```text
¿Dónde ocurre la llamada?

Test de Vitest
   |
   +--> @narrativetrace/vitest (createNarrativeTest)

TypeScript/JavaScript puro — tú mismo construyes el objeto
   |
   +--> @narrativetrace/proxy (traceObject) directamente

Manejador de peticiones de Express / Hono
   |
   +--> el paquete de middleware correspondiente, un AsyncNarrativeContext por petición

Grafo de providers de NestJS
   |
   +--> @narrativetrace/nestjs — sin tocar ningún punto de llamada, la DI envuelve cada provider

Árbol de componentes de Angular / React
   |
   +--> @narrativetrace/angular o @narrativetrace/react

Página de navegador sin framework
   |
   +-- tiene bundler --> @narrativetrace/core-web + @narrativetrace/browser
   +-- sin bundler    --> @narrativetrace/standalone (<script> clásico)
```

Toda rama termina en el mismo mecanismo `traceObject()`/`Proxy` — un
middleware o un módulo de DI es un envoltorio que decide *cuándo* llamarlo y
*a qué* `NarrativeContext` entregárselo, nunca una segunda vía de captura.
Esto es deliberado, no un descuido: se rechazó un hook de loader
`require`/ESM porque JS no conserva los nombres de los parámetros en tiempo
de ejecución (las anotaciones ya cargan con ese peso) y la instrumentación
de loader queda completamente evitada por los bundlers, los navegadores y
los runtimes de edge, donde `Proxy` es estándar.

## Algo que comparten todos los caminos

Todos los paquetes de arriba publican a través del mismo `NarrativeContext`
/ `DualPathPipeline` (`@narrativetrace/core`); ninguno define su propia
noción de llamada capturada. Elegir una integración es una cuestión de
*cómo se envuelve la llamada y qué contexto la recibe*, nunca de qué se
registra una vez envuelta.

## Salvedades por camino

- **`traceObject` (proxy)** — envuelve un objeto a la vez; no hay requisito
  de interfaz (a diferencia de un proxy dinámico de la JVM) porque el
  `Proxy` envuelve directamente el objeto concreto. Se envuelve todo método
  alcanzable mediante búsqueda de propiedad — propio o heredado de la
  cadena de prototipos —; una llamada hecha directamente sobre la instancia
  sin envolver evita el trazado por completo, y
  los campos `#private` no pueden ser interceptados por `Proxy` en
  absoluto — una limitación del lenguaje JavaScript, no un error.
- **Express / Hono** — un `AsyncNarrativeContext.run()` por petición es lo
  que evita que las peticiones concurrentes se mezclen entre sus trazas;
  omitir esto y compartir un mismo contexto entre peticiones es un error de
  corrección, no una comodidad.
- **NestJS** — `AutoProxyModule.forRoot(...)` envuelve cada provider que se
  le entrega; hoy no existe una forma de excluir métodos individuales desde
  dentro del módulo — reduce lo que le entregas, o añade `@notTraced` en
  los métodos para los que no quieras capturar valores.
- **Trabajo entre hilos** — Node no tiene hilos que cruzar, pero el trabajo
  asíncrono igual necesita propagación explícita: `AsyncNarrativeContext`
  sigue un `await` automáticamente, pero una tarea lanzada y *no* esperada
  (un timer, una promesa fire-and-forget, un Worker) no hereda el span
  activo por sí sola. Usa `ForkJoinGroup`/`FireAndForgetGroup` para las
  tareas que controlas, o `context.snapshot()` + `snapshot.wrap(...)` para
  injertar trabajo desprendido en la traza padre a mano.
- **Navegador** — `SyncNarrativeContext` no tiene ninguna propagación
  implícita (no hay `AsyncLocalStorage` en un navegador); las llamadas
  superpuestas y no esperadas sobre un contexto compartido se corrompen
  entre sí. Usa un grupo explícito de fork/fire-and-forget por cada tarea
  concurrente, igual que en la salvedad de trabajo asíncrono de arriba.

## Límites de la plataforma

No existe en esta plataforma un camino de cero código, «envolver una app
que no puedes modificar» — no hay equivalente al agente de Java, ni está
planeado. Los decoradores `TC39` y `traceObject()` necesitan un punto de
llamada o una clase que puedas anotar; se rechazó deliberadamente un hook
de loader `require`/ESM (frágil entre versiones de Node, y completamente
evitado por los bundlers, los navegadores y los runtimes de edge, donde
`Proxy` es estándar).

## Recetas

Cada camino de la matriz tiene una receta completa y lista para copiar y
pegar en la [Guía de instalación](guia-de-instalacion.md) — esta página
responde *cuál*, esa otra responde *cómo*.
