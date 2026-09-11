<!-- source: README.md blob 187dee2930bd | translated: 2026-09-10 | reviewed: - -->
# NarrativeTrace

[English](README.md) | [Español](LEAME.md) | **Português** | [简体中文](自述文件.md)

> O código é o log.

Logging sem código: usa os nomes dos seus métodos e parâmetros como o log. Se o trace estiver ilegível, seu código precisa de refatoração — não de mais instruções de log.

Com pressa: [experimente localmente](#experimente-localmente) → [adicione a um teste](#adicione-a-um-teste) → [escolha sua integração](#escolha-sua-integração).

## O problema

Metade deste método é ruído de logging:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  console.log(`Placing order for customer ${customerId} product ${productId} quantity ${quantity}`);

  const customer = this.customers.findCustomer(customerId);
  console.log('Found customer:', customer);

  const price = this.catalog.lookupPrice(productId);
  console.log('Looked up price:', price);

  this.inventory.reserve(productId, quantity);
  console.log('Reserved inventory');

  const confirmation = this.payments.charge(customerId, price * quantity);
  console.log('Payment processed:', confirmation.transactionId);

  const result = { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
  console.log('Order placed:', result);
  return result;
}
```

A lógica de negócio são cinco linhas. O logging, outras seis. Cada desenvolvedor escreve esses logs de um jeito diferente — mensagens diferentes, níveis diferentes, valores incluídos diferentes. O resultado é inconsistente, verboso e fica emaranhado com o código que descreve.

O NarrativeTrace elimina isso por completo:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  this.customers.findCustomer(customerId);
  const price = this.catalog.lookupPrice(productId);
  this.inventory.reserve(productId, quantity);
  const confirmation = this.payments.charge(customerId, price * quantity);
  return { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
}
```

Lógica de negócio pura. O trace é gerado automaticamente a partir dos nomes dos métodos, dos nomes dos parâmetros e dos valores de retorno — a informação que já estava ali.

## Deriva código-log

As linhas de log são a única parte do código sem verificação do compilador
e, na prática, sem cobertura de testes — então elas silenciosamente deixam
de ser verdadeiras conforme o código muda. Uma renomeação deixa a mensagem
descrevendo o nome antigo; um passo adicionado simplesmente nunca é
mencionado; uma mudança de unidade (centavos → euros) faz `total` descrever
um número diferente. Nada detecta isso: o texto do log quase nunca é
verificado por uma asserção, e quando é, a asserção é frágil e é a primeira
coisa removida. Um log obsoleto é peor do que nenhum — em um incidente ele é
lido como evidência do que aconteceu, quando é uma frase que alguém escreveu
uma vez sobre um código que já mudou.

> **Deriva código-log, eliminada por construção.** Uma linha de log é uma
> afirmação sobre o código, escrita uma vez e nunca mais verificada. Um trace
> narrativo é derivado da execução — então não há nada para desviar.

Para ser preciso: um template de narração (`@narrated`) ainda é uma string
escrita à mão, e um parâmetro renomeado pode quebrar seu marcador — é
exatamente por isso que ele é a exceção aqui, não o caminho padrão (veja o
[Guia de decoradores](documentation/pt-BR/guia-de-decoradores.md)). Tudo o
mais em um trace — as chamadas, os argumentos e os resultados — é derivado,
nunca escrito, então não há nada ali para ficar obsoleto. E como um trace é
estrutural, uma mudança real de comportamento se torna algo que um revisor
pode comparar, não uma frase que silenciosamente parou de descrever o
código.

## O que você recebe em vez disso

Execute seu código e obtenha traces de execução como este:

```
OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)
  CustomerService.findCustomer(customerId: "C1") -> {"id": "C1", "name": "Alice", "tier": "gold"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 2) -> {"productId": "P1", "quantity": 2}
  PaymentService.charge(customerId: "C1", amount: 59.98) -> {"transactionId": "TX-1", "amount": 59.98}
-> {"orderId": "ORD-1", "transactionId": "TX-1", "totalCharged": 59.98, "itemCount": 2}
```

## Quando algo dá errado

O trace torna os bugs visíveis:

```
OrderService.placeOrder(customerId: "C3", productId: "P1", quantity: 3)
  CustomerService.findCustomer(customerId: "C3") -> {"id": "C3", "name": "Charlie", "tier": "platinum"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 3) -> {"productId": "P1", "quantity": 3}
  PaymentService.charge(customerId: "C3", amount: 89.97) !! Error: Payment declined for customer: C3
!! Error: Payment declined for customer: C3
```

`InventoryService.reserve` foi chamado, mas `InventoryService.release` não aparece em nenhum lugar do trace. O bug é visível.

## O trace é tão bom quanto seus nomes

O mesmo fluxo "jogador entra no mundo" do Minecraft, traçado duas vezes — uma com nomes de domínio, outra com nomes genéricos:

**Refatorado (nomes limpos):**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", "blockCount": 65536}
  PlayerInventory.addItem(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> {"type": "zombie", "x": 10, "y": 64, "z": 10, "health": 20}
-> "Steve joined the world in plains biome"
```

**Não refatorado (nomes genéricos):**
```
GameManager.handle(input: "Steve")
  DataProcessor.process(a: 0, b: 0) -> {"a": 0, "b": 0, "label": "plains", "count": 65536}
  StateManager.update(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  ThingFactory.create(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  EntityHandler.execute(kind: "zombie", a: 10, b: 64, c: 10) -> {"kind": "zombie", "a": 10, "b": 64, "c": 10, "value": 20}
-> "Steve joined the world in plains biome"
```

Mesmo grafo de chamadas. Mesmos valores de retorno. Só os nomes mudam. Se seu código não consegue contar sua própria história, ele precisa de refatoração — por isso o NarrativeTrace também [pontua seu naming](#pontuação-de-clareza).

## Por que isso importa para o desenvolvimento assistido por IA

Cada linha `console.log(...)` ou `logger.trace(...)`/`logger.debug(...)`/`logger.info(...)` é uma linha que as ferramentas de IA para programação precisam analisar, gastar tokens processando e raciocinar em torno dela. Em uma classe de serviço típica, o logging é de 30 a 50% das linhas. Remova essas linhas e você ganha:

- **Mais lógica de negócio por janela de contexto** — o mesmo orçamento de tokens cobre mais do seu código real.
- **Raciocínio mais limpo** — a IA vê o que o código faz, não como ele registra o que faz.
- **Diffs só de sinal** — os pull requests mostram mudanças de lógica de negócio, não mudanças misturadas de lógica e logging.

Isso não é um benefício vago — é mensurável em tokens.

## Pontuação de clareza

Se o trace *é* o código, então a qualidade do trace *é* a qualidade do código. O NarrativeTrace inclui um analisador de clareza que pontua os nomes dos seus métodos, classes e parâmetros:

```
## Clarity Report — Order Placement
Overall: 0.92 (high)

| Element     | Score | Note                    |
|-------------|-------|--------------------------|
| placeOrder  | 1.00  | Strong verb + object    |
| customerId  | 1.00  | Domain-specific noun    |
| processData | 0.30  | Generic verb + generic noun |
```

Nomes genéricos como `processData`, `handleRequest`, `result` pontuam baixo. Nomes específicos de domínio como `reserveInventory`, `customerId` pontuam alto. O relatório de clareza é gerado automaticamente assim que você o escreve em uma execução do Vitest — veja [Primeiros 10 minutos](documentation/pt-BR/primeiros-10-minutos.md#6-renomeie-placeorder-para-process-e-veja-a-clareza-cair) para um antes/depois real.

A pontuação de clareza ainda é experimental.

## Como se compara

Se você está em um stack empresarial, normalmente já tem:

- plataformas centralizadas de log (Datadog, ELK, Cloud Logging)
- backends de tracing distribuído (OpenTelemetry, Jaeger, Tempo)
- alertas e dashboards de SLO

O NarrativeTrace foi projetado para substituir o logging manual de aplicação em produção. Você mantém seus sinks e pipelines atuais; o NarrativeTrace se torna a fonte dos eventos de aplicação.

| Aspecto | Stack de logging empresarial | NarrativeTrace |
|---------|--------------------------|----------------|
| Objetivo principal | Operabilidade, resposta a incidentes, compliance | Mesmo objetivo de produção, mas gerado diretamente a partir da estrutura do código |
| Modelo de dados | Eventos + campos + spans + métricas escritos manualmente | Narrativas de chamadas de método com parâmetros nomeados, valores de retorno e erros |
| Estilo de instrumentação | Chamadas `logger.*` manuais + fiação de telemetria | Captura autogerada, depois exportação para os sinks empresariais existentes |
| Melhor em | Busca centralizada, retenção, alertas | Eventos de aplicação de alta fidelidade e baixo drift sem boilerplate de logging |
| Ponto fraco | A qualidade do evento depende de instruções de log escritas à mão | Exige disciplina de naming para manter os traces claros |

O `console.log` manual é a base mais fraca: disperso, inconsistente e misturado com a lógica de negócio. O NarrativeTrace elimina esse ruído de logging derivando o trace da estrutura do código.

Modelo de produção:

- mantenha sua plataforma de observabilidade e alertas atuais
- substitua as instruções de logging manual da aplicação pela captura do NarrativeTrace
- encaminhe a saída do NarrativeTrace para os mesmos sinks que sua organização já opera

**Ponte com OpenTelemetry:** `@narrativetrace/opentelemetry` projeta as narrativas
sobre spans do OTel — um `createOtelEventConsumer` ao vivo que inicia/encerra spans
conforme os métodos são executados, e um `TraceSpanExporter` em lote que converte
uma árvore capturada em spans aninhados a posteriori. Cada span carrega atributos
de esquema `nt.trace_id`/`nt.*` e valores tipados `narrative.param.<name>`, então
suas views de trace já existentes do Jaeger/Tempo/Datadog se iluminam sem spans
instrumentados manualmente. Os enriquecedores de log (`winston`, `pino`,
`observability`) estampam `trace_id`, `service.*` e `nt.depth` em cada linha para
a mesma correlação.

## O que o NarrativeTrace substitui (e o que não substitui)

O NarrativeTrace substitui as instruções de narração que você escreve à mão para descrever uma chamada — não sua stack de logging:

```ts
logger.info(`Placing order for customer ${customerId} product ${productId}`);
```

Essa linha desaparece; a própria chamada do método já carrega a informação. Por padrão mais nada muda: nenhum logger é tocado — uma captura fica em buffer no processo e é exportada via `captureTrace()` (arquivos Markdown/JSON/prosa), ou impressa posteriormente com `renderToConsole` no navegador.

Conecte o `@narrativetrace/pino` ou o `@narrativetrace/winston` e o NarrativeTrace se torna um emissor ao vivo: `createPinoEventConsumer`/`createWinstonEventConsumer` chamam diretamente sua própria instância de `Logger` (`logger.trace()`/`logger.warn()`, configurável por evento), então cada transporte, formatador e destino de envio que você já configurou continua funcionando, intocado — o NarrativeTrace é só mais um chamador do seu logger, não um substituto dele. O logging manual que você continua escrevendo de propósito — uma linha de auditoria, uma métrica de negócio, qualquer coisa que não seja apenas narrar o fluxo de controle — roda no mesmo logger, intercalado com as próprias linhas do NarrativeTrace. Quer correlação sem gerar nenhuma linha? O `createLogEnricher` do `@narrativetrace/observability` carimba os campos `trace_id`/`nt.*` nas chamadas de logger que você ainda escreve à mão; ele nunca emite nada por conta própria.

## Experimente localmente

Sem projeto, sem fiação — o repositório traz um lançador de demo que executa as aplicações de exemplo e as narra ao vivo (a primeira execução precisa de um build):

```bash
pnpm install                                   # uma vez
pnpm run build && pnpm demo                    # seletor interativo: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce               # seis cenários, stream ao vivo → ← !!, um ponto de parada por cenário
pnpm demo -- --example ecommerce --classic     # a mesma execução como logs com timestamp através da ponte do winston
pnpm demo -- --example ecommerce --lang es     # a mesma execução renderizada de novo através do glossary.json do exemplo
```

Cada cenário começa com uma nota sobre como o trace dele está conectado —
decorators, `traceObject`, fork/join — e cada renderização (árvore, prosa,
Mermaid, PlantUML) é anunciada como sua própria seção. Detalhes no
[Guia de exemplos](documentation/pt-BR/guia-de-exemplos.md#lançador-da-demo).

## Adicione a um teste

O caminho mais curto de "biblioteca interessante" a "vi um trace útil do meu próprio código" é o fixture do Vitest. Node 20+ (o CI roda a versão 22), TypeScript 5.0+ se você usar os decorators abaixo.

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

A publicação no npm está em preparação — até que os pacotes estejam no
registro, compile-os a partir deste repositório (veja [Compilando a partir do
código-fonte](#compilando-a-partir-do-código-fonte)).

```ts
// order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C1", "P1", 2);
});
```

Execute `npx vitest run` e abra `narrativetrace-output/order-service/customer_places_order.md` —
o nome do teste virou o nome do cenário, sem necessidade de interface ou plugin de
build (`traceObject` envolve o objeto concreto diretamente).

Quer continuar — renomear o método e ver a pontuação de clareza cair, adicionar
`@notTraced` e ver um valor ocultado? → [Primeiros 10 minutos](documentation/pt-BR/primeiros-10-minutos.md)
percorre os sete passos com saída real, executada de verdade.

## Escolha sua integração

Os testes são onde a maioria começa. Este é o próximo passo:

| Você quer | Comece com |
|---|---|
| Traces em testes, com o mínimo de fiação | `@narrativetrace/vitest` (`createNarrativeTest`) |
| Escolher exatamente o que é envolvido, em TypeScript/JavaScript puro | `@narrativetrace/proxy` (`traceObject`) diretamente |
| Tracing por requisição em uma app Express | `@narrativetrace/express` |
| Tracing por requisição em Hono (edge/serverless) | `@narrativetrace/hono` |
| Tracing de providers Nest sem código de aplicação | `@narrativetrace/nestjs` (`AutoProxyModule`) |
| Tracing de serviços/DI do Angular + correlação HTTP | `@narrativetrace/angular` |
| Tracing de componentes/serviços React | `@narrativetrace/react` (+ `@narrativetrace/react-router` para navegação) |
| Página de navegador com bundler | `@narrativetrace/core-web` + `@narrativetrace/browser` |
| Página de navegador, sem bundler, `<script>` clássico | `@narrativetrace/standalone` |
| Visibilidade cross-request/async no Node | `AsyncNarrativeContext` (apoiado em `AsyncLocalStorage`) |
| Traces no seu stream de log de produção | `@narrativetrace/winston` ou `@narrativetrace/pino` |
| Spans do OpenTelemetry | `@narrativetrace/opentelemetry` |

Não existe um caminho de código zero, "envolva um app que você não escreveu" — não
há equivalente a um agente Java. `Proxy` e os decorators precisam de um call site
ou de uma classe que você possa anotar; um hook de loader `require`/ESM foi
deliberadamente descartado por ser frágil entre versões do Node e completamente
contornado por bundlers e navegadores. Diagrama de decisão completo, ressalvas
por caminho e o raciocínio por trás do teto da plataforma:
[Escolhendo uma integração](documentation/pt-BR/escolhendo-uma-integracao.md).

## Pacotes

Os 21 pacotes:

| Pacote | Você precisa dele quando... |
|---------|---------------------|
| `@narrativetrace/core` | Sempre necessário. Sem dependências em runtime; agnóstico de plataforma. |
| `@narrativetrace/core-node` | Runtime Node: `AsyncNarrativeContext` (AsyncLocalStorage), configuração por variável de ambiente `NARRATIVETRACE_*`, auto-flush no shutdown. |
| `@narrativetrace/core-web` | Seam de runtime de navegador para o core agnóstico de plataforma. |
| `@narrativetrace/proxy` | Usando tracing com ES Proxy (o mais comum). |
| `@narrativetrace/vitest` | Auto-tracing em testes Vitest + relatório de clareza/falha por teste. |
| `@narrativetrace/diagrams` | Gerando diagramas de sequência Mermaid/PlantUML. |
| `@narrativetrace/clarity` | Analisando a qualidade do naming de métodos/parâmetros; gate de `clarity-results.json`. |
| `@narrativetrace/glossary` | Coletando e renderizando um glossário de domínio (linguagem ubíqua) a partir dos traces; alimenta o vocabulário de projeto do clarity e as views de trace traduzidas. |
| `@narrativetrace/browser` | Renderização no console do navegador e exportação por rede. |
| `@narrativetrace/standalone` | Bundles de um único arquivo (global `<script>` clássico ou módulo ES) para páginas JavaScript puras sem bundler. |
| `@narrativetrace/angular` | Integração com Angular: `provideNarrativeTrace()`, interceptor, tracing de DI. |
| `@narrativetrace/react` | Hooks/provider React para capturar traces de componentes + serviços. |
| `@narrativetrace/react-router` | Captura de navegação do React Router. |
| `@narrativetrace/express` | Middleware Express: contexto por requisição, extratores fail-safe, `onRequestComplete`. |
| `@narrativetrace/hono` | Middleware Hono (edge/serverless), paridade de finalização com `finally`. |
| `@narrativetrace/nestjs` | `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })` do NestJS. |
| `@narrativetrace/observability` | Enriquecedor de escopo de log (`code.*`, `trace_id`, `service.*`, `nt.depth`) + middleware de requisição. |
| `@narrativetrace/opentelemetry` | Ponte OTel: `createOtelEventConsumer` ao vivo + `TraceSpanExporter` em lote. |
| `@narrativetrace/winston` | Consumidor Winston com campos tipados + níveis configuráveis por evento. |
| `@narrativetrace/pino` | Consumidor Pino com campos tipados + níveis configuráveis por evento. |

**Ponto de partida típico:** `core-node`/`core-web` + `proxy` + `vitest`.

## Suporte a concorrência

O trabalho em paralelo continua legível. `ForkJoinGroup` propaga a identidade de
trace do pai (traceId, contexto de requisição/usuário) para cada tarefa
bifurcada e registra o tempo por membro; `FireAndForgetGroup` lança trabalho em
segundo plano que ainda assim aparece no trace.

```ts
import { ForkJoinGroup, FireAndForgetGroup } from '@narrativetrace/core';

