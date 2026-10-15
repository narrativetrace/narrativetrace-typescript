<!-- source: documentation/recipes/help-me-debug-and-fix-this-bug.md blob 0cf3f263aa49 | translated: 2026-10-11 | reviewed: - -->
# Ayúdame a depurar y arreglar este error

[English](../../recipes/help-me-debug-and-fix-this-bug.md) | **Español** | [Português](../../pt-BR/receitas/ajude-me-a-depurar-e-corrigir-este-bug.md) | [简体中文](../../zh-CN/实用方案/帮我调试并修复这个缺陷.md)

## El problema

> Ayúdame a depurar y arreglar este error: a un cliente le rechazaron la
> tarjeta y el teclado nunca volvió al stock.

El error que tiene el equipo es `PaymentDeclinedError: card declined by the
issuer`, que no es el bug. El bug es lo que hizo el checkout *después*.

## Configuración mínima

Nada más allá de la [instalación](../guia-de-instalacion.md) y
`@narrativetrace/vitest`: su fixture `createNarrativeTest` escribe una traza por
prueba sin configuración. El último paso de esta página — fijar el flujo
corregido — activa el modo de aprobación, que es un único ajuste, en el código
o en el entorno:

```ts
const test = createNarrativeTest({ approval: true }); // or NARRATIVETRACE_APPROVAL=true
```

