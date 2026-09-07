<!-- source: documentation/feature-guide.md blob fdb3285d5f27 | translated: 2026-09-07 | reviewed: - -->

# NarrativeTrace TypeScript — Guía de funcionalidades

[English](../feature-guide.md) | **Español** | [Português](../pt-BR/guia-de-funcionalidades.md) | [简体中文](../zh-CN/功能指南.md)

Lo que **esta implementación** ofrece, desde la perspectiva de quien lo usa. El
catálogo canónico de funcionalidades para todas las plataformas — cada
funcionalidad de NarrativeTrace en cada plataforma, con el vocabulario
de estado autorizado — vive en
[la guía de funcionalidades canónica](https://github.com/narrativetrace/narrativetrace-java/blob/main/documentation/feature-guide.md).
Este archivo es deliberadamente delgado: registra solo lo que entregan
los paquetes de TypeScript, en qué difieren del catálogo canónico, y
qué viene a continuación para esta plataforma — el *por qué* del
mecanismo (decoradores + Proxy de ES en lugar de instrumentación por
loader-hook, la división en paquetes de plataforma, el pipeline de
buffer acotado) es un registro de ingeniería interno, que no se repite
aquí.

**Etiquetas de estado** (mismo vocabulario que la guía canónica):

- **Gratis** — publicada en este repositorio, gratuita y de código
  disponible bajo [BSL 1.1](../../LICENSE) (SPDX `BUSL-1.1`), que pasa a
  Apache 2.0 cuatro años después de cada versión. La API de
  anotaciones/decoradores, la especificación del formato de salida y
  la rúbrica de claridad son estándares abiertos Apache 2.0.
- **Pro** — publicada en el tier comercial.
- **En desarrollo** — en construcción activa; el diseño está decidido.
- **Planificada** — especificada, aún sin empezar; puede cambiar.

---

## Captura la historia de tu código (tracing esencial)

| Funcionalidad | Estado | Notas |
|---|---|---|
| Captura automática de narrativa mediante `Proxy` de ES — clase, método, argumentos, valores de retorno, tiempos, errores; cero sentencias de log | Gratis | `traceObject(service, context)` de `@narrativetrace/proxy` |
| Decoradores — `@traced` (nombres de parámetros), `@narrated` (narración con plantillas `{param}`), `@onError` (plantillas de contexto de error), `@notTraced` (ocultación) | Gratis | Decoradores TC39 stage-3, TS 5.0+; [guia-de-decoradores.md](guia-de-decoradores.md) |
| API programática para JS plano — mapas de nombres `traceObject(service, context, { method: ["paramA", …] })` y la API cruda de entrada/salida de `NarrativeContext` | Gratis | Conjunto completo de funcionalidades sin soporte de decoradores |
| Ocultación de datos sensibles — índices `@notTraced`, listas de campos `static notTraced`, lista de denegación `RedactionPolicy` por patrón de nombre (`password`, `token`, …); los valores ocultados no pueden filtrarse a través de plantillas de narración/error | Gratis | |
| Cinco niveles de captura (`off` → `errors` → `summary` → `narrative` → `detail`), modificables en tiempo de ejecución mediante `config.level`; variable de entorno `NARRATIVETRACE_LEVEL` en Node | Gratis | Los nombres de nivel difieren ligeramente de Java (`summary` frente a `FLOW`); `off` corta el circuito antes de cualquier trabajo de captura |
| Niveles con dos compuertas — el nivel de captura es independiente de los niveles del logger (configuración de winston/pino) | Gratis | ADR-008 del producto |
| Serialización inmediata de valores — los valores se convierten a texto en el momento de la llamada; sin retención de objetos, segura frente a referencias circulares, con límites de truncamiento | Gratis | Ver las preguntas frecuentes del README + el contrato de pureza en la guía de decoradores |
| Identidad de traza — `traceId`, nombres de traza legibles por humanos, `storyId`/`chapterId`, herencia de `traceparent` de W3C entre servicios | Gratis | Alineado con el esquema canónico; demo distribuida en `examples/` |

**Limitación de la plataforma (tenlo en cuenta desde el principio).**
JavaScript no conserva los nombres de los parámetros en tiempo de
ejecución — sin ayuda, los argumentos se renderizan como `arg0`,
`arg1`, …. Por eso las anotaciones de tier 2 pesan más aquí que en la
JVM: `@traced("customerId", …)` o el mapa `paramNames` es la forma de
que las trazas obtengan nombres reales, y los minificadores hacen esto
obligatorio para los bundles de producción. Ver TS-004 en el ADL de la
plataforma.

## Concurrencia y contexto asíncrono

| Funcionalidad | Estado | Notas |
|---|---|---|
| Contexto por solicitud con `AsyncLocalStorage` en Node (`AsyncNarrativeContext` en `@narrativetrace/core-node`) — las trazas nunca se mezclan entre solicitudes concurrentes | Gratis | TS-001 en el ADL de la plataforma |
| Grupos fork/join — tareas paralelas bajo una sola traza con tiempos por miembro y análisis del tiempo de espera (`ForkJoinGroup.all`) | Gratis | |
| Grupos fire-and-forget — trabajo en segundo plano que igualmente aparece en la traza (`FireAndForgetGroup`) | Gratis | |
| Detección de entrelazado secuencial-asíncrono; regla del navegador: las llamadas superpuestas sin `await` sobre un `SyncNarrativeContext` compartido requieren un grupo explícito | Gratis | [guia-de-integracion-de-frameworks.md](guia-de-integracion-de-frameworks.md) |
| Vaciado automático al apagar en Node (`beforeExit`/`SIGTERM`) para que no se pierdan los eventos finales en el buffer | Gratis | `registerAutoFlush` en core-node |

## Conéctalo a tu stack (los 19 paquetes)

| Integración | Estado | Notas |
|---|---|---|
| `core` / `core-node` / `core-web` — núcleo agnóstico de plataforma + puntos de integración de runtime para Node y navegador | Gratis | TS-005 en el ADL de la plataforma |
| `proxy` — `traceObject`, Proxy de ES + decoradores | Gratis | El punto de entrada habitual |
| `express` — middleware por solicitud, extractores a prueba de fallos, `onRequestComplete` | Gratis | |
| `hono` — middleware para edge/serverless, con paridad de finalización `finally` respecto a Express | Gratis | |
| `nestjs` — `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })` | Gratis | |
| `angular` — `provideNarrativeTrace()`, interceptor HTTP, tracing de DI | Gratis | |
| `react` — hooks/provider para trazas de componentes y de servicios | Gratis | |
| `react-router` — captura de navegación | Gratis | |
| `vitest` — fixture `narrativeTest`, archivos de traza por prueba (`md`/`mmd`/`puml`/`json`/`clarity-json`/`canonical-json`), resumen de consola + reporters de claridad | Gratis | |
| Esquema canónico 1.2 + artefactos validados por el writer | Gratis | `nt.schemaVersion` `1.2` proviene de una sola constante `SCHEMA_VERSION`; `.canonical.json` por prueba (lista plana de entradas, determinista para una captura libre de contexto); los esquemas viven en `schema/` y una prueba de conformidad valida los bytes que escribe `writeTraceOutput`, no una entrada construida a mano |
| `winston` / `pino` — eventos narrativos a través de tu logger existente, campos tipados, niveles configurables por evento | Gratis | TS-003 en el ADL de la plataforma |
| `observability` — enriquecedor de ámbito de log (`trace_id`, `code.*`, `service.*`, `nt.depth`) + middleware de solicitud | Gratis | |
| `opentelemetry` — `createOtelEventConsumer` en vivo + `TraceSpanExporter` por lotes, atributos tipados `narrative.param.*` | Gratis | |
| `browser` — renderer de consola, exportación por red, `fetch` trazado | Gratis | |
| `clarity` / `diagrams` — ver las secciones siguientes | Gratis | |

No disponible en esta plataforma: un equivalente al agente Java
(auto-instrumentación por loader/require-hook) se omite deliberadamente
— ver TS-004.

## Lee la historia (salidas)

| Funcionalidad | Estado | Notas |
|---|---|---|
| Renderers de texto indentado, Markdown y prosa | Gratis | |
| Referencias de valor de traza — deduplicación por contenido de valores capturados repetidos, con etiquetas legibles (`‹Hotel›=completo` en la primera emisión, `‹Hotel›` después) | Gratis | Las etiquetas provienen del campo de identidad del valor estructurado (name/id/description/…), nunca de uno ocultado; la igualdad de bytes certifica la coincidencia; la contención dentro de otros valores capturados cuenta y se reemplaza. Solo en Markdown |
| Deltas de valor dentro de la traza — una recaptura de la misma entidad, cambiada, se renderiza como una diferencia respecto de la referencia (`‹Dinner›′{amount: 100→92, currency: "USD"→"EUR"}`) | Gratis | «La misma entidad» es el mismo nombre de tipo estructurado más un campo de identidad igual; solo los campos escalares cambiados (cadena, número, booleano y el tipo `other` pre-convertido a cadena), nunca reconstruido a partir del árbol estructurado. Un objeto o lista anidada cambiada, un conjunto de campos distinto, o un valor sin campo de identidad se renderiza completo exactamente como antes. Una variante cambiada que a su vez se repite se define COMO la diferencia (`‹Dinner·2›=‹Dinner›′{…}`). Solo en Markdown |
| Exportación a JSON canónico — sobre versionado (`version`, `scenario`, `trace`, `events[]`) con campos `storyId`/`chapterId` | Gratis | `exportJson(tree, { scenario })` |
| Diagramas de secuencia — Mermaid + PlantUML | Gratis | `@narrativetrace/diagrams` |
| Archivos de traza por prueba + resúmenes de consola vía Vitest | Gratis | |
| Resúmenes de flujo — rutas agregadas + frecuencias por punto de entrada | Planificada (Pro) | Plan Enterprise, fase E3 |
| Diferencias de migración — comparación de comportamiento antes/después | Planificada (Pro) | Plan Enterprise, fase E3 |
| Grafos de dependencias en tiempo de ejecución (siempre invocado frente a condicional) | Planificada (Pro) | Plan Enterprise, fase E4 |

## Mejora el código (diagnóstico de claridad)

| Funcionalidad | Estado | Notas |
|---|---|---|
| Puntuación de claridad — calidad de los nombres de método/clase/parámetro a partir de la ejecución real | Gratis | [guia-de-claridad.md](guia-de-claridad.md); el README etiqueta la puntuación de claridad como **experimental** |
| Informe de claridad a nivel de suite + gate `clarity-results.json` | Gratis | A través de los reporters de Vitest |
| Vocabulario del proyecto en la puntuación — el glosario comiteado extiende los diccionarios integrados | Gratis | Un archivo, un flujo de revisión: los verbos del `glossary.json` comiteado puntúan como verbos de dominio y sus sustantivos como tokens de dominio. Se lee desde `NARRATIVETRACE_GLOSSARY_DIR` (por defecto: el directorio de trabajo), memoizado por worker; la lectura es incondicional, a diferencia de la recolección. Los niveles integrados mantienen la autoridad — los verbos genéricos, los prefijos booleanos, los placeholders sin significado, los sinónimos obsoletos y los términos `stale` nunca se promueven |
| Abreviatura aceptada — la sección `abbreviations` del glosario | Gratis | `"abbreviations": {"fx": "foreign exchange"}` a nivel raíz en el esquema 2; a un token listado no se le exige que se escriba completo, y lleva una expansión de la que aprender. Declarada, nunca inferida a partir de los tokens de los términos comiteados. De propiedad humana: la recolección nunca la escribe, el merge la respeta sin tocarla, `glossary.md` la renderiza. Un glosario que no declara ninguna se mantiene idéntico byte a byte en el esquema 1 |

## Tier Pro (comercial)

| Funcionalidad | Estado | Notas |
|---|---|---|
| Agregación de flujo de eventos — `@narrativetrace/pro-aggregate` con la fachada `EventAggregator` (árboles agregados, hotspots, rutas/tasas de error, frecuencias de métodos/errores) | Pro | Reubicado fuera del núcleo gratuito el 2026-07-12 (fase 31a de división por tier, ADR-010 del producto); el buffering/retención se mantuvo gratuito — alimenta `EventAggregator` con `pipeline.events()` |
| Servidor MCP — transporte stdio real (`@modelcontextprotocol/sdk`), 7 herramientas de análisis, conecta directamente Claude Code / Cursor | En desarrollo (Pro) | Plan Enterprise, fase E5; va más allá del módulo de solo-handlers de Java |
| Resúmenes de flujo, diferencias de migración, diagramas de grafos de dependencias | Planificada (Pro) | Fases E3–E4, ver más arriba |
| Conjunto de auditoría y cumplimiento | Planificada (Pro) | Con gate — ver la sección de auditoría de la guía canónica |

---

## Mantener esta guía honesta

Adaptado de las reglas de la guía canónica para una guía de plataforma
delgada:

1. Cada funcionalidad visible para el usuario **de esta implementación** aparece
   aquí, exactamente una vez, con un estado. Las definiciones de
   funcionalidades multiplataforma y el catálogo completo viven
   únicamente en la guía canónica — este archivo nunca repite
   funcionalidades que esta implementación no ofrece ni planea.
2. Una funcionalidad pasa a **Gratis**/**Pro** solo cuando está
   fusionada (merged), probada, y documentada en el repositorio TS
   correspondiente. «En desarrollo» significa que el diseño está
   decidido y el trabajo está programado; «Planificada» significa solo
   especificada.
3. Los cambios que añaden o promueven una funcionalidad en este
   repositorio deben actualizar este archivo en el mismo commit — y,
   cuando la funcionalidad es nueva para el producto (no solo para
   esta implementación), también la guía canónica.
4. Cuando el comportamiento de TS difiere de la descripción canónica
   (nombres de nivel, nombres de parámetros en tiempo de ejecución,
   sin instrumentación estilo agente), la diferencia se declara aquí,
   no se absorbe en silencio.
