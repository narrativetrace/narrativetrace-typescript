<!-- source: documentation/decorators-guide.md blob 189475c77df7 | translated: 2026-09-17 | reviewed: - -->

# Guia de decoradores do NarrativeTrace TypeScript

[English](../decorators-guide.md) | [Español](../es/guia-de-decoradores.md) | **Português** | [简体中文](../zh-CN/装饰器指南.md)

Este guia cobre os metadados de trace em nível de método — nomes de parâmetros, narração, contexto de erro e ocultação. A **forma padrão de declará-los é a forma de configuração** no `traceObject()`, na raiz de composição — os decoradores abaixo são o que a versão atualmente publicada no npm, `@narrativetrace/proxy@0.1.1`, tem em vez disso. *(since 0.1.3)* Os quatro decoradores são as mesmas declarações com uma sintaxe mais agradável para projetos que já compilam decoradores (NestJS, Angular, qualquer aplicação com TypeScript 5+).

O NarrativeTrace segue a filosofia **O código é o log**: os nomes de métodos, os nomes de parâmetros e os valores de retorno já deveriam comunicar por si só a história da execução. Mantenha a lógica de negócio limpa e expressiva antes de mais nada, e adicione metadados de forma excepcional, não por padrão — somente quando agregarem valor adicional concreto, como narração direcionada, contexto específico de erro, ou ocultação de dados sensíveis.

## A forma de configuração — declare tudo onde você envolve

`traceObject()` aceita uma configuração por método que expressa tudo o que os decoradores expressam. Não precisa de compilação de decoradores, funciona sobre objetos simples e JavaScript puro, e mantém os metadados de trace ao lado da fiação:

```ts
import { traceObject } from "@narrativetrace/proxy";

const payments = traceObject(paymentService, context, {
  methods: {
    charge: {
      params: ["customerId", "amount", "cardToken"],       // gêmeo de @traced
      narration: "Charging {amount} to {customerId}",      // gêmeo de @narrated
      onError: [                                           // gêmeo de @onError (empilhado)
        { template: "Charge failed for {customerId}" },
        { exception: CardDeclinedError, template: "Card declined for {customerId}" },
      ],
      notTraced: [2],                                      // gêmeo de @notTraced — oculta cardToken
    },
  },
});
```

Cada eixo corresponde um a um a um decorador:

| Eixo de configuração | Decorador gêmeo | Significado |
|---|---|---|
| `params: ["a", "b"]` | `@traced("a", "b")` | Nomes posicionais de parâmetros |
| `narration: "…{a}…"` | `@narrated("…{a}…")` | Template de narração na entrada |
| `onError: "…"` ou `[{ exception?, template }]` | `@onError("…")` / `@onError(Tipo, "…")` empilhados | Contexto de erro no momento do lançamento; o tipo mais específico vence |
| `notTraced: [1, 2]` | `@notTraced(1, 2)` | Oculta parâmetros por índice |

Atalhos: um `onError` de string simples é o pega-tudo (gêmeo de `@onError("...")`), e o terceiro argumento continua aceitando o mapa de nomes simples `traceObject(service, context, { placeOrder: ["customerId"] })` quando nomes são tudo de que você precisa.

**Precedência:** um eixo configurado substitui por completo os metadados do decorador correspondente para aquele método; um eixo omitido mantém a declaração do decorador. Configuração e decoradores, portanto, se compõem — uma classe de biblioteca pode carregar decoradores e uma raiz de composição ainda pode substituir um eixo.

## Inventário de decoradores

| Decorador | Módulo | Alvo | Finalidade |
|---|---|---|---|
| `@traced()` | `@narrativetrace/proxy` | Método | Vincula nomes de parâmetros para a saída do trace. |
| `@narrated()` | `@narrativetrace/proxy` | Método | Adiciona texto de narração legível por humanos a um método traced. |
| `@onError()` | `@narrativetrace/proxy` | Método | Adiciona texto de erro contextual quando um método lança uma exceção. |
| `@notTraced()` | `@narrativetrace/proxy` | Método | Marca valores de parâmetros como ocultos na saída do trace. |