// Fork/join — executa verificações de preço + estoque em paralelo sob um grupo compartilhado.
const [price, stock] = await ForkJoinGroup.all(context, [
  (ctx) => traceObject(pricingService, ctx).quote('P1'),
  (ctx) => traceObject(inventoryService, ctx).check('P1'),
]);

// Fire-and-forget — uma notificação que não pode bloquear a resposta.
const bg = FireAndForgetGroup.create(context);
bg.launch((ctx) => traceObject(notificationService, ctx).sendReceipt('C1'));
```

O renderizador Markdown mostra a estrutura de concorrência e para onde o tempo realmente foi:

```
- ⑂ fork [2 tasks]
  - ↦ `InventoryService.check("P1")` → `true` — 40ms
  - ↦ `PricingService.quote("P1")` → `"12.50"` — 110ms
- ⑃ join — 110ms (waited 70ms for PricingService after InventoryService)
```

O trabalho propagado por um snapshot de contexto, em vez de um grupo, se junta
ao trace que o lançou de outra forma: é reportado a partir do momento em que
publica uma chamada, não só quando seu escopo se fecha, e seu primeiro span é
marcado com `concurrency.kind === "async"`. Os helpers que publicam seus
próprios filhos optam por sair com `snapshot.activateWithoutAdoption(...)`.
Veja o [guia de frameworks](documentation/pt-BR/guia-de-integracao-de-frameworks.md#contextsnapshot-propagação-entre-limites).

Chamadas sobrepostas sem `await` sobre um `SyncNarrativeContext` de navegador
compartilhado não são seguras — use um fork/fire-and-forget explícito por
tarefa (veja o [guia de frameworks](documentation/pt-BR/guia-de-integracao-de-frameworks.md)).

## Privacidade e segurança

Esta biblioteca roda dentro do seu processo e escreve arquivos que seu time vai
compartilhar. O que isso significa, em uma tela:

| Garantia | Como ela se sustenta |
|---|---|
| **Toda integração distribuída respeita a ocultação (redaction)** | `traceObject()` é o único caminho de captura sobre o qual toda integração (`express`, `hono`, `nestjs`, `angular`, `react`, `vitest`, …) é construída, e nenhuma delas expõe uma forma de chegar a `RedactionPolicy.DISABLED`. `@notTraced`/`static notTraced` sempre vencem — mesmo sob um renderizador que uma aplicação tenha construído explicitamente com a ocultação desativada. |
| **A ocultação sobrevive ao aninhamento e aos templates** | Um membro ocultado permanece ocultado dentro de um array, `Set`, `Map`, objeto simples, vários empilhados, ou um ciclo autorreferencial; um template de narração `{param.property}` que nomeia um membro ocultado resolve para `[REDACTED]`, nunca para o valor. |
| **Falhas de tracing não podem falhar sua aplicação** | A captura é best-effort por construção — um `toString()` customizado que lança exceção, um getter que lança exceção nomeado em um template, ou um buffer cheio degradam para uma chamada sem trace, nunca bloqueiam ou falham o método de negócio. |
| **O uso de recursos é limitado** | O caminho de análise em buffer é um anel de tamanho fixo (8192 eventos por padrão em testes, 65536 em um processo de longa duração) que descarta em vez de bloquear — e avisa disso: uma captura que perdeu eventos imprime a contagem e o que elevar no seu próprio rodapé. |

Dois limites honestos. Primeiro, a única forma de valores escaparem da
ocultação é código de aplicação que chama diretamente o renderizador de baixo
nível com `RedactionPolicy.DISABLED` — um ato deliberado e revisável no seu
próprio código-fonte, e mesmo assim as anotações `@notTraced`/`static
notTraced` continuam ocultando. Segundo, a captura invoca um pequeno conjunto
fixo do seu código enquanto renderiza — um `toString()` customizado, um
método `@narrativeSummary`, e caminhos de propriedades nomeados em templates
`@narrated`/`@onError` — então mantenha-os puros, como você faria para um
depurador. Também não existe um caminho de código zero, "envolva um app que
você não escreveu", e esta implementação não distribuiu um artefato estrutural sem
valores (alguns outras implementações do NarrativeTrace distribuem) — veja as duas
páginas abaixo para as versões precisas, linha por linha, de ambos.

→ [Privacidade e ocultação](documentation/pt-BR/privacidade-e-ocultacao.md) para
o contrato linha por linha verificado contra o código, e
[O que commitar](documentation/pt-BR/o-que-commitar.md) para saber quais
arquivos gerados manter fora do controle de versão. Quando outra biblioteca
também envolve os mesmos métodos (um contêiner de DI, outro `Proxy`, uma
biblioteca de contrato), o NarrativeTrace narra apenas os cruzamentos de
fronteira de negócio, e qual wrapper fica "mais externo" nunca muda o
resultado ou a exceção que chega à narrativa — veja o FAQ abaixo para o
contrato de coexistência completo.

## Desempenho

O tracing faz trabalho e trabalho custa alguma coisa — não vamos afirmar
"overhead zero". O proxy intercepta chamadas via `Proxy` do ES, captura
parâmetros, renderiza valores em strings e constrói a árvore de trace.
Quando o tracing está desativado, o wrap é trabalho zero por construção:
envolver `NOOP_CONTEXT` devolve o **próprio objeto original** (sem proxy,
sem custo algum por chamada), e um contexto vivo em `level: 'off'` mantém o
proxy (o nível pode mudar em tempo de execução), mas uma chamada não faz
nenhum trabalho de captura — uma consulta ao cache de wrappers e uma
verificação de `isActive`, sem alocação, sem renderização.

Medido (2026-09-07, Node 22, o contêiner de desenvolvimento Linux deste
repositório, `proxy.bench.ts` de `packages/benchmarks`): um método trivial
de dois argumentos rodou a ~9,8M ops/s puro; a mesma chamada através de um
wrapper em `level: 'off'` rodou a ~4,3M ops/s — na ordem de 0,1 µs
adicionados por chamada; o wrap com `NOOP_CONTEXT` foi indistinguível do
objeto puro, porque ele *é* o objeto puro. Com o tracing totalmente ligado
(`detail`: renderização de parâmetros + valores de retorno), a mesma
chamada trivial rodou a ~105K ops/s (~10 µs por chamada) — o custo de
realmente renderizar a história.

O diretório `packages/benchmarks/` contém benchmarks do Vitest para
entrada/saída de contexto, overhead do proxy, renderização de valores e
renderização Markdown/JSON em vários tamanhos de árvore, com baselines
salvas em `reports/benchmarks/` para que uma regressão continue visível
entre commits. Execute `pnpm run bench` (ou `pnpm run bench:save` para
comparar com a baseline salva) para reproduzir os números acima no seu hardware —
reportamos isso como medições que você deve reproduzir, não como números de
manchete, porque a carga do contêiner e da máquina os move de execução em
execução.

Para loops extremamente quentes, use `level: 'off'` ou restrinja o escopo
traçado ao limite que importa.

## O que é grátis e o que é Pro

**Grátis** é tudo o que há neste repositório — disponível como código-fonte
sob a BSL 1.1, grátis em produção, convertendo-se para Apache 2.0 quatro anos
após cada release: todo o runtime, traces por teste em cada formato (Markdown,
JSON, JSON canônico, Mermaid, PlantUML), a pontuação de clareza e o glossário
de domínio, e cada integração das tabelas acima.

**Pro** é inteligência *entre* execuções: agregação de stream de eventos
(`@narrativetrace/pro-aggregate`, hotspots, caminhos/taxas de erro,
frequências de método/erro) e um servidor MCP conectando Claude Code / Cursor
diretamente aos seus traces estão em desenvolvimento; resumos de fluxo, diffs
de migração, diagramas de grafo de dependências, e um conjunto de auditoria e
compliance estão planejados. Nem tudo isso é distribuído hoje — o
[Guia de funcionalidades](documentation/pt-BR/guia-de-funcionalidades.md) é a
tabela de status autorizada: ele rotula cada funcionalidade como Grátis, Pro,
Em desenvolvimento ou Planejada, e cita o código por trás de cada linha já
distribuída.

## Documentação

Comece aqui:

- [Primeiros 10 minutos](documentation/pt-BR/primeiros-10-minutos.md) — um serviço minúsculo, um teste Vitest, sete passos até um trace real, com saída real
- [Guia de instalação](documentation/pt-BR/guia-de-instalacao.md) — dependências, cada caminho de integração, configuração da saída de trace
- [Escolhendo uma integração](documentation/pt-BR/escolhendo-uma-integracao.md) — de qual pacote você precisa, como diagrama de decisão
- [Guia de configuração](documentation/pt-BR/guia-de-configuracao.md) — níveis de tracing, config do Vitest, opções de renderização
- [Guia de decorators](documentation/pt-BR/guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`

