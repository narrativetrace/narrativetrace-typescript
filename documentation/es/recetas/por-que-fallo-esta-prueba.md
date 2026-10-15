<!-- source: documentation/recipes/why-did-this-test-fail.md blob 3b848ef13def | translated: 2026-10-11 | reviewed: - -->
# Por qué falló esta prueba

[English](../../recipes/why-did-this-test-fail.md) | **Español** | [Português](../../pt-BR/receitas/por-que-este-teste-falhou.md) | [简体中文](../../zh-CN/实用方案/这个测试为什么失败了.md)

## El problema

> ¿Por qué falló esta prueba?

Una prueba del checkout está en rojo. La aserción dice qué no coincidió; no
dice qué hizo el código por el camino, que es la parte que necesitas para saber
si lo equivocado es el código o la expectativa.

## Configuración mínima

Nada más allá de la [instalación](../guia-de-instalacion.md) y
`@narrativetrace/vitest`. El fixture `createNarrativeTest` escribe una
narrativa por prueba sin configuración — también para una prueba que falla, que
es el caso de esta página. Los ficheros quedan en
`narrativetrace-output/<test file>/<scenario>.md`: el nombre del fichero de
prueba sin su extensión, y luego el título de la prueba con cada espacio
convertido en guion bajo.

## El escenario

La prueba que falla:

```ts
// fixtures/stale-expectation-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The failing checkout test documentation/recipes/why-did-this-test-fail.md is read through. It
 * fails on an assertion, by design, which is why it is a fixture: the project's own config never
 * collects `*-fixture.ts`, and `__tests__/test-failure-recipe.test.ts` runs it in a nested Vitest
 * process and writes down what the run reported.
 *
 * @llmNote Nothing here says which side is wrong — that is the reader's exercise, and the
 * narrative the run writes is what settles it. Do not add a comment that gives it away.
 */
test("the customer gets an order id for their keyboards", ({ narrativeContext }) => {
  const { checkout } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-1");
});
```

## La salida real

Lo que informó el runner:

```text
AssertionError: expected 'ORD-C-1234-SKU-KB-2' to be 'ORD-C-1234-SKU-KB-1' // Object.is equality
```

Y lo que la misma ejecución escribió a su lado, en
`narrativetrace-output/stale-expectation-fixture/the_customer_gets_an_order_id_for_their_keyboards.md`
(se muestra sin su frontmatter, que lleva el nombre de la ejecución, un id de
traza nuevo y una duración de reloj que cambian en cada ejecución):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.15ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.08ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.03ms #1.3
```

## Cómo leerla

Lee la narrativa de arriba abajo contra la aserción, un span cada vez:

- `#1 OrderService.placeOrder(... quantity: 2 ...) → "ORD-C-1234-SKU-KB-2"`.
  El valor que la aserción rechazó está ahí mismo, y también la entrada que lo
  produjo: la llamada pedía **dos** teclados.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — dos unidades
  reservadas, coherente con la llamada.
- `#1.2 PaymentService.charge(..., amountCents: 7998, ...)` — 7998 son dos
  unidades a 3999, así que el precio también concuerda con la cantidad.
- `#1.3 OrderRepository.save(order: {... "quantity": 2 ...})` — lo que se
  almacenó concuerda con lo que se pidió.
- Ningún span lleva un `❌`: falló la aserción, no el código. Todos los spans
  se completaron y nada lanzó una excepción — la ejecución está en rojo por lo
  que dijo la *prueba*, que solo informa el mensaje del runner.

Cada span concuerda con todos los demás y con la llamada que los inició. La
expectativa — `ORD-C-1234-SKU-KB-1` — es lo único de la ejecución que dice un
teclado, así que es lo que está desactualizado; el fixture contra el que se
escribió cambió desde entonces para pedir dos. El arreglo está en la prueba.

La lectura contraria es la otra receta: cuando un span *discrepa* de la
intención — una cantidad que cambia entre dos llamadas, una llamada que debía
seguir y no lo hizo — el código está mal, y
[Ayúdame a depurar y arreglar este error](ayudame-a-depurar-y-arreglar-este-error.md)
es ese recorrido.

## Lo que no se captura

- **Solo la ejecución de esa prueba.** La narrativa se escribe por prueba y por
  ejecución. Un fallo que ocurre una de cada veinte ejecuciones necesita que
  una de esas ejecuciones sea la que escribió el fichero; cada ejecución
  sobrescribe el fichero de la anterior, y el `.nt` sin valores de una
  ejecución fallida no se actualiza en absoluto.
- **La aserción no está en la traza.** Las dos salidas de arriba vienen de dos
  sitios — el runner informó la discrepancia, el fixture escribió el flujo — y
  nada las correlaciona automáticamente más allá del nombre del escenario.
- **Un valor que una prueba calculó pero nunca pasó a una llamada trazada es
  invisible.** La traza lleva los parámetros y los valores de retorno de las
  llamadas envueltas, no las variables locales.
- **Los tiempos en una ejecución fallida no significan nada.** La ejecución
  dejó de ser representativa en el momento en que la aserción lanzó.

**La skill para esto:** `narrativetrace-debug` — parte del síntoma, lee el
primer span donde un valor diverge y lo nombra por su id de span.
