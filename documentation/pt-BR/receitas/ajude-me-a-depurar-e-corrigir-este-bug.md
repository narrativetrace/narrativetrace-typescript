<!-- source: documentation/recipes/help-me-debug-and-fix-this-bug.md blob 0cf3f263aa49 | translated: 2026-10-11 | reviewed: - -->
# Ajude-me a depurar e corrigir este bug

[English](../../recipes/help-me-debug-and-fix-this-bug.md) | [Español](../../es/recetas/ayudame-a-depurar-y-arreglar-este-error.md) | **Português** | [简体中文](../../zh-CN/实用方案/帮我调试并修复这个缺陷.md)

## O problema

> Ajude-me a depurar e corrigir este bug: o cartão de um cliente foi recusado e
> o teclado nunca voltou ao estoque.

O erro que a equipe tem é `PaymentDeclinedError: card declined by the
issuer`, que não é o bug. O bug é o que o checkout fez *depois* dele.

## Configuração mínima

Nada além da [instalação](../guia-de-instalacao.md) e de
`@narrativetrace/vitest`: a fixture `createNarrativeTest` escreve um trace por
teste, sem nenhuma configuração. O último passo desta página — fixar o fluxo
corrigido — liga o modo de aprovação, que é uma única configuração, no código
ou no ambiente:

```ts
const test = createNarrativeTest({ approval: true }); // or NARRATIVETRACE_APPROVAL=true
```

Veja o [Guia de configuração § 2](../guia-de-configuracao.md#2-configuração-do-vitest),
o [Formato do trace estrutural](../../structural-trace-format.md#approval-traces-end-to-end)
e [O que commitar](../o-que-commitar.md).

## O cenário

Reproduza-o no menor teste que pode falhar por esse motivo — um cartão
recusado deve deixar o estoque como o encontrou:

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

O segundo teste executa a mesma reprodução contra o checkout como ele era
antes da correção, e é dessa execução que vem o primeiro trace abaixo:

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

## A saída real

A narrativa da própria execução que falhou — o artefato Markdown que
`createNarrativeTest` escreveu para o teste que falhou, em
`narrativetrace-output/declined-payment-fixture/`, sem o frontmatter, que
carrega o nome da execução, um id de trace novo e uma duração de relógio que
mudam a cada execução:

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.36ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.02ms #1.2
```

A correção é um único `catch`: liberar o que foi reservado e depois deixar a
recusa se propagar como antes.

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

A mesma reprodução, agora passando, contra o checkout corrigido:

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.23ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.24ms #1.3
```

Com o modo de aprovação ligado, a primeira execução do teste corrigido escreve
sua estrutura sem valores ao lado dos traces aprovados como `.received.nt`;
`npx narrativetrace-approve` o promove a `.approved.nt`, a baseline commitada,
que passa a ser a forma deste fluxo:

```text
scenario: the stock is released when the card is declined

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```

## Como ler a saída

No trace com falha:

- `#1 OrderService.placeOrder` termina com `❌ PaymentDeclinedError` e sem
  valor de retorno: a chamada que o cliente fez não foi concluída.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` não tem `❌` nem
  valor — um método sem nada a retornar que terminou. Duas unidades estão agora
  retidas.
- `#1.2 PaymentService.charge` lançou uma exceção. Seus parâmetros dizem o que
  foi tentado: `amountCents: 7998` pelas duas unidades, `card: [REDACTED]`.
- **Nada vem depois de `#1.2`.** `#1` vai direto da cobrança para a própria
  falha, então as duas unidades que `#1.1` reservou continuam retidas. Essa
  ausência é o bug, e a mensagem da exceção nunca a menciona — o trace é o que
  torna uma omissão visível, porque mostra o fluxo inteiro e não só a linha que
  lançou a exceção. A asserção que falha diz a mesma coisa pelo outro lado,
  `expected 3 to be 5`, e não diz nada sobre o porquê.

No trace que passa: `#1.3 InventoryService.release(sku: "SKU-KB", quantity: 2)`
agora fica entre a cobrança e a falha. `#1` ainda termina na recusa — isso está
correto, o cartão do cliente realmente foi recusado — e o estoque voltou.

Na baseline: o `.nt` aprovado carrega as mesmas quatro chamadas com os *nomes*
dos parâmetros e nenhum valor, e é por isso que pode ser commitado e lido em
uma revisão. `#1.3` agora faz parte da forma fixada: uma mudança posterior que
elimine a liberação faz um teste que passava falhar com um diff que nomeia
`InventoryService.release`, de modo que este bug não pode voltar em silêncio.
Isso é [Revise uma refatoração: o comportamento mudou](revise-uma-refatoracao-o-comportamento-mudou.md).

## O que não é capturado

- **O trace mostra as chamadas que aconteceram, não as que deveriam ter
  acontecido.** O `release` ausente é uma ausência que o leitor infere do
  fluxo; nada no artefato diz "falta uma chamada". O que a baseline acrescenta
  é a comparação que transforma uma ausência em uma falha de build — uma vez.
- **Uma exceção engolida dentro de código não encapsulado é invisível.**
  Somente os quatro objetos encapsulados aparecem. Um `try`/`catch` dentro de
  `DefaultOrderService` que consumisse a recusa e retornasse normalmente
  apareceria como uma chamada concluída.
- **O número do cartão não pode ser recuperado** a partir do trace nem do log.
  Ele é ocultado na captura, aqui pelo valor — o parâmetro se chama `card`,
  então a lista de bloqueio por nome nunca o viu, e o número é válido pelo
  algoritmo de Luhn.
- **Os tempos não são evidência de um problema de desempenho** em um teste tão
  pequeno: uma única chamada com trace em um processo novo mede o aquecimento,
  não o código.

**A skill para isso:** `narrativetrace-debug` — ela reproduz o sintoma com a
menor entrada, nomeia o span em que o valor ou a chamada diverge, corrige ali e
fixa o fluxo como um teste de regressão, com a sua aprovação.
