<!-- source: documentation/decorators-guide.md blob b7c1a472a12b | translated: 2026-09-07 | reviewed: - -->

# Guia de decoradores do NarrativeTrace TypeScript

[English](../decorators-guide.md) | [Español](../es/guia-de-decoradores.md) | **Português** | [简体中文](../zh-CN/装饰器指南.md)

Este guia lista todos os decoradores disponíveis no NarrativeTrace TypeScript e explica quando e como usar cada um.

O NarrativeTrace segue a filosofia **O código é o log**: os nomes de métodos, os nomes de parâmetros e os valores de retorno já deveriam comunicar por si só a história da execução. Mantenha a lógica de negócio limpa e expressiva antes de mais nada, e use decoradores de forma excepcional, não por padrão. Adicione decoradores somente quando eles agregarem valor adicional concreto, como narração direcionada, contexto específico de erro, ou ocultação de dados sensíveis.

## Inventário de decoradores

| Decorador | Módulo | Alvo | Finalidade |
|---|---|---|---|
| `@traced()` | `@narrativetrace/proxy` | Método | Vincula nomes de parâmetros para a saída do trace. |
| `@narrated()` | `@narrativetrace/proxy` | Método | Adiciona texto de narração legível por humanos a um método traced. |
| `@onError()` | `@narrativetrace/proxy` | Método | Adiciona texto de erro contextual quando um método lança uma exceção. |
| `@notTraced()` | `@narrativetrace/proxy` | Método | Marca valores de parâmetros como ocultos na saída do trace. |

Todos os decoradores usam a [proposta de decorators TC39 Stage 3](https://github.com/tc39/proposal-decorators) (TypeScript 5.0+). São decoradores de método que usam `ClassMethodDecoratorContext`.

## `@traced`

Use `@traced` para vincular nomes de parâmetros explícitos. Isso é essencial quando minificadores removem os nomes dos parâmetros, ou quando você quer nomes mais descritivos nos traces.

```ts
import { traced } from "@narrativetrace/proxy";

class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(cId: string, pId: string, qty: number) {
    // ...
  }
}
```

Como funciona:

- Os nomes dos parâmetros são armazenados em um `WeakMap` indexado pela função do método.
- Quando `traceObject()` intercepta uma chamada, ele busca os nomes e os usa em vez de `arg0`, `arg1`, etc.
- Os nomes são posicionais — eles mapeiam para os argumentos por índice.

### Sem `@traced` (nomes de parâmetros manuais)

Se você não pode ou não quer usar decoradores, passe os nomes dos parâmetros diretamente para `traceObject()`:

```
const traced = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
  cancelOrder: ["orderId"],
});
```

Isso é equivalente a `@traced`, mas funciona sem nenhum suporte a decoradores.

## `@narrated`

Use `@narrated` em métodos quando você quiser uma frase explícita no trace em vez de depender apenas do nome do método + parâmetros.

```ts
import { narrated } from "@narrativetrace/proxy";

class OrderService {
  @narrated("Placing order of {quantity} units for customer {customerId}")
  placeOrder(customerId: string, quantity: number) {
    // ...
  }
}
```

Como funciona:

- O template de narração é armazenado em um `WeakMap` indexado pela função do método.
- A string do template é anexada ao campo `MethodSignature.narration` do nó do trace.
- Funciona com `traceObject()` — a narração aparece na saída em Markdown como texto em itálico abaixo da chamada.

Como os marcadores são resolvidos: `{paramName}` substitui o argumento nomeado; `{param.property}` chama o getter sobre o objeto de argumento bruto. Apenas um único nível de propriedade é resolvido — `{order.card.number}` nunca é resolvido, e o marcador sobrevive literalmente. Um membro oculto alcançado por um caminho de propriedade resolve para `[REDACTED]`, nunca para o valor bruto — veja a nota sobre ocultação em `@notTraced` abaixo.

## `@onError`

Use `@onError` para anexar mensagens específicas de contexto a exceções.

```ts
import { onError } from "@narrativetrace/proxy";

class PaymentService {
  @onError("Payment declined for customer {customerId}, amount was {amount}")
  charge(customerId: string, amount: number) {
    // ...
  }
}
```

Como funciona:

- O template de contexto de erro é armazenado em um `WeakMap` indexado pela função do método.
- Quando o método lança uma exceção, o contexto de erro é anexado ao campo `MethodSignature.errorContext` do nó do trace.
- Enriquece traces de erro com contexto específico de domínio, além da simples mensagem da exceção.

## `@notTraced`

Use `@notTraced` para ocultar valores de parâmetros sensíveis.

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // oculta o parâmetro no índice 1
  login(username: string, password: string) {
    // ...
  }
}
```

Como funciona:

- Os índices dos parâmetros são armazenados em um `WeakMap<Function, Set<number>>`.
- O proxy renderiza os parâmetros ocultos como `[REDACTED]` na saída do trace.
- `ParameterCapture.redacted` é definido como `true` para parâmetros ocultos.
- Vários índices podem ser ocultados: `@notTraced(1, 2)`.
- Para **campos de objeto**, declare um campo estático de classe: `static notTraced = ["pan", "secret"]`
  — essas propriedades são renderizadas como `[REDACTED]` durante a introspecção, independentemente da
  lista de negação baseada em nomes do `RedactionPolicy` (que já cobre `password`, `token`, `ssn`,
  `cvv`, …).
- Casos de uso típicos: senhas, tokens, segredos, dados de cartão.

**A ocultação vence sobre um template que a nomeia.** `@narrated` e `@onError` resolvem
os caminhos `{param.property}` em relação aos argumentos brutos, e um caminho que alcança um membro oculto
resolve para `[REDACTED]` — seja porque o membro está na lista de negação por nome, seja porque está
listado explicitamente em `static notTraced`. Um `{name}` simples que nomeia um valor diretamente
obedece às mesmas duas regras: a lista de negação lê essa chave exatamente como lê um nome de
campo, e a forma do próprio valor também é verificada, então `@narrated("login {password}")` e um
JWT chegando como `{value}` ambos renderizam `[REDACTED]`. Nomear um caminho, ou um valor, nunca
enfraquece as regras que se aplicam diretamente ao valor:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}

class PaymentService {
  @narrated("Charging card ending {card.last4}, cvv {card.cvv}")
  @traced("card")
  charge(card: Card) { /* ... */ }
}
// narração: "Charging card ending 4111, cvv [REDACTED]"
```

