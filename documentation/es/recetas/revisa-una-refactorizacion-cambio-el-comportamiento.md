<!-- source: documentation/recipes/review-a-refactoring-did-behaviour-change.md blob c36dd1731483 | translated: 2026-10-11 | reviewed: - -->
# Revisa una refactorización: ¿cambió el comportamiento?

[English](../../recipes/review-a-refactoring-did-behaviour-change.md) | **Español** | [Português](../../pt-BR/receitas/revise-uma-refatoracao-o-comportamento-mudou.md) | [简体中文](../../zh-CN/实用方案/审查重构行为变了吗.md)

## El problema

> Refactoricé el checkout. Las pruebas están en verde. ¿Cambió el comportamiento?

Verde significa que ninguna aserción se dio cuenta. Una refactorización que
elimina una llamada sobre la que nadie hace aserciones está en verde y mal, y
esta es su forma más habitual: la llamada compensatoria en un camino de error,
a la que no llega ninguna prueba del camino feliz.

## Configuración mínima

Además de la [instalación](../guia-de-instalacion.md) y `@narrativetrace/vitest`,
el modo de aprobación — un único ajuste, y un directorio de baselines
commiteados:

```ts
const test = createNarrativeTest({
  approval: true, // compare, don't just write — or NARRATIVETRACE_APPROVAL=true
  approvedDir: "narratives", // the default; commit it
});
```

La primera ejecución de cada prueba escribe
`narratives/<test file>/<scenario>.received.nt` y falla; lo lees, ejecutas
`npx narrativetrace-approve` para promover cada fichero revisado a
`.approved.nt`, y commiteas esos ficheros. Consulta
[Guía de configuración § 2](../guia-de-configuracion.md#2-configuración-de-vitest),
[Formato de traza estructural](../../structural-trace-format.md#approval-traces-end-to-end)
y [Qué commitear](../que-commitear.md).

## El escenario

La prueba fija el camino de error que una refactorización tiene más
probabilidades de romper — una tarjeta rechazada no debe guardar ningún pedido
— y pasa contra las dos versiones del checkout, que es todo el problema:

```ts
// fixtures/refactored-checkout-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { DefaultOrderService } from "../src/order-service.js";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { type CheckoutFactory, tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * Which version of the checkout this run wires: the one that releases the reservation when the
 * charge is declined, or the refactoring that dropped that call. An environment variable, because
 * one build has to run both — in your project the refactoring is an edit to one file and this
 * switch does not exist.
 */
const refactoringDroppedTheRelease = process.env.RECIPE_REFACTORING_DROPPED_THE_RELEASE === "true";

const checkoutVersion: CheckoutFactory = ({ inventory, payments, orders }) =>
  refactoringDroppedTheRelease
    ? new OrderServiceWithoutRelease(inventory, payments, orders)
    : new DefaultOrderService(inventory, payments, orders);

/**
 * The test documentation/recipes/review-a-refactoring-did-behaviour-change.md pins: a declined card
 * must save no order. It passes before and after the refactoring — which is the whole point of the
 * page — so only the approved structure can object.
 *
 * A fixture because `__tests__/refactoring-recipe.test.ts` runs it twice under approval mode, once
 * per version of the checkout, in nested Vitest processes, and reads the verdicts.
 */
test("a declined card saves no order", ({ narrativeContext }) => {
  const { checkout, repository } = tracedCheckout(narrativeContext, checkoutVersion);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
});
```

## La salida real

El baseline commiteado, en
`narratives/refactored-checkout-fixture/a_declined_card_saves_no_order.approved.nt`:

```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```

El veredicto de la ejecución refactorizada — las aserciones pasaron, la
estructura no:

```text
Error: Trace changed against the approved trace (-1 call InventoryService.release):
 scenario: a declined card saves no order
 
 #1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
   #1.1 - InventoryService.reserve(sku, quantity)
   #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
-  #1.3 - InventoryService.release(sku, quantity)
If this change is intended, run the approve-narratives script.
```

Y el fichero que ofrece para su revisión, que `narrativetrace-approve`
promovería:

```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
```

(La ejecución que produce esta página apunta `approvedDir` bajo
`narrativetrace-output/`, porque las pruebas que escriben una página no pueden
escribir en el árbol de código fuente. En tu proyecto es `narratives/`, junto
al baseline.)

## Cómo leerla

- **La primera línea nombra el cambio, no solo el hecho:**
  `-1 call InventoryService.release`. Una llamada menos, y cuál.
- **El cuerpo del diff es la forma fijada con la línea eliminada marcada.**
  `#1`, `#1.1` y `#1.2` no cambian y no están marcados;
  `-  #1.3 - InventoryService.release(sku, quantity)` es el comportamiento que
  se fue. Quien revisa y nunca ha visto este código puede saber qué hizo la
  refactorización a partir de cuatro líneas.
- **Las aserciones siguieron pasando.** El fallo es el de la aprobación, y ese
  es el punto: la prueba afirma que no se guarda ningún pedido, y la
  refactorización no rompió eso. Nada en la prueba miró nunca la liberación, y
  nada tenía por qué hacerlo.
- **Ahora decide.** Si eliminar la liberación es intencional — el llamador se
  hizo cargo, por ejemplo — ejecuta `npx narrativetrace-approve`, revisa el
  diff en el fichero promovido y commitéalo: la nueva forma pasa a ser la
  fijada. Si no es intencional, acabas de atrapar el bug que
  [Ayúdame a depurar y arreglar este error](ayudame-a-depurar-y-arreglar-este-error.md)
  corrigió, cuando intentaba volver. En cualquier caso, la decisión queda
  registrada en el repositorio, por una persona, en un fichero que quien revisa
  puede leer. Un `.received.nt` que se queda atrás una vez resuelto es lo que
  reporta `narrativetrace-doctor`.
- **El baseline no tiene valores**, así que aprobarlo no filtra nada y un
  cambio en los datos de prueba nunca lo hace fallar:
  `(customerId, sku, quantity, cardNumber)` son nombres,
  `!! PaymentDeclinedError` es un resultado.

## Lo que no se captura

- **Esta es una comparación estructural: las mismas llamadas, en el mismo
  orden, con los mismos resultados.** No es una prueba de que cada valor sea
  igual. Una refactorización que cobra 7998 donde cobraba 3999, con todas las
  llamadas en su sitio, pasa esta puerta — para eso están tus aserciones, y el
  artefacto `detail` es donde lo verías.
- **Solo las llamadas que la integración intercepta.** Una llamada privada
  eliminada, o una entre dos clases sin envolver, es invisible para el baseline
  exactamente igual que para la traza.
- **Una prueba que no se ejecuta no se compara.** La aprobación protege los
  escenarios que fijaste; un flujo sin prueba no tiene baseline, y borrar una
  prueba borra su puerta — su `.approved.nt` queda entonces huérfano, sin nada
  que lo compare.
- **Los tiempos nunca forman parte.** El baseline no lleva duraciones, así que
  no puede atrapar un cambio que solo hizo el flujo más lento.

**La skill para esto:** `narrativetrace-verify` — lee la traza estructural
contra la intención del cambio y fija el flujo como baseline con tu
aprobación.
