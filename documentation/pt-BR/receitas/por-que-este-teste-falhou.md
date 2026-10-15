<!-- source: documentation/recipes/why-did-this-test-fail.md blob 3b848ef13def | translated: 2026-10-11 | reviewed: - -->
# Por que este teste falhou

[English](../../recipes/why-did-this-test-fail.md) | [Español](../../es/recetas/por-que-fallo-esta-prueba.md) | **Português** | [简体中文](../../zh-CN/实用方案/这个测试为什么失败了.md)

## O problema

> Por que este teste falhou?

Um teste do checkout está vermelho. A asserção diz o que não bateu; ela não diz
o que o código fez até chegar ali, que é justamente a parte de que você precisa
para saber se o errado é o código ou a expectativa.

## Configuração mínima

Nada além da [instalação](../guia-de-instalacao.md) e de
`@narrativetrace/vitest`. A fixture `createNarrativeTest` escreve uma narrativa
por teste, sem nenhuma configuração — inclusive para um teste que falha, que é
o caso desta página. Os arquivos ficam em
`narrativetrace-output/<test file>/<scenario>.md`: o nome do arquivo de teste
sem a extensão, depois o título do teste com cada espaço trocado por um
underscore.

## O cenário

O teste que falha:

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

## A saída real

O que o runner reportou:

```text
AssertionError: expected 'ORD-C-1234-SKU-KB-2' to be 'ORD-C-1234-SKU-KB-1' // Object.is equality
```

E o que a mesma execução escreveu ao lado, em
`narrativetrace-output/stale-expectation-fixture/the_customer_gets_an_order_id_for_their_keyboards.md`
(mostrado sem o frontmatter, que carrega o nome da execução, um id de trace
novo e uma duração de relógio que mudam a cada execução):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.15ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.08ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.03ms #1.3
```

## Como ler a saída

Leia a narrativa de cima para baixo, contra a asserção, um span por vez:

- `#1 OrderService.placeOrder(... quantity: 2 ...) → "ORD-C-1234-SKU-KB-2"`.
  O valor que a asserção rejeitou está bem ali, assim como a entrada que o
  produziu: a chamada pediu **dois** teclados.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — duas unidades
  reservadas, de acordo com a chamada.
- `#1.2 PaymentService.charge(..., amountCents: 7998, ...)` — 7998 são duas
  unidades a 3999, então o preço também concorda com a quantidade.
- `#1.3 OrderRepository.save(order: {... "quantity": 2 ...})` — o que foi
  armazenado concorda com o que foi pedido.
- Nenhum span leva um `❌`: a asserção falhou, o código não. Todos os spans
  terminaram e nada lançou exceção — a execução está vermelha por causa do que
  o *teste* disse, e isso só a mensagem do runner reporta.

Todos os spans concordam entre si e com a chamada que os iniciou. A expectativa
— `ORD-C-1234-SKU-KB-1` — é a única coisa na execução que fala em um teclado,
então é ela que está desatualizada; a fixture contra a qual foi escrita mudou
desde então para pedir dois. A correção está no teste.

A leitura oposta é a outra receita: quando um span *discorda* da intenção — uma
quantidade que muda entre duas chamadas, uma chamada que deveria ter vindo em
seguida e não veio —, o código está errado, e
[Ajude-me a depurar e corrigir este bug](ajude-me-a-depurar-e-corrigir-este-bug.md)
é esse passo a passo.

## O que não é capturado

- **Somente a execução daquele teste.** A narrativa é escrita por teste, por
  execução. Uma falha que acontece uma vez a cada vinte execuções exige que uma
  dessas execuções seja a que escreveu o arquivo; cada execução sobrescreve o
  arquivo da anterior, e o `.nt` sem valores de uma execução que falha não é
  atualizado de forma alguma.
- **A asserção não está no trace.** As duas saídas acima vêm de dois lugares —
  o runner reportou a divergência, a fixture escreveu o fluxo — e nada as
  correlaciona automaticamente além do nome do cenário.
- **Um valor que um teste calculou mas nunca passou a uma chamada com trace é
  invisível.** O trace carrega parâmetros e valores de retorno de chamadas
  encapsuladas, não variáveis locais.
- **Os tempos de uma execução com falha não significam nada.** A execução
  deixou de ser representativa no momento em que a asserção lançou a exceção.

**A skill para isso:** `narrativetrace-debug` — ela parte do sintoma, lê o
primeiro span em que um valor diverge e o nomeia pelo id do span.