Consulta [Guía de configuración § 2](../guia-de-configuracion.md#2-configuración-de-vitest),
[Formato de traza estructural](../../structural-trace-format.md#approval-traces-end-to-end)
y [Qué commitear](../que-commitear.md).

## El escenario

Reprodúcelo en la prueba más pequeña que pueda fallar por este motivo — una
tarjeta rechazada debe dejar el stock tal como lo encontró:

```ts
// fixtures/declined-payment-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The reproduction documentation/recipes/help-me-debug-and-fix-this-bug.md is written around: a
 * declined card must leave the stock as it found it.
 *
 * The second test is the same reproduction against the checkout as it stood before the fix
 * (`OrderServiceWithoutRelease`), so the page's "before" trace comes from a real failing run rather
 * than from prose. It FAILS by design, which is why this file is a fixture: the project's own
 * config never collects `*-fixture.ts`, and `__tests__/debug-recipe.test.ts` runs it in a nested
 * Vitest process and asserts on its verdict.
 */
test("the stock is released when the card is declined", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});

test("the stock is released when the card is declined before the fix", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(
    narrativeContext,
    ({ inventory, payments, orders }) =>
      new OrderServiceWithoutRelease(inventory, payments, orders),
  );

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});
```

La segunda prueba ejecuta la misma reproducción contra el checkout tal como
estaba antes del arreglo, que es la ejecución de la que sale la primera traza
de abajo:

```ts
// src/order-service-without-release.ts
import type { InventoryService } from "./inventory.js";
import type { OrderService } from "./order-service.js";
import type { Order, OrderRepository } from "./orders.js";
import type { PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/**
 * The same checkout with no release path: a declined charge leaves the reservation behind.
 *
 * INTENT: two recipe pages need this code to RUN, not to be described —
 * `documentation/recipes/help-me-debug-and-fix-this-bug.md` (the bug, before its fix) and
 * `documentation/recipes/review-a-refactoring-did-behaviour-change.md` (the refactoring that drops
 * the release call while every test stays green). It is kept beside `DefaultOrderService` rather
 * than reconstructed by a flag, so each page embeds real source and each run is a real run.
 *
 * @llmNote Never the implementation to copy: `DefaultOrderService` is. The tests wrap both under
 * the class name `OrderService`, so one approved baseline is comparable across the two.
 */
export class OrderServiceWithoutRelease implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    this.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
```

## La salida real

La narrativa propia de la ejecución fallida — el artefacto Markdown que
`createNarrativeTest` escribió para la prueba que falla, bajo
`narrativetrace-output/declined-payment-fixture/`, sin su frontmatter, que
lleva el nombre de la ejecución, un id de traza nuevo y una duración de reloj
que cambian en cada ejecución:

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.36ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.02ms #1.2
```

El arreglo es un único `catch`: liberar lo que se reservó y luego dejar que el
rechazo se propague como antes.

```ts
// src/order-service.ts
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/** Places an order and returns its id. */
export interface OrderService {
  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string;
}

/** The checkout: reserve the stock, charge the card, save the order — and release on a decline. */
export class DefaultOrderService implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    try {
      this.payments.charge(customerId, amountCents, cardNumber);
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        this.inventory.release(sku, quantity);
      }
      throw error;
    }
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
```

La misma reproducción, ahora en verde, contra el checkout corregido:

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.23ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.24ms #1.3
```

Con el modo de aprobación activado, la primera ejecución de la prueba corregida
escribe su estructura sin valores junto a las trazas aprobadas como
`.received.nt`; `npx narrativetrace-approve` la promueve a `.approved.nt`, el
baseline que se commitea, que pasa a ser la forma de este flujo:

```text
scenario: the stock is released when the card is declined

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```

## Cómo leerla

En la traza fallida:

- `#1 OrderService.placeOrder` termina con `❌ PaymentDeclinedError` y sin
  valor de retorno: la llamada que hizo el cliente no se completó.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` no tiene `❌` ni
  valor — un método sin nada que devolver que se completó. Ahora hay dos
  unidades retenidas.
- `#1.2 PaymentService.charge` lanzó una excepción. Sus parámetros dicen qué se
  intentó: `amountCents: 7998` por las dos unidades, `card: [REDACTED]`.
- **Nada sigue a `#1.2`.** `#1` pasa directamente del cobro a su propio fallo,
  así que las dos unidades que `#1.1` reservó siguen retenidas. Esa ausencia es
  el bug, y el mensaje de la excepción nunca la menciona — la traza es lo que
  hace visible una omisión, porque muestra el flujo entero y no solo la línea
  que lanzó. La aserción fallida dice lo mismo desde el otro lado,
  `expected 3 to be 5`, y no dice nada del porqué.

En la traza que pasa: `#1.3 InventoryService.release(sku: "SKU-KB", quantity: 2)`
está ahora entre el cobro y el fallo. `#1` sigue terminando en el rechazo —
es lo correcto, la tarjeta del cliente de verdad fue rechazada — y el stock ha
vuelto.

En el baseline: el `.nt` aprobado lleva las mismas cuatro llamadas con los
*nombres* de sus parámetros y ningún valor, por lo que se puede commitear y
leer en una revisión. `#1.3` es ahora parte de la forma fijada: un cambio
posterior que elimine la liberación hace que una prueba en verde falle con un
diff que nombra `InventoryService.release`, de modo que este bug no puede
volver en silencio. Eso es
[Revisa una refactorización: ¿cambió el comportamiento?](revisa-una-refactorizacion-cambio-el-comportamiento.md).

## Lo que no se captura

- **La traza muestra las llamadas que ocurrieron, no las que debieron
  ocurrir.** El `release` que faltaba es una ausencia que el lector infiere del
  flujo; nada en el artefacto dice «falta una llamada». Lo que añade el
  baseline es la comparación que convierte una ausencia en un fallo de build —
  una sola vez.
- **Una excepción tragada dentro de código sin envolver es invisible.** Solo
  aparecen los cuatro objetos envueltos. Un `try`/`catch` dentro de
  `DefaultOrderService` que se tragara el rechazo y retornara con normalidad se
  vería como una llamada completada.
- **El número de tarjeta no se puede recuperar** de la traza ni del log. Se
  oculta en la captura, aquí por valor — el parámetro se llama `card`, así que
  la lista de denegación por nombre nunca lo vio, y el número es válido según
  Luhn.
- **Los tiempos no son prueba de un problema de rendimiento** en una prueba tan
  pequeña: una única llamada trazada en un proceso nuevo mide el calentamiento,
  no el código.

**La skill para esto:** `narrativetrace-debug` — reproduce el síntoma con la
entrada más pequeña, nombra el span donde el valor o la llamada diverge, lo
arregla ahí y fija el flujo como prueba de regresión con tu aprobación.
