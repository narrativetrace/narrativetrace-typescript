<!-- source: documentation/recipes/review-a-refactoring-did-behaviour-change.md blob c36dd1731483 | translated: 2026-10-11 | reviewed: - -->
# Revise uma refatoração: o comportamento mudou

[English](../../recipes/review-a-refactoring-did-behaviour-change.md) | [Español](../../es/recetas/revisa-una-refactorizacion-cambio-el-comportamiento.md) | **Português** | [简体中文](../../zh-CN/实用方案/审查重构行为变了吗.md)

## O problema

> Refatorei o checkout. Os testes estão verdes. O comportamento mudou?

Verde significa que nenhuma asserção percebeu. Uma refatoração que elimina uma
chamada em que ninguém faz asserção fica verde e errada, e esta é a forma mais
comum disso: a chamada compensatória em um caminho de erro, que nenhum teste do
caminho feliz alcança.

## Configuração mínima

Além da [instalação](../guia-de-instalacao.md) e de `@narrativetrace/vitest`, o
modo de aprovação — uma única configuração e um diretório de baselines
commitadas:

```ts
const test = createNarrativeTest({
  approval: true, // compare, don't just write — or NARRATIVETRACE_APPROVAL=true
  approvedDir: "narratives", // the default; commit it
});
```

A primeira execução de cada teste escreve `narratives/<test file>/<scenario>.received.nt`
e falha; você o lê, executa `npx narrativetrace-approve` para promover cada
arquivo revisado a `.approved.nt` e commita esses arquivos. Veja o
[Guia de configuração § 2](../guia-de-configuracao.md#2-configuração-do-vitest),
o [Formato do trace estrutural](../../structural-trace-format.md#approval-traces-end-to-end)
e [O que commitar](../o-que-commitar.md).

## O cenário

O teste fixa o caminho de erro que uma refatoração tem mais chance de quebrar —
um cartão recusado não deve salvar nenhum pedido — e passa contra as duas
versões do checkout, que é todo o problema:

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

## A saída real

A baseline commitada, em
`narratives/refactored-checkout-fixture/a_declined_card_saves_no_order.approved.nt`:

```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```

O veredito da execução refatorada — as asserções passaram, a estrutura não:

```text
Error: Trace changed against the approved trace (-1 call InventoryService.release):
 scenario: a declined card saves no order
 
 #1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
   #1.1 - InventoryService.reserve(sku, quantity)
   #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
-  #1.3 - InventoryService.release(sku, quantity)
If this change is intended, run the approve-narratives script.
```

E o arquivo que ela oferece para revisão, que `narrativetrace-approve`
promoveria:

```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
```

(A execução que produz esta página aponta `approvedDir` para dentro de
`narrativetrace-output/`, porque os testes que escrevem uma página não podem
escrever na árvore de código-fonte. No seu projeto ele é `narratives/`, ao lado
da baseline.)

## Como ler a saída

- **A primeira linha nomeia a mudança, não só o fato dela:**
  `-1 call InventoryService.release`. Uma chamada a menos, e qual.
- **O corpo do diff é a forma fixada com a linha removida marcada.** `#1`,
  `#1.1` e `#1.2` estão inalterados e sem marcação; `-  #1.3 - InventoryService.release(sku, quantity)`
  é o comportamento que saiu. Quem revisa e nunca viu este código consegue
  dizer o que a refatoração fez a partir de quatro linhas.
- **As asserções ainda passaram.** A falha é da aprovação, e esse é o ponto: o
  teste afirma que nenhum pedido é salvo, e a refatoração não quebrou isso.
  Nada no teste jamais olhou para a liberação, e nada precisava.
- **Agora decida.** Se eliminar a liberação é intencional — o chamador a
  assumiu, por exemplo —, execute `npx narrativetrace-approve`, revise o diff
  no arquivo promovido e commite-o: a nova forma passa a ser a fixada. Se não é
  intencional, você acabou de pegar o bug que
  [Ajude-me a depurar e corrigir este bug](ajude-me-a-depurar-e-corrigir-este-bug.md)
  corrigiu, voltando. Em qualquer caso, a decisão fica registrada no
  repositório, por uma pessoa, em um arquivo que quem revisa consegue ler. Um
  `.received.nt` deixado para trás depois que você resolveu a questão é o que
  `narrativetrace-doctor` reporta.
- **A baseline não tem valores**, então aprová-la não vaza nada e uma mudança
  nos dados de teste nunca a faz falhar: `(customerId, sku, quantity, cardNumber)`
  são nomes, `!! PaymentDeclinedError` é um resultado.

## O que não é capturado

- **Esta é uma comparação estrutural: as mesmas chamadas, na mesma ordem, com
  os mesmos resultados.** Não é uma prova de que todo valor é igual. Uma
  refatoração que cobra 7998 onde cobrava 3999, com todas as chamadas no lugar,
  passa por este portão — é para isso que servem as suas asserções, e o
  artefato `detail` é onde você veria isso.
- **Somente as chamadas que a integração intercepta.** Uma chamada privada
  eliminada, ou uma entre duas classes não encapsuladas, é invisível para a
  baseline exatamente como é para o trace.
- **Um teste que não é executado não é comparado.** A aprovação protege os
  cenários que você fixou; um fluxo sem teste não tem baseline, e excluir um
  teste exclui o seu portão — o `.approved.nt` dele passa a ser um órfão com o
  qual nada compara.
- **Os tempos nunca fazem parte dela.** A baseline não carrega durações, então
  não pode pegar uma mudança que apenas tornou o fluxo mais lento.

**A skill para isso:** `narrativetrace-verify` — ela lê o trace estrutural
contra a intenção da mudança e fixa o fluxo como baseline, com o seu sim.
