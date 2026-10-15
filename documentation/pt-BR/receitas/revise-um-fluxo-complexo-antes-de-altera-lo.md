<!-- source: documentation/recipes/review-a-complex-flow-before-changing-it.md blob 1f095ccd35d8 | translated: 2026-10-11 | reviewed: - -->
# Revise um fluxo complexo antes de alterá-lo

[English](../../recipes/review-a-complex-flow-before-changing-it.md) | [Español](../../es/recetas/revisa-un-flujo-complejo-antes-de-cambiarlo.md) | **Português** | [简体中文](../../zh-CN/实用方案/修改复杂流程前先审查它.md)

## O problema

> Antes de alterar o checkout, diga-me o que ele realmente faz.

Ler o código-fonte responde o que ele *pode* fazer. Uma execução responde o que
ele *faz* com estas entradas — em que ordem, com quais valores e onde o fluxo
sai do código que você está prestes a editar. Esta página deliberadamente nunca
mostra a implementação: esse é o ponto de ler uma execução.

## Configuração mínima

Nada além da [instalação](../guia-de-instalacao.md) e de
`@narrativetrace/vitest` para os artefatos de trace. As linhas de log precisam
da ponte do logger e da sua configuração, exatamente como em
[Adicione logs a este serviço](adicione-logs-a-este-servico.md). O nível de
captura é uma única configuração, e `summary` é o que esta página usa ao lado
do `detail` padrão:

```ts
const test = createNarrativeTest({ level: "summary" }); // or NARRATIVETRACE_LEVEL=summary
// "off" | "errors" | "summary" | "narrative" | "detail"
```

Veja o [Guia de configuração § 1](../guia-de-configuracao.md#1-níveis-de-tracing-narrativetraceconfig).

## O cenário

Uma execução representativa do fluxo — um teste existente é o mais barato de
emprestar, e este é esse teste:

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

## A saída real

**Em `detail`** (o padrão), a narrativa que `createNarrativeTest` escreveu para
ele em `narrativetrace-output/checkout-review-fixture/a_customer_buys_two_keyboards.md`
(mostrada sem o frontmatter, que carrega o nome da execução, um id de trace
novo e uma duração de relógio que mudam a cada execução):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.1ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.07ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.02ms #1.3
```

**Em `summary`**, a mesma execução do mesmo teste:

```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` → `"PAY-C-1234-7998"` — 0.62ms #1.2
  - `OrderRepository.save(order: )` — 0.02ms #1.3
```

**O log que o mesmo fluxo escreveu** através do logger do próprio projeto,
valores incluídos:

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

**O trace estrutural dessa execução**,
`narrativetrace-output/structural/checkout-review-fixture/a_customer_buys_two_keyboards.nt`:

```text
scenario: a customer buys two keyboards

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)
```

## Como ler a saída

**O fluxo, a partir do artefato `detail`.** `#1` é a chamada que o teste fez e a
única raiz: tudo o que está indentado sob ela aconteceu dentro dela, na ordem
impressa. `#1.1` reserva duas unidades antes de qualquer cobrança; `#1.2` cobra
7998 — duas unidades a 3999, então o preço é derivado da quantidade e não
passado como entrada; `#1.3` salva um pedido que já carrega o id que `#1`
retorna. Lido como uma frase: este checkout reserva primeiro, cobra em segundo,
salva em terceiro, e o id do pedido é gerado antes de salvar. Uma mudança que
cobre antes de reservar, ou salve antes de cobrar, é uma mudança *nisto*, e
agora você sabe disso sem confiar em um comentário.

**Para que serve cada nível.** `detail` carrega os valores dos parâmetros, e é
o que você lê enquanto trabalha no fluxo. Em `summary`, todo valor de parâmetro
é omitido — suprimido na captura, não escondido na renderização: o nome fica, e
nada o segue — e só são mantidas a raiz e as chamadas folha; este fluxo tem
dois níveis de profundidade, então nenhuma chamada é intermediária e as mesmas
quatro chamadas aparecem. Um fluxo mais profundo perde o meio. Os valores de
retorno sobrevivem em todos os níveis ativos: o retorno é a carga útil de uma
narrativa. `narrative` fica entre os dois, o fluxo completo de chamadas sem os
valores. Use `summary` onde a forma e os resultados são o que você precisa e os
valores são custo — uma execução de CI, um teste de longa duração — e
`off`/`errors` em produção até precisar de mais.

**Qual saída um humano lê e qual um agente lê.** As linhas de log são para a
pessoa de plantão: elas se intercalam com tudo o mais que o serviço registra,
carregam os valores e são indexadas pelo nome do trace — `solid wand romps` —
de modo que um checkout pode ser extraído com grep de um arquivo movimentado. O
`.nt` é para o agente e para quem revisa: **sem valores por construção** —
compare-o com a linha de log acima e a diferença não é que os valores foram
substituídos, mas que nunca foram escritos. `(customerId, sku, quantity, cardNumber)`
são os *nomes* dos parâmetros; `→ value` diz que um valor foi retornado sem
dizer qual. É isso que o torna seguro para commitar, para comparar em uma
revisão e para entregar a um modelo: ele não pode vazar um id de cliente, e não
muda quando os dados mudam — só quando as *chamadas* mudam. Fixá-lo é
[Revise uma refatoração: o comportamento mudou](revise-uma-refatoracao-o-comportamento-mudou.md).

## O que não é capturado

- **Chamadas dentro de classes não encapsuladas.** Quatro objetos foram
  encapsulados; uma chamada entre duas classes por trás deles, ou um método
  privado, nunca aparece. Um fluxo que parece raso pode ser profundo.
- **O que a integração escolhida não intercepta.** O proxy vê somente as
  chamadas feitas *através* da referência encapsulada: uma chamada interna que
  uma classe faz a si mesma (`this.helper()`) é invisível para ele —
  `InMemoryInventory.reserve` consulta o próprio `availableUnits`, e nenhum
  `#1.1.1` aparece.
  [Escolhendo uma integração](../escolhendo-uma-integracao.md) mostra o
  trade-off de cada caminho, e esta é a parte dele que muda o que você consegue
  ler aqui.
- **Trabalho que saiu do processo.** Uma chamada a uma worker thread ou a outro
  serviço roda em um contexto próprio; o trace termina onde terminou o trabalho
  encapsulado deste processo, a menos que a identidade do trace seja levada
  adiante ([Guia de integração de frameworks](../guia-de-integracao-de-frameworks.md)).
- **Valores capturados pela lista de bloqueio ou pela regra de formato de
  valor**, aqui `cardNumber` e `card`, aparecem como `[REDACTED]` tanto no log
  quanto no artefato `detail`, e estão ausentes por construção do `.nt`.
- **Uma execução, não o contrato.** Outra entrada segue outro caminho — um sku
  sem estoque nunca chega a `#1.2`.

**A skill para isso:** `narrativetrace-verify` — ela escreve a intenção
primeiro, executa o menor caminho real e lê o trace sem valores contra essa
intenção antes de qualquer coisa ser dada como concluída.