Os quatro decoradores funcionam em **ambos os dialetos de decoradores**: os [decoradores TC39](https://github.com/tc39/proposal-decorators) padrão que o TypeScript 5+ compila por default, e o dialeto legado `experimentalDecorators` que projetos NestJS e Angular compilam. O dialeto é detectado em tempo de execução pelo formato da chamada — nada a configurar, o mesmo import serve para ambos, e as declarações de tipos publicadas passam na verificação de tipos com qualquer uma das duas opções do compilador. Se o seu ambiente não compila decoradores de forma alguma (JavaScript puro, ou um build que deixa a sintaxe `@` intocada), a chamada do decorador lança um erro nomeando a correção em vez de silenciosamente não registrar nada — a correção é a forma de configuração equivalente no `traceObject()` (mostrada em cada decorador abaixo).

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

Isso é equivalente a `@traced`, mas funciona sem nenhum suporte a decoradores. Os mesmos nomes podem viver na forma de configuração completa como `methods.placeOrder.params` (veja a seção de configuração acima); quando ambos são fornecidos, `methods.<nome>.params` vence sobre o mapa simples.

## `@narrated`

`@narrated` é uma válvula de escape, não a forma padrão de adicionar
narração — o caminho padrão é inteiramente derivado do próprio nome do
método, de seus parâmetros e do resultado. Recorrer a um template é um
sinal, o mesmo que a pontuação de clareza existe para detectar: significa
que o código não está dizendo por si mesmo o que faz. Antes de escrever um,
pergunte-se se o nome do método é o problema real — um nome melhor conserta
todo trace que passar por esse método, não só esta linha.

Use-o, deliberadamente, em métodos quando você quiser uma frase explícita no trace em vez de depender apenas do nome do método + parâmetros.

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

Gêmeo de configuração — a mesma narração sem o decorador:

```ts
const traced = traceObject(orderService, context, {
  methods: {
    placeOrder: {
      params: ["customerId", "quantity"],
      narration: "Placing order of {quantity} units for customer {customerId}",
    },
  },
});
```

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
- Empilhe vários — `@onError(NotFoundError, "…")` acima de `@onError("…")` — e, no momento do lançamento, vence a declaração que corresponde ao tipo lançado de forma mais específica.

Gêmeo de configuração — uma string é o pega-tudo, a forma de array carrega declarações tipadas:

```ts
const traced = traceObject(paymentService, context, {
  methods: {
    charge: {
      params: ["customerId", "amount"],
      onError: [
        { template: "Payment declined for customer {customerId}, amount was {amount}" },
        { exception: InsufficientFundsError, template: "Insufficient funds for {customerId}" },
      ],
    },
  },
});
```

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
- **`@notTraced` não é a única forma de um parâmetro ser ocultado.** O próprio *nome* de cada
  parâmetro capturado também é comparado com a lista de negação por nome do `RedactionPolicy` sob
  `traceObject()`, exatamente como um nome de campo de objeto é — `pay(policyId, paymentToken)`
  oculta `paymentToken` sem nenhum decorator, porque `token` está na lista de negação. `@notTraced`
  ainda importa para um parâmetro cujo nome não dá nenhuma pista (`pay(id, value)` em que `value` é
  um segredo). Essa metade do eixo baseada em nome é específica do `traceObject()` (proxy); o
  auto-encapsulamento `AutoProxyModule` do NestJS não tem como recuperar o nome real de um
  parâmetro (todo parâmetro é renderizado como `arg0`, `arg1`, …), então lá só `@notTraced` e a
  ocultação por forma do valor protegem um parâmetro — veja [Privacidade e ocultação](privacidade-e-ocultacao.md)
  para a declaração completa.
- Para **campos de objeto**, declare um campo estático de classe: `static notTraced = ["pan", "secret"]`
  — essas propriedades são renderizadas como `[REDACTED]` durante a introspecção, independentemente da
  lista de negação baseada em nomes do `RedactionPolicy` (que já cobre `password`, `token`, `ssn`,
  `cvv`, … — e é multilíngue por padrão: `contraseña`, `senha`, `motDePasse`, `密码`, …).
- Casos de uso típicos: senhas, tokens, segredos, dados de cartão.
- Gêmeo de configuração: `methods.login.notTraced = [1]` no `traceObject()` — os mesmos índices, sem necessidade de decorador.

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

## A troca da vinculação do alvo — auto-chamadas não aninham

Métodos traçados executam com `this` vinculado ao objeto original, não ao proxy (`Reflect.apply(fn, target, args)` dentro do wrapper do método). Um método que chama um irmão no mesmo objeto (`this.validate(order)`) invoca portanto o método original — a chamada executa corretamente, mas não é capturada, então auto-chamadas nunca aparecem como spans aninhados. É uma troca de design deliberada, não uma lacuna: vincular o objeto original torna o proxy imune às armadilhas clássicas de Proxy — campos `#private` (que lançam através de um receptor proxy), built-ins com slots internos (`Map`, `Date`) e campos de arrow function.

O aninhamento vem de envolver os colaboradores, e essa é a única regra estrutural: **decomponha em serviços colaboradores e envolva cada um onde ele é construído.**

```ts
// Uma classe, auto-chamadas: apenas placeOrder é capturado.
class OrderService {
  placeOrder(customerId: string) {
    this.reserveStock(customerId);   // executa, não é capturado
    this.charge(customerId);         // executa, não é capturado
  }
  // ...
}

// Colaboradores envolvidos na raiz de composição: a narrativa aninhada completa.
const inventory = traceObject(new InventoryService(), context);
const payments = traceObject(new PaymentService(), context);
const orders = traceObject(new OrderService(inventory, payments), context);
```

## O contrato de pureza — efeitos colaterais durante o trace

O NarrativeTrace pode invocar um pequeno conjunto fixo de caminhos de código dos seus objetos
enquanto renderiza um trace. Mantenha esses membros **puros** — livres de efeitos colaterais como
carregamento preguiçoso, contadores de acesso, preenchimento de cache ou E/S — exatamente como você
faria para um debugger ou um serializador.

O que é invocado, e o que não é:

- **A introspecção enumera as propriedades próprias enumeráveis** (`Object.keys`), e lê cada uma
  através do seu próprio descritor de propriedade. Um getter definido em uma classe vive no
  protótipo, nunca é enumerado, e nunca é executado durante a introspecção. *(since 0.1.4, decisão
  do time, 2026-09-17, "a renderização lê o estado, nunca executa comportamento")* Um acessor
  definido diretamente em um objeto literal (ou promovido a propriedade própria via
  `Object.defineProperty`, como às vezes acontece com o acessor de apoio de uma classe do tipo
  record) é próprio-enumerável mas **nunca mais é invocado, nem mesmo como alternativa** — em vez
  disso renderiza o marcador dedicado `<inaccessible>`, distinto do marcador tipado
  `<error: Tipo>`, que continua reservado para um valor que realmente foi lido e falhou. Só o
  valor armazenado de uma propriedade de dados é lido.
- **Um `toString()` personalizado (próprio, não o padrão) só é invocado para um intrínseco da
  plataforma do realm** — `Date`, `URL`, `RegExp`, um `BigInt` encaixotado ou um typed array,
  checado por identidade de protótipo, nunca por nome. *(since 0.1.3)* Seus próprios
  tipos nunca mais chegam a essa rota, tenham campos ou não: a introspecção de campos sempre roda
  em vez disso, não importa o que seu `toString()` teria impresso (decisão do time, 2026-09-12,
  que estreita a regra anterior de "qualquer folha" de 2026-09-11 — veja
  [Privacidade e ocultação](privacidade-e-ocultacao.md) para o motivo: nesta plataforma, "sem
  campo próprio enumerável" nunca foi prova de "nada a esconder" — um campo `#private`
  verdadeiro, uma closure, ou um `WeakMap` em nível de módulo indexado por `this` são invisíveis
  para a introspecção mas livremente legíveis de dentro do seu próprio `toString()`).
- **`@narrativeSummary` é invocado independentemente dos campos**, e continua a prevalecer tanto
  sobre a confiança no `toString()` quanto sobre a introspecção de campos — é código que você
  escreveu *para* o trace, então sempre roda e sua saída sempre é preferida, em qualquer tipo,
  folha ou não. Sua saída também é varrida em busca de um valor com forma de segredo (um JWT, um
  número de cartão, …) como defesa adicional.
- Qualquer caminho de propriedade que você nomear em um template `@narrated`/`@onError` também é
  invocado — `{order.total}` se resolve por acesso à propriedade, então um getter nomeado ali *vai*
  ser executado.
- **As coleções são enumeradas através do próprio estado do ancestral da plataforma, por
  origem.** *(since 0.1.4, decisão do time, 2026-09-17)* Um `Array`/`Set`/`Map` comum (ou uma
  subclasse que não sobrescreveu o método relevante) é lido exatamente como antes. Uma subclasse
  que sobrescreveu o método que a renderização chamaria de outra forma (`[Symbol.iterator]` em um
  `Array`, `entries()` em um `Map`, `values()`/`[Symbol.iterator]` em um `Set`) é lida através do
  próprio método da base da plataforma — a sobrescrita nunca é invocada. Um tipo feito à mão sem
  nenhum ancestral de plataforma também nunca é enumerado através do próprio iterador: ele é
  renderizado por introspecção de campos como qualquer outro objeto e — só quando não tem nenhum
  campo próprio-enumerável para mostrar — como o nome do tipo puro, em vez de um `{}`
  enganosamente vazio. Veja [O hook de elementos](#o-hook-de-elementos--narrative_elements)
  abaixo para a única forma de reativar a própria iteração de um tipo.
- **O hook de elementos (`NARRATIVE_ELEMENTS`) é invocado quando um tipo o declara** — o único
  caso em que o próprio código de um tipo com forma de coleção roda durante a renderização, porque
  o autor do tipo declarou explicitamente que é seguro. Veja
  [O hook de elementos](#o-hook-de-elementos--narrative_elements) abaixo.
- **A invocação é limitada e isolada.** A saída é limitada (`maxStringLength`,
  `maxArrayItems`, `maxObjectKeys`); um campo de dados que falha ao ser lido (ou, recursivamente,
  um valor aninhado que falha ao renderizar) degrada só *aquele campo* para o marcador de erro
  tipado `<error: NomeDoConstrutor>` (nunca `.message`, que pode carregar o valor exato que o
  membro se recusava a renderizar) — os campos irmãos continuam sendo renderizados normalmente; um
  campo acessor nunca mais alcança esse caminho (veja acima — degrada para `<inaccessible>` em vez
  disso, sem nunca rodar). *(since 0.1.3)* Um `toString()` ou `@narrativeSummary()` que lança exceção degrada o
  valor inteiro da mesma forma; nenhum dos dois jamais faz a chamada de negócio traced falhar (os
  templates recorrem ao literal `{placeholder}`). Os valores são renderizados de forma eager no
  ponto de chamada, então qualquer efeito colateral acontece uma única vez, em um ponto
  determinístico. Thenables nunca são aguardados — eles são renderizados como `<pending>`.

Se um membro não puder ser puro, liste-o em `static notTraced` — o valor de um membro oculto
nunca é lido — ou dê ao tipo um `@narrativeSummary` curado para que você controle exatamente o que
é acessado; um `toString()` personalizado no seu próprio tipo nunca mais é confiado, tenha campos
ou não — só `Date`/`URL`/`RegExp`/um `BigInt` encaixotado/um typed array ganham isso, por
identidade de plataforma. Com um contexto
inativo (nível `off`, ou captura de parâmetros desativada em `summary`), nenhuma renderização de
argumento acontece — nenhum código do usuário é tocado no caminho rápido.

## O hook de elementos — `NARRATIVE_ELEMENTS`

*(since 0.1.4, decisão do time, 2026-09-17, "a renderização lê o estado, nunca executa
comportamento")* O terceiro hook de renderização sancionado, junto de `@narrativeSummary` e do
próprio `toString()` de uma folha da plataforma: um símbolo bem conhecido, exportado como
`NARRATIVE_ELEMENTS` a partir de `@narrativetrace/core`, que um tipo feito à mão com forma de
coleção implementa para declarar que os seus próprios elementos são seguros para enumerar.

```ts
import { NARRATIVE_ELEMENTS, renderValue } from "@narrativetrace/core";

class Basket {
  #parts: string[];
  constructor(parts: string[]) {
    this.#parts = parts;
  }
  [NARRATIVE_ELEMENTS](): Iterable<string> {
    return this.#parts;
  }
}

renderValue(new Basket(["sku-1", "sku-2"])); // '["sku-1", "sku-2"]'
```

Sem o hook, `Basket` não tem nenhum campo próprio-enumerável (`#parts` é um campo privado
verdadeiro), então seria renderizado como um `{}` puro e enganosamente vazio — ou, se também
tivesse campos visíveis, como um dump apenas desses campos. Declarar `NARRATIVE_ELEMENTS`
reativa deliberadamente a própria iteração de um tipo: a renderização enumera até
`maxCollectionItems` elementos que o método retorna, truncando com o mesmo marcador `(N total)`
que qualquer outra coleção usa.

O hook é invocado — esse é o propósito dele, uma declaração explícita do autor de que fazer isso
é seguro — mas só de dentro da mesma guarda de renderização que roda atrás de qualquer outro hook
(`isRenderingInProgress()`), então uma chamada envolvida com `traceObject` alcançada de dentro
dele não registra nenhum span. Um hook que lança exceção (ou cujo valor de retorno não é
realmente iterável) degrada o valor inteiro para o marcador de erro tipado
`<error: NomeDoConstrutor>`, exatamente como um `@narrativeSummary()` ou `toString()` que lança
exceção. O símbolo é procurado internamente via `Symbol.for("narrativetrace.elements")`, então se
resolve de forma idêntica entre limites de módulos e cópias do pacote.

Tem prioridade sobre qualquer outro despacho de coleções (incluindo o próprio de
`Array`/`Set`/`Map`), então um tipo que ao mesmo tempo estende uma coleção da plataforma e
declara o hook é enumerado através do hook.

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