Aprofundando:

- [Privacidade e ocultação](documentation/pt-BR/privacidade-e-ocultacao.md) — o contrato de ocultação linha por linha, verificado contra o código
- [O que commitar](documentation/pt-BR/o-que-commitar.md) — quais arquivos gerados são saída de execução e quais (se algum) são baselines revisadas
- [Solução de problemas](documentation/pt-BR/solucao-de-problemas.md) — sintoma → causa → solução para os modos de falha que as pessoas realmente encontram
- [Guia de clareza](documentation/pt-BR/guia-de-clareza.md) — modelo de pontuação, componentes de NLP, scanner estático
- [Guia de integração de frameworks](documentation/pt-BR/guia-de-integracao-de-frameworks.md) — Express, Hono, navegador, AsyncLocalStorage
- [Guia de exemplos](documentation/pt-BR/guia-de-exemplos.md) — o lançador `pnpm demo` e os exemplos executáveis: ecommerce, clarity, Minecraft, JavaScript puro, Express, Hono, distribuído (Docker + Jaeger), navegador
- [Guia de funcionalidades](documentation/pt-BR/guia-de-funcionalidades.md) — catálogo canônico do que esta implementação distribui, com tier e status

## Compilando a partir do código-fonte

```bash
pnpm install                                      # instalar dependências
pnpm run check                                    # lint + métricas + cobertura + mutation testing
pnpm run build                                    # compilar todos os pacotes
pnpm run test                                     # executar todos os testes
```

