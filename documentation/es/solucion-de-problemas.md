<!-- source: documentation/troubleshooting.md blob 90ae6487249f | translated: 2026-09-07 | reviewed: - -->
# Solución de problemas

[English](../troubleshooting.md) | **Español** | [Português](../pt-BR/solucao-de-problemas.md) | [简体中文](../zh-CN/故障排查.md)

Síntoma → causa → solución, para los modos de fallo que la gente realmente
encuentra. Algunas entradas son la explicación completa; otras apuntan a la
guía que ya lleva el detalle en lugar de repetirlo aquí — un solo sitio por
cada hecho.

## Los parámetros aparecen como `arg0`, `arg1`

**Causa:** JavaScript no conserva los nombres de los parámetros en tiempo de
ejecución — no existe un flag del compilador que los recupere, a diferencia
del flag `-parameters` de una JVM. Sin ayuda, `traceObject()` recurre a
nombres posicionales.

**Solución:** proporciona los nombres de una forma u otra —

```ts
class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(customerId: string, productId: string, quantity: number) { /* ... */ }
}
```

o, sin decoradores:

```ts
traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });
```

Un bundle de producción minificado elimina los nombres de la misma forma,
así que esto no es solo un problema de desarrollo — consulta
[Guía de decoradores § `@traced`](guia-de-decoradores.md#traced).

## No se escribe ningún fichero de traza

**Causa:** casi siempre, el test usó el fixture que no escribe ficheros
(`narrativeTest`) en lugar del que sí los escribe (`createNarrativeTest`) —
esta implementación tiene dos fixtures de Vitest a propósito, uno solo para
aserciones y otro para artefactos. Con menos frecuencia: el árbol de traza
tenía cero raíces (no se llamó a nada a través del objeto trazado), y
`writeTraceOutput` no escribe absolutamente nada para una traza vacía por
diseño, así que una suite que no capturó ningún span no deja ningún
directorio atrás.

**Solución:** usa `createNarrativeTest` (consulta
[Primeros 10 minutos](primeros-10-minutos.md#3-añade-un-test-de-vitest)), y
comprueba que la llamada bajo test realmente pasó por el wrapper trazado —
una llamada hecha sobre la instancia sin envolver, en lugar de sobre el
objeto que devolvió `traceObject()`, no registra nada.

## Un getter o campo nunca aparece en la traza

**Causa:** `traceObject()` envuelve métodos, no propiedades arbitrarias. Los
getters y las propiedades que no son funciones pasan a través del `Proxy`
sin envolver — leer `traced.total` llama directamente al getter real y no
se captura nada. Esto es deliberado: NarrativeTrace narra *llamadas*, y la
lectura de un getter se ve idéntica a la lectura de una propiedad plana
desde el punto de vista de quien llama.

**Solución:** si el valor importa para la traza, devuélvelo desde un método
trazado, o nombra la propiedad en una plantilla `@narrated`/`@onError`
(`{order.total}`) — la resolución de ruta de propiedad *sí* invoca el
getter, una vez, en el momento del renderizado. Consulta el contrato de
pureza en la
[Guía de decoradores](guia-de-decoradores.md#el-contrato-de-pureza--efectos-secundarios-durante-el-trazado).

## Los decoradores `@traced`/`@notTraced` no se aplican o no compilan

**Causa:** los decoradores aceptan ambos dialectos — los decoradores TC39
estándar (el valor por defecto de TypeScript 5) y el dialecto heredado
`experimentalDecorators` (NestJS, Angular) — detectados en tiempo de
ejecución por la forma de la llamada. Por tanto, un fallo significa que el
entorno no compila decoradores en absoluto: TypeScript anterior a 5.0 sin
`experimentalDecorators`, una transformación que deja la sintaxis `@` sin
tocar, o JavaScript puro. En ese caso el decorador lanza un `TypeError`
que nombra esta solución, en lugar de no registrar nada silenciosamente.

**Solución:** habilita la compilación de decoradores (TypeScript 5.0+
compila el dialecto estándar sin ningún flag; `experimentalDecorators:
true` también funciona), o prescinde de los decoradores y usa la forma de
configuración en `traceObject()` — expresa todo lo que expresan los
decoradores. Consulta la [Guía de decoradores](guia-de-decoradores.md).

## La puntuación de claridad parece incorrecta

**Causa:** normalmente un nombre genérico que el análisis NLP señala —
`get`, `set`, `process`, `handle`, `data`, `info`, `temp` y similares
puntúan bajo sin importar el contexto.

**Solución:** revisa el array `issues` en el `.clarity-json` del escenario
(o el `clarity-report.md` de la suite una vez que `ClaritySuiteReporter`
esté conectado) y sustituye el nombre señalado por uno específico del
dominio (`getData()` → `fetchOrderHistory()`). Consulta la
[Guía de claridad](guia-de-claridad.md) para el modelo de puntuación
completo — renombrar `placeOrder` a `process` en
[Primeros 10 minutos § 6](primeros-10-minutos.md#6-renombra-placeorder-a-process-y-observa-cómo-cae-la-claridad)
reproduce exactamente esta caída.

## Falta la traza asíncrona, o una tarea en segundo plano nunca aparece

**Causa:** `AsyncNarrativeContext` sigue al span activo a través de un
`await`, pero una tarea que se lanza y nunca se espera (`setTimeout`, una
promesa desconectada, un job encolado) no lo hereda — no hay nada que
seguir, porque la llamada que la lanzó ya retornó.

**Solución:** envuelve el trabajo desconectado con
`ForkJoinGroup`/`FireAndForgetGroup`, o injértalo a mano con
`context.snapshot()` + `snapshot.wrap(fn)`. Consulta
[Eligiendo una integración § Salvedades por camino](eligiendo-una-integracion.md#salvedades-por-camino).

## `captureTrace()` devuelve un árbol vacío o parcial desde otra tarea asíncrona

**Causa:** la captura está acotada a la instancia de contexto, no a un hilo
como en una implementación de la JVM — pero un `SyncNarrativeContext` (navegador) no
tiene ninguna propagación implícita en absoluto, así que dos llamadas
solapadas sin esperar (`await`) sobre el mismo contexto corrompen los spans
de la otra en lugar de simplemente faltar uno.

**Solución:** en Node, usa `AsyncNarrativeContext`. En un navegador, o para
trabajo solapado en cualquier entorno, usa un grupo explícito de
fork/fire-and-forget por cada tarea concurrente en lugar de compartir un
solo contexto entre llamadas sin esperar.

## Una captura imprimió «NarrativeTrace dropped N events»

**Causa:** no es un fallo — el anillo de eventos (`BufferedEventConsumer`)
es un búfer de tamaño fijo, `8,192` eventos por defecto en
`createNarrativeTest`, y un test que traza más llamadas de las que caben
descarta los eventos más antiguos en lugar de crecer sin límite o bloquear
a quien llama. El mensaje exacto:

```text
⚠️ NarrativeTrace dropped 16 events: the capture buffer (4) overflowed, so this narrative is incomplete. Raise it with createNarrativeTest({ bufferCapacity: 32 }).
```

**Solución:** sube `bufferCapacity` al valor que indica el mensaje, o
reduce lo que traza el test. Consulta
[Guía de configuración § 8](guia-de-configuracion.md#8-almacenamiento-en-búfer-del-pipeline-de-eventos-bufferedeventconsumer)
para la tabla de capacidad frente a latencia y cómo dimensionarla para un
contexto de vida más larga.

## `@notTraced` oculta el parámetro pero un campo anidado sigue apareciendo

**Causa:** la ocultación por índice de parámetro (`@notTraced(i)`) y la
ocultación a nivel de campo (`static notTraced = [...]`) son dos
declaraciones distintas. La ocultación por índice deja en blanco todo el
argumento; un campo dentro de un argumento *no ocultado* se renderiza campo
por campo, a menos que ese campo en sí esté en la lista de denegación por
nombre o declarado.

**Solución:** añade el campo a la propia lista `static notTraced` de la
clase:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}
```

Contrato completo, incluyendo qué hace una plantilla de narración con una
ruta ocultada: [Privacidad y ocultación](privacidad-y-ocultacion.md).

## Cómo se comporta NarrativeTrace junto a otro proxy o interceptor

No es un reporte de bug — es una pregunta de diseño que surge cada vez que
un servicio ya está envuelto por otra cosa (un contenedor de DI, otro
`Proxy`, una biblioteca de contratos). NarrativeTrace narra únicamente los
cruces de frontera de negocio, y cuál wrapper queda "más externo" nunca
cambia el resultado de negocio ni la excepción que llega a la narración —
consulta las
[preguntas frecuentes del README](../../LEAME.md#cómo-interactúa-narrativetrace-con-otras-bibliotecas-que-envuelven-métodos-aop-proxies-bibliotecas-de-contratos)
para el contrato de coexistencia completo.
