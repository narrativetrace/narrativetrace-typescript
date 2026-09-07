<!-- source: documentation/first-10-minutes.md blob ca706c4fd14f | translated: 2026-09-07 | reviewed: - -->
# Primeiros 10 minutos

[English](../first-10-minutes.md) | [Español](../es/primeros-10-minutos.md) | **Português** | [简体中文](../zh-CN/前10分钟.md)

Um serviço minúsculo, um teste de Vitest, sete passos. Todo comando abaixo foi
executado de verdade contra esta versão do repositório — os caminhos de
arquivo, as pontuações de clareza e o marcador `[REDACTED]` são saída real,
não ilustrações. As únicas coisas que vão ser diferentes na sua máquina são a
duração (`ms`) e o `trace_name` de duas palavras, ambos gerados na hora a
cada execução.

Node 20+ (o CI roda a versão 22), TypeScript 5.0+ (para os decoradores do passo 7), um projeto que já
executa `vitest run`. Se você ainda não viu o panorama geral,
`pnpm run build && pnpm demo -- --example ecommerce --no-pause` a partir da
raiz do repositório é ainda mais rápido — esta página é para quando você
quer ver isso rodando com o *seu próprio* código.

## 1. Adicione os pacotes

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

`core-node` reexporta tudo o que está em `@narrativetrace/core` e registra o
gerador de IDs do Node — importar apenas `@narrativetrace/core` lança uma
exceção na primeira chamada traçada. Não há plugin de build tool para
aplicar; os pacotes são toda a configuração de dependências.

## 2. Adicione uma classe de serviço

```ts
// src/order-service.ts
export class OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

Nenhuma interface para declarar — `traceObject()` encapsula o objeto
concreto diretamente com um `Proxy` de ES, então não há nada contra o que
implementar. (As implementações em JDK/JVM do NarrativeTrace precisam de uma interface
para seu proxy dinâmico; este não precisa.)

## 3. Adicione um teste de Vitest

```ts
// src/order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C-1234", "SKU-KB", 2);
});
```

`createNarrativeTest()` retorna um `test` do Vitest que injeta um
`narrativeContext` novo a cada teste e grava os artefatos de trace depois
que ele termina. O terceiro argumento de `traceObject` — `{ placeOrder:
[...] }` — fornece os nomes dos parâmetros, porque o JavaScript não os
mantém em tempo de execução; sem isso, o trace mostra `arg0`, `arg1`,
`arg2`. (O passo 7 mostra a forma com decorador, `@traced`, que faz a mesma
coisa para uma classe que você possui.)

## 4. Execute a suíte

```bash
npx vitest run
```

A saída fica em `narrativetrace-output/` — o padrão que a fixture escolheu
porque nenhum `outputDir` foi informado — um arquivo por cenário por
formato:

```text
narrativetrace-output/
   |
   +-- order-service/customer_places_order.md          human narrative
   +-- order-service/customer_places_order.json         same trace, JSON
   +-- diagrams/order-service/customer_places_order.mmd Mermaid sequence diagram
```

`order-service.test.ts` virou o diretório `order-service` (o nome do
*arquivo* de teste, sanitizado — o equivalente, nesta plataforma, ao
diretório de *classe* de teste do Java); `"customer places order"` virou
`customer_places_order.md` — o nome do teste, convertido em slug. Não há
mais nada para configurar. Por padrão, só são gravados `md`/`json`/`mmd`;
passe `formats: [...]` para `createNarrativeTest` para obter também `puml`,
`clarity-json` ou `canonical-json` — veja o
[Guia de Instalação](guia-de-instalacao.md#3-configure-a-saída-do-trace).

## 5. Abra a narrativa

`narrativetrace-output/order-service/customer_places_order.md`:

```markdown
---
type: trace
scenario: customer places order
entry_point: OrderService.placeOrder
duration_ms: 1.548
trace_id: 7919d16fd10a133f3f1ebf9f5670c502
trace_name: tidy mink roots
method_count: 1
error_count: 0
---

- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2)` → `"ORD-C-1234-SKU-KB-2"` — 1.548ms
```

Cada valor no fluxo de chamadas — os valores dos parâmetros, o valor de
retorno — veio da chamada que você realmente fez. Nada foi escrito à mão.

## 6. Renomeie `placeOrder` para `process` e veja a clareza cair

A qualidade da nomenclatura é medida, não declarada por asserção.
`createNarrativeTest` também grava `customer_places_order.clarity-json`
assim que você adiciona `"clarity-json"` a `formats`. Antes da renomeação,
para este cenário exato:

```json
{
  "overallScore": 0.94,
  "methodNameScore": 0.91,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": []
}
```

Renomeie o método (declaração, a chave em `paramNames`, e o ponto de
chamada) para `process` e execute `npx vitest run` novamente:

```json
{
  "overallScore": 0.79,
  "methodNameScore": 0.4,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": [
    {
      "category": "method-name",
      "element": "OrderService.process",
      "suggestion": "Use a domain-specific verb+noun (e.g., calculateTotal, reserveInventory)",
      "severity": "MEDIUM",
      "occurrences": 1,
      "impactScore": 2
    }
  ]
}
```

Mesma chamada, mesmos valores, tudo igual, exceto o nome — a pontuação
geral caiu de 0.94 para 0.79, a dimensão de nome de método sozinha caiu de
0.91 para 0.40, e um problema apareceu. Um `clarity-report.md` /
`clarity-results.json` para a suíte inteira (agregando todos os cenários,
com um limiar de aprovação/reprovação que você define) precisa de um passo
extra — adicionar `ClaritySuiteReporter` aos `reporters` do Vitest —
coberto no
[Guia de Clareza](guia-de-clareza.md#gerando-o-arquivo-de-resultados-a-partir-do-vitest).
Renomeie-o de volta para `placeOrder` (ou para algo ainda mais específico)
antes de continuar.

## 7. Adicione `@notTraced` e veja a ocultação

```ts
// src/order-service.ts
import { notTraced, traced } from "@narrativetrace/proxy";

export class OrderService {
  @traced("customerId", "productId", "quantity", "paymentToken")
  @notTraced(3)
  placeOrder(customerId: string, productId: string, quantity: number, paymentToken: string): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

`@traced` substitui o mapa `paramNames` do passo 3 — com o decorador no
lugar, `traceObject(new OrderService(), narrativeContext)` não precisa de
um terceiro argumento. `@notTraced(3)` marca o parâmetro de índice 3
(`paymentToken`) como oculto. Passe um token no teste
(`service.placeOrder("C-1234", "SKU-KB", 2, "tok_live_51H8x9J")`) e execute
novamente. O trace:

```markdown
- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2, paymentToken: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1.005ms
```

O nome do parâmetro ainda aparece — você consegue ver que um token *foi*
passado — mas o valor dele nunca chega ao disco. Veja
[Privacidade e Ocultação](privacidade-e-ocultacao.md) para o que mais a
ocultação cobre, incluindo a ocultação em nível de campo
(`static notTraced`) para objetos que você não constrói um parâmetro de
cada vez.

## Para onde ir a seguir

| Você quer | Vá para |
|---|---|
| Um caminho de integração diferente da fixture de Vitest acima | [Escolhendo uma Integração](escolhendo-uma-integracao.md) |
| O contrato de privacidade linha por linha | [Privacidade e Ocultação](privacidade-e-ocultacao.md) |
| Quais arquivos gerados commitar | [O que Commitar](o-que-commitar.md) |
| Algo acima não funcionou como mostrado | [Solução de Problemas](solucao-de-problemas.md) |
| Todo parâmetro de configuração | [Guia de Configuração](guia-de-configuracao.md) |