## Verifique tudo

`pnpm run check` é a checagem de cada commit; `pnpm run verify:all` executa *todas* as verificações que este repositório tem, tanto as rápidas quanto as pesadas — testes unitários, cobertura, mutation testing, testes de propriedades e fuzzing, benchmarks, regras de arquitetura, os dois níveis de teste de estresse, conformidade do esquema canônico, e os scanners de secrets/SAST/SCA — de uma só vez, e grava um relatório datado.

```bash
pnpm run verify:all                               # de longa duração por design — veja abaixo
```

É **de longa duração por design**: o mutation testing em todo o workspace é a categoria mais lenta (dezenas de minutos em um container modesto). A falha de uma categoria nunca interrompe a execução — cada categoria tem sua vez, e o comando só termina com código de erro ao final. Leia o resultado em `reports/verification/<date>.json` (uma linha por categoria: ferramenta, status, métricas, duração) e a tabela `reports/verification/<date>.md` renderizada diretamente a partir dele.

## Perguntas frequentes

### Quanto overhead isso adiciona, e o que acontece sob alta concorrência?

Não afirmamos "overhead zero" — veja [Performance](#performance) acima para os números datados que esta resposta resume (2026-09-07, Node 22, o container deste repositório): com o tracing ativo mas em `level: 'off'`, uma chamada custa da ordem de **0,1 µs** a mais que a chamada não traçada; com detalhe completo (parâmetros e valores de retorno renderizados), custa **~10 µs**. O que o NarrativeTrace em si adiciona é a captura — interceptar a chamada, ler os argumentos, construir a árvore de trace. Tudo depois da captura (a escrita em disco, o collector, o salto de rede) é o mesmo custo que seu sistema de logging já paga; o NarrativeTrace não adiciona um segundo destino. Para uma equipe substituindo chamadas manuais a `console.log`/`logger.debug`, o lado do destino fica quase no zero a zero: N escritas de log por método viram uma escrita de trace, e essas instruções deixam de ser escritas, revisadas e mantidas sincronizadas com o código.

Sob concorrência, os dois caminhos do `DualPathPipeline` padrão têm garantias diferentes. Um listener síncrono, se você conectar um (enviando eventos para winston/pino, por exemplo), roda em linha sobre a própria execução de quem chama, então é exatamente tão durável — e custa exatamente o mesmo — quanto sua chamada de logger atual. O caminho com buffer de análise, o que alimenta `captureTrace()`, é um anel de tamanho fixo (65.536 eventos por padrão, dimensionável por contexto — veja [Guia de configuração § 8](documentation/pt-BR/guia-de-configuracao.md#8-buffer-do-pipeline-de-eventos-bufferedeventconsumer)) esvaziado por um timer. Ele nunca bloqueia quem chama: ao atingir a capacidade, sobrescreve o evento não drenado mais antigo e o **conta** em `overflowCount()` em vez de descartá-lo silenciosamente, então uma sobrecarga sustentada fica visível, não é algo a ser adivinhado.

**O limite honesto:** hoje não existe sampling (amostragem) nesta implementação, nem em nenhuma implementação do NarrativeTrace — toda chamada traçada é capturada por completo no nível configurado. Um amostrador por porcentagem ou por taxa está no roadmap, não foi lançado. Se você precisa limitar o volume de captura hoje, restrinja o escopo traçado ao limite que importa ou baixe o caminho quente para `level: 'off'`/`'errors'`.

### Como sei que um parâmetro com PII ou credenciais não vai vazar em um trace?

Quatro camadas independentes, não uma única promessa geral — veja [Privacidade e ocultação](documentation/pt-BR/privacidade-e-ocultacao.md) para o contrato linha a linha verificado contra o código:

1. **`@notTraced(i)` em um parâmetro / `static notTraced = [...]` em uma classe** — ocultação explícita que você controla, por índice ou por nome de campo. Isso sempre vence, mesmo se algo mais no seu stack chamar o renderizador de baixo nível com a ocultação desligada.
2. **Uma lista de negação por nome, sempre ativa e multilíngue** — todo caminho de captura compara nomes de campos e parâmetros contra padrões como `password`, `secret`, `token`, `ssn`, `cvv`, `apikey`, `cardNumber`, `passphrase`, `bearer`, `taxId`, mais os equivalentes em português (`senha`, `cpf`, `cnpj`), espanhol (`contraseña`, `dni`, `rut`), alemão (`passwort`, `kennwort`) e chinês (`密码`, `身份证`). Está ativa por padrão, não é opcional, e os padrões mais propensos a falsos positivos correspondem nos limites do token identificador — `panelId` e `circuitBreaker` não são capturados por `pan`/`cuit`.
3. **Correspondência pela forma do valor, independente do nome do campo** — uma string com forma de JWT, um número de cartão válido por Luhn, um valor com forma de `Set-Cookie`, ou um dígito verificador ou regra estrutural de identidade nacional (RUT chileno, CPF/CNPJ brasileiro, DNI/NIE espanhol, NIR francês, carteira de identidade de residente chinesa, ou um número do Social Security dos EUA com hífens — a única exceção sem dígito verificador, em que as faixas de área/grupo/série nunca emitidas pela SSA fazem esse papel) é ocultado mesmo que chegue sob um nome inocente como `data` ou `value`.
4. **Ainda não há um modo estrutural sem valores nesta implementação.** Algumas implementações do NarrativeTrace distribuem um artefato tipo `.nt` que carrega o grafo de chamadas e as formas, mas zero valores em tempo de execução — a garantia categórica para um contexto onde nenhum valor pode sair do processo, como entregar um trace a uma ferramenta de IA externa. O TypeScript ainda não construiu isso ([por que](documentation/pt-BR/o-que-commitar.md#por-que-ainda-não-há-uma-linha-approvednt-aqui)); até que exista, trate cada artefato que esta implementação gera como portador de valores reais, protegido pelas três camadas acima.

Seja preciso sobre o limite: a correspondência por nome e por forma é heurística e extensível — os padrões são adicionados à medida que lacunas são encontradas, e sempre podem deixar passar uma que ninguém nomeou ainda. Não é a garantia categórica que o modo sem valores é. Se o seu modelo de ameaça exige "nenhum valor pode jamais sair do processo", essa exigência não é atendida por esta implementação hoje.

### Os IDs de trace podem se correlacionar com um ID de correlação padrão entre serviços, ou o tracing é só local?

Podem, pelo mesmo mecanismo que o próprio OpenTelemetry usa: o [`traceparent`](https://www.w3.org/TR/trace-context/) da W3C. `parseTraceparent()` lê um cabeçalho de entrada e continua o trace anterior; `formatTraceparent()` (core) e o `tracedFetch()`/`traceInterceptor` das integrações de navegador/Angular o estampam nas requisições de saída. O ID de trace que o NarrativeTrace gera já nasce no formato W3C (32 caracteres hexadecimais minúsculos), então é o mesmo ID que seu collector OTel ou middleware de ID de correlação já entende — não há nada para reconciliar à parte. A integração [`opentelemetry`](documentation/pt-BR/guia-de-funcionalidades.md) também exporta os spans do NarrativeTrace com atributos tipados `narrative.param.*`, e o exemplo de tracing distribuído do [Guia de exemplos](documentation/examples-guide.md) roda vários serviços compartilhando um único `traceId` de ponta a ponta.

O que fica local: a árvore narrativa em si — as chamadas de método aninhadas, os argumentos, a narração — é capturada por processo e não é enviada a outros serviços; só o ID de trace é. Um serviço downstream produz sua própria árvore narrativa correlacionada com esse mesmo ID, não uma única árvore combinada entre serviços.

### Como funciona a serialização de valores?

O NarrativeTrace usa **serialização eager** — os valores de parâmetros e de retorno são renderizados em strings no momento da captura, antes de serem armazenados no trace. É uma decisão de design deliberada:

- **Correção:** os objetos são capturados como estavam no momento da chamada. Se um objeto mutável for modificado depois que a chamada traçada retornar, o trace continua mostrando o valor original.
- **Sem retenção de objetos:** o trace armazena apenas strings, não referências aos seus objetos de domínio. Nada impede que seus objetos sejam coletados pelo garbage collector.
- **Renderização segura:** o `renderValue()` embutido trata: null, undefined, strings, números, booleanos, arrays, objetos simples, BigInt, symbols, funções e referências circulares. Valores grandes são truncados (`maxStringLength`, `maxArrayItems`, `maxObjectKeys`).

### O tracing pode disparar efeitos colaterais no meu código?

Só em um conjunto pequeno e documentado de lugares. A introspecção enumera as propriedades próprias enumeráveis (`Object.keys`) — um getter de classe vive no protótipo e nunca é executado. Os membros que o NarrativeTrace *invoca de fato* são: um `toString()` customizado, um método `@narrativeSummary`, e caminhos de propriedades nomeados em templates `@narrated`/`@onError`. Mantenha-os puros, como você faria para um depurador ou serializador — ou liste o campo em `static notTraced`, caso em que seu valor nunca é lido. Toda invocação é limitada e isolada de exceções (um getter que lança exceção nunca pode falhar sua chamada de negócio), thenables nunca são aguardados (`await`), e com o tracing desativado nenhuma renderização acontece. Veja o contrato de pureza no [guia de decorators](documentation/pt-BR/guia-de-decoradores.md).

### Ele traça métodos privados?

Não — o Proxy do ES traça os métodos públicos do objeto. Mas métodos privados são visíveis através das chamadas de serviço que fazem:

```ts
private fulfillOrder(order: Order) {
  if (order.isDigital) {
    this.deliveryService.sendDownloadLink(order.customerId, order.productId);
  } else {
    this.warehouseService.shipPhysical(order.customerId, order.shippingAddress);
  }
  this.notificationService.confirmOrder(order.customerId, order.orderId);
}
```

O trace mostra qual ramo foi executado:

```
OrderService.placeOrder(customerId: "C1", productId: "SKU-EBOOK")
  DeliveryService.sendDownloadLink(customerId: "C1", productId: "SKU-EBOOK") -> "https://..."
  NotificationService.confirmOrder(customerId: "C1", orderId: "ORD-001") -> true
```

Não é preciso traçar o `if` — a presença de `sendDownloadLink` e a ausência de `shipPhysical` contam a história. Os campos `#private` do ES não podem ser interceptados pelo Proxy (limitação da linguagem JavaScript), mas o benefício arquitetural é o mesmo.

### Por que as auto-chamadas não aninham?

Métodos traçados executam com `this` vinculado ao objeto original, não ao proxy (`Reflect.apply(fn, target, args)` dentro do wrapper do método). Um método que chama um irmão no mesmo objeto (`this.validate(order)`) invoca portanto o método original — a chamada executa corretamente, mas não é capturada, então auto-chamadas nunca aparecem como spans aninhados. É uma troca de design deliberada, não uma lacuna: vincular o objeto original torna o proxy imune às armadilhas clássicas de Proxy — campos `#private` (que lançam através de um receptor proxy), built-ins com slots internos (`Map`, `Date`) e campos de arrow function.

O aninhamento vem de envolver os colaboradores, e essa é a única regra estrutural: **decomponha em serviços colaboradores e envolva cada um onde ele é construído.** Uma raiz de composição que envolve `OrderService`, `InventoryService` e `PaymentService` uma vez cada obtém a narrativa aninhada completa — que também é o formato de código que se lê melhor, com ou sem traces.

### Como o NarrativeTrace interage com outras bibliotecas que envolvem métodos (AOP, proxies, bibliotecas de contrato)?

O NarrativeTrace narra cruzamentos de fronteira de negócio, não maquinaria.
Seus próprios mecanismos de anexação são opt-in e deliberadamente estreitos:
`traceObject()` envolve um objeto por vez em um `Proxy` do ES que implementa
apenas a trap `get`, então qualquer outra operação — enumeração de
propriedades, `instanceof`, acesso ao protótipo — passa direto para o que
mais estiver envolvendo o mesmo objeto. Uma lista de exclusão embutida evita
que hooks de coerção/inspeção (`toString`, `valueOf`, `Symbol.toPrimitive`)
sejam narrados como chamadas de negócio, e essa exclusão foi pensada para
crescer conforme lacunas são encontradas, nunca para diminuir.

Quando outra biblioteca também envolve os mesmos métodos — uma biblioteca de
contrato, um proxy AOP, um interceptor de contêiner DI — qual delas fica "mais
externa" só muda o aninhamento cosmético dos frames de trace, nunca quais
fatos chegam à narrativa nem qual acaba sendo o resultado de negócio: uma
exceção lançada ou um valor retornado sempre atravessam todas as camadas sem
modificação. A captura de violações é projetada para ser independente de
ordem em princípio — um fato deveria entrar na narrativa como um evento
emitido a partir da própria fonte, não inferido observando-o se propagar
através de um wrapper — embora o NarrativeTrace ainda não exponha uma API
pública para uma biblioteca de terceiros alimentar um fato assim em um trace
em andamento; isso é rastreado como trabalho futuro, não prometido hoje.

As alavancas disponíveis agora para manter métodos sintéticos ou gerados de
terceiros fora dos seus traces são `@notTraced`/`static notTraced` nas
classes que você controla, e simplesmente não chamar `traceObject()` em uma
superfície que você não quer narrada — ainda não há uma lista de exclusão
padrão em nível de repositório para excluir classes geradas de outra
biblioteca por padrão de nome.

## Licença

A API e o formato de saída do NarrativeTrace são padrões abertos (Apache 2.0).
Seu runtime é grátis e de código-fonte disponível (BSL 1.1, convertendo-se
para Apache 2.0 quatro anos após cada release). Pro é comercial.

O que isso significa para os pacotes deste repositório:

| Parte | Licença |
|---|---|
| O runtime — cada pacote `@narrativetrace/*` publicado a partir deste repositório | [BSL 1.1](LICENSE) (SPDX `BUSL-1.1`), convertendo-se para Apache 2.0 quatro anos após cada release |
| A API de anotações/decorators, a especificação do formato de saída e a rubrica de clareza | [Apache 2.0](LICENSE-APACHE) (a separação em pacote próprio ainda está pendente — veja abaixo) |
| A prosa da documentação | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

O Additional Use Grant permite o uso em produção para qualquer propósito,
inclusive em produtos e serviços que você oferece aos seus próprios clientes;
a única exclusão é oferecer o NarrativeTrace em si — ou um produto ou serviço
cujo valor derive substancialmente dele — a terceiros como um produto ou
serviço de logging, tracing ou narrativa de código. Veja [LICENSE](LICENSE)
para os termos exatos, ou entre em contato com <hello@narrativetrace.ai> sobre
outros acordos.

<!-- legal:trademark:begin -->
NarrativeTrace é uma marca da Empower Agile. A licença não concede nenhum direito de marca.
<!-- legal:trademark:end -->

### A licença, em palavras simples

Tudo neste repositório é publicado sob a Business Source License 1.1 hoje — as partes com licença
Apache (a API de anotações/decorators, a especificação do formato de saída, a rubrica de clareza)
ainda não foram separadas em um pacote próprio.

<!-- legal:plain-words:begin -->
**Grátis para rodar.** O runtime é de código disponível sob a Business Source
License 1.1: você pode lê-lo, auditá-lo, corrigi-lo e usá-lo em produção sem
custo — inclusive dentro dos produtos e serviços que você vende aos seus
próprios clientes.

**Uma única exclusão.** Você não pode oferecer o próprio NarrativeTrace — ou um
produto ou serviço cujo valor derive substancialmente dele — a terceiros como
produto ou serviço de logging, tracing ou narrativa de código.

**Ela se abre em uma data.** Cada versão lançada se converte para Apache 2.0
quatro anos após ser publicada; a data exata é impressa no LICENSE daquela
versão.

*Este resumo é uma cortesia, não uma licença. O arquivo LICENSE é o único texto
vinculante; onde os dois divergirem, o LICENSE prevalece.*
<!-- legal:plain-words:end -->