Se você precisar do valor em uma narrativa, remova-o de `static notTraced` (ou do padrão da
lista de negação que ele corresponde) — essa remoção é a decisão deliberada e revisável. Um
marcador que nomeia uma propriedade que não existe no objeto é um erro de digitação de autoria, não
uma decisão de ocultação: ele sobrevive literalmente, e o aviso de marcador não resolvido em
tempo de teste ainda é disparado para ele.

## O contrato de pureza — efeitos colaterais durante o trace

O NarrativeTrace pode invocar um pequeno conjunto fixo de caminhos de código dos seus objetos
enquanto renderiza um trace. Mantenha esses membros **puros** — livres de efeitos colaterais como
carregamento preguiçoso, contadores de acesso, preenchimento de cache ou E/S — exatamente como você
faria para um debugger ou um serializador.

O que é invocado, e o que não é:

- **A introspecção enumera as propriedades próprias enumeráveis** (`Object.keys`). Um getter
  definido em uma classe vive no protótipo, nunca é enumerado, e nunca é executado durante a
  introspecção. (Um acessor definido diretamente em um objeto literal *é* próprio-enumerável
  e seria executado — prefira getters de classe ou marque o campo em `static notTraced`.)
- **O que o NarrativeTrace realmente invoca:** um `toString()` personalizado (próprio, não o
  padrão), um método designado com `@narrativeSummary`, e qualquer caminho de propriedade que você
  nomear em um template `@narrated`/`@onError` — `{order.total}` se resolve por acesso à
  propriedade, então um getter nomeado ali *vai* ser executado.
- **A invocação é limitada e isolada.** A saída é limitada (`maxStringLength`,
  `maxArrayItems`, `maxObjectKeys`); um getter ou `toString()` que lança uma exceção nunca faz a
  chamada de negócio traced falhar (os templates recorrem ao literal `{placeholder}`, a renderização
  recorre a um marcador com o nome do tipo); os valores são renderizados de forma eager no ponto de
  chamada, então qualquer efeito colateral acontece uma única vez, em um ponto determinístico.
  Thenables nunca são aguardados — eles são renderizados como `<pending>`.

Se um membro não puder ser puro, liste-o em `static notTraced` — o valor de um membro oculto
nunca é lido — ou dê ao tipo um `toString()`/`@narrativeSummary` curado para que você controle
exatamente o que é acessado. Com um contexto inativo (nível `off`, ou captura de parâmetros
desativada em `summary`), nenhuma renderização de argumento acontece — nenhum código do usuário é
tocado no caminho rápido.

## Combinando decoradores

Decoradores podem ser empilhados no mesmo método:

```ts
import { traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class TransferService {
  @traced("fromAccountId", "toAccountId", "amount", "authToken")
  @narrated("Transferring {amount} from {fromAccountId} to {toAccountId}")
  @onError("Transfer rejected for source account {fromAccountId}")
  @notTraced(3) // oculta authToken
  transfer(from: string, to: string, amount: number, token: string) {
    // ...
  }
}
```

Este único método combina nomeação de parâmetros, narração, contexto de erro direcionado e ocultação de parâmetros.

## Exemplo completo

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdown } from "@narrativetrace/core";
import { traceObject, traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class PaymentService {
  @traced("customerId", "amount", "token")
  @narrated("Charging {amount} to customer {customerId}")
  @onError("Payment failed for customer {customerId}")
  @notTraced(2) // oculta token
  charge(customerId: string, amount: number, token: string) {
    if (amount > 1000) throw new Error("Amount exceeds limit");
    return { transactionId: "TX-1", amount };
  }
}

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);
const traced = traceObject(new PaymentService(), context);

traced.charge("C1", 500, "tok_secret_123");
console.log(renderMarkdown(context.captureTrace()));
```

## Veja também

- [Guia de instalação](guia-de-instalacao.md) — dependências, caminhos de integração, configuração da saída de trace
- [Guia de configuração](guia-de-configuracao.md) — níveis de tracing, opções de renderização
- [Guia de clareza](guia-de-clareza.md) — modelo de pontuação, componentes de NLP, scanner estático
