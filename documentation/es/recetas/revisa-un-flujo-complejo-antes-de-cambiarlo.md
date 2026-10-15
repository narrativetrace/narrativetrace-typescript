<!-- source: documentation/recipes/review-a-complex-flow-before-changing-it.md blob 1f095ccd35d8 | translated: 2026-10-11 | reviewed: - -->
# Revisa un flujo complejo antes de cambiarlo

[English](../../recipes/review-a-complex-flow-before-changing-it.md) | **Español** | [Português](../../pt-BR/receitas/revise-um-fluxo-complexo-antes-de-altera-lo.md) | [简体中文](../../zh-CN/实用方案/修改复杂流程前先审查它.md)

## El problema

> Antes de cambiar el checkout, dime qué hace realmente.

Leer el código fuente responde qué *puede* hacer. Una ejecución responde qué
*hace* con estas entradas — en qué orden, con qué valores, y dónde el flujo
sale del código que estás a punto de editar. Esta página deliberadamente nunca
muestra la implementación: ese es el sentido de leer una ejecución.

## Configuración mínima

Nada más allá de la [instalación](../guia-de-instalacion.md) y
`@narrativetrace/vitest` para los artefactos de traza. Las líneas de log
necesitan el puente del logger y su cableado, exactamente como en
[Añade registro a este servicio](anade-registro-a-este-servicio.md). El nivel
de captura es un único ajuste, y `summary` es el que usa esta página junto al
`detail` por defecto:

```ts
const test = createNarrativeTest({ level: "summary" }); // or NARRATIVETRACE_LEVEL=summary
// "off" | "errors" | "summary" | "narrative" | "detail"
```

Consulta [Guía de configuración § 1](../guia-de-configuracion.md#1-niveles-de-trazado-narrativetraceconfig).

## El escenario

Una ejecución representativa del flujo — una prueba existente es la más barata
de tomar prestada, y esta es esa prueba:

```ts
// fixtures/checkout-review-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * One successful checkout, the flow documentation/recipes/review-a-complex-flow-before-changing-it.md
 * is read before changing anything.
 *
 * A fixture because the page needs the same run under two capture levels:
 * `__tests__/review-flow-recipe.test.ts` runs it in a nested Vitest process once at the default
 * level and once at `summary`. It passes either way — nothing here fails by design.
 */
test("a customer buys two keyboards", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
});
```

## La salida real

**En `detail`** (el valor por defecto), la narrativa que `createNarrativeTest`
escribió para ella en
`narrativetrace-output/checkout-review-fixture/a_customer_buys_two_keyboards.md`
(se muestra sin su frontmatter, que lleva el nombre de la ejecución, un id de
traza nuevo y una duración de reloj que cambian en cada ejecución):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.1ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.07ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.02ms #1.3
```

**En `summary`**, la misma ejecución de la misma prueba:

```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` → `"PAY-C-1234-7998"` — 0.62ms #1.2
  - `OrderRepository.save(order: )` — 0.02ms #1.3
```

**El log que escribió el mismo flujo** a través del logger propio del proyecto,
con todos sus valores:

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

**La traza estructural de esa ejecución**,
`narrativetrace-output/structural/checkout-review-fixture/a_customer_buys_two_keyboards.nt`:

```text
scenario: a customer buys two keyboards

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)
```

## Cómo leerla

**El flujo, a partir del artefacto `detail`.** `#1` es la llamada que hizo la
prueba y la única raíz: todo lo que está indentado debajo ocurrió dentro de
ella, en el orden impreso. `#1.1` reserva dos unidades antes de cobrar nada;
`#1.2` cobra 7998 — dos unidades a 3999, de modo que el precio se deriva de la
cantidad y no se pasa como argumento; `#1.3` guarda un pedido que ya lleva el
id que `#1` devuelve. Leído como una frase: este checkout reserva primero,
cobra después, guarda en tercer lugar, y el id del pedido se genera antes de
guardar. Un cambio que cobre antes de reservar, o que guarde antes de cobrar,
es un cambio a *esto*, y ahora lo sabes sin fiarte de un comentario.

**Para qué sirve cada nivel.** `detail` lleva los valores de los parámetros, y
es lo que lees mientras trabajas en el flujo. En `summary` se omite todo valor
de parámetro — suprimido en la captura, no ocultado al renderizar: el nombre se
queda, y nada lo sigue — y solo se conservan la raíz y las llamadas hoja; este
flujo tiene dos niveles de profundidad, así que ninguna llamada es intermedia y
aparecen las mismas cuatro llamadas. Un flujo más profundo pierde su parte
central. Los valores de retorno sobreviven en todos los niveles activos: el
retorno es la carga útil de una narrativa. `narrative` queda entre los dos, el
flujo completo de llamadas sin los valores. Usa `summary` donde la forma y los
resultados son lo que necesitas y los valores son un coste — una ejecución de
CI, una prueba de resistencia larga — y `off`/`errors` en producción hasta que
necesites más.

**Qué salida lee una persona y cuál un agente.** Las líneas de log son para la
persona de guardia: se intercalan con todo lo demás que registra el servicio,
llevan los valores, y están identificadas por el nombre de la traza — `solid
wand romps` — de modo que un checkout se puede extraer con grep de un fichero
concurrido. El `.nt` es para el agente y quien revisa: **sin valores por
construcción** — compáralo con la línea de log de arriba y la diferencia no es
que los valores se reemplazaran sino que nunca se escribieron.
`(customerId, sku, quantity, cardNumber)` son los *nombres* de los parámetros;
`→ value` dice que se devolvió un valor sin decir cuál. Eso es lo que lo hace
seguro de commitear, de comparar en una revisión y de entregar a un modelo: no
puede filtrar un id de cliente, y no cambia cuando cambian los datos — solo
cuando cambian las *llamadas*. Fijarlo es
[Revisa una refactorización: ¿cambió el comportamiento?](revisa-una-refactorizacion-cambio-el-comportamiento.md).

## Lo que no se captura

- **Llamadas dentro de clases sin envolver.** Se envolvieron cuatro objetos;
  una llamada entre dos clases detrás de ellos, o un método privado, nunca
  aparece. Un flujo que parece superficial puede ser profundo.
- **Lo que la integración elegida no intercepta.** El proxy solo ve las
  llamadas hechas *a través* de la referencia envuelta: una llamada interna que
  una clase se hace a sí misma (`this.helper()`) le es invisible —
  `InMemoryInventory.reserve` consulta su propio `availableUnits`, y no aparece
  ningún `#1.1.1`.
  [Eligiendo una integración](../eligiendo-una-integracion.md) recoge el
  balance de cada vía, y esta es la parte que cambia lo que puedes leer aquí.
- **El trabajo que salió del proceso.** Una llamada a un worker thread o a otro
  servicio se ejecuta en un contexto propio; la traza termina donde terminó el
  trabajo envuelto de este proceso, a menos que la identidad de la traza se
  propague ([Guía de integración de frameworks](../guia-de-integracion-de-frameworks.md)).
- **Los valores que atrapó la lista de denegación o la regla de forma del
  valor**, aquí `cardNumber` y `card`, son `[REDACTED]` tanto en el log como en
  el artefacto `detail`, y están ausentes por construcción del `.nt`.
- **Una ejecución, no el contrato.** Otra entrada toma otro camino — un sku sin
  stock nunca llega a `#1.2`.

**La skill para esto:** `narrativetrace-verify` — escribe primero la
intención, ejecuta el camino real más pequeño y lee la traza sin valores
contra esa intención antes de dar nada por terminado.
