<!-- source: documentation/examples-guide.md blob 8891c8628175 | translated: 2026-09-03 | reviewed: - -->
# Guia de exemplos

[English](../examples-guide.md) | [Español](../es/guia-de-ejemplos.md) | **Português** | [简体中文](../zh-CN/示例指南.md)

O NarrativeTrace vem com 12 exemplos executáveis em `examples/`. Cada um é um pacote independente com seus próprios testes. Quatro deles — ecommerce, clarity, minecraft (as duas metades) e plain-js — também podem ser acessados pelo launcher `pnpm demo`, descrito [abaixo](#lançador-da-demo).

## Referência rápida

| Exemplo | O que demonstra | Comando de execução |
|---|---|---|
| [ecommerce](#ecommerce) | O carro-chefe: seis cenários em um grafo de serviços traced — sucesso, falhas, um decorador instável, fork/join | `pnpm run example:ecommerce` |
| [clarity](#clareza) | O que o analisador de clareza recompensa e penaliza: um domínio de hotel em quatro níveis de nomenclatura, mais o relatório | `pnpm run example:clarity` |
| [express](#express) | Middleware do Express + contexto de trace HTTP | `pnpm run example:express` |
| [hono](#hono) | Middleware do Hono + contexto de trace HTTP | `pnpm run example:hono` |
| [distributed](#distribuído) | 5 microsserviços + Jaeger + correlação OTel | `pnpm run example:distributed` |
| [minecraft](#minecraft) | Nomenclatura orientada a domínio, legibilidade do trace | `pnpm run example:minecraft` |
| [minecraft-generic](#minecraft-generic) | Nomenclatura genérica, comparação de traces | `pnpm run example:minecraft-generic` |
| [plain-js](#plain-js) | A API a partir de JavaScript puro: `.mjs`, tipos JSDoc, sem decoradores | `pnpm run example:plain-js` |
| [script-tag](#tag-script) | Página no navegador com tags `<script>` clássicas: `window.NarrativeTrace` a partir de um único arquivo empacotado, sem bundler | `pnpm run example:script-tag` |
| [browser](#navegador) | Página Vite: trace renderizado na própria página, console do DevTools, POST para o collector | `pnpm run example:browser` |
| [express-angular](#angular--express) | Full-stack: frontend Angular + backend Express | `pnpm run example:express-angular` |
| [nestjs-react](#nestjs--react) | Full-stack: tracing por DI zero-code do NestJS + frontend React | `pnpm --filter @narrativetrace/example-nestjs-react start` |

## Lançador da demo

`pnpm demo` é a forma mais rápida de assistir aos exemplos: um único comando, a narração ao vivo colorida
e indentada pela profundidade da chamada, e cada renderização anunciada como sua própria seção. Ele abre um
seletor interativo; `--example <name>` executa de forma não interativa; `--list` enumera os exemplos.
Faça o build uma vez primeiro (`pnpm run build`) — os exemplos importam o `dist` dos pacotes.

```bash
pnpm demo                                     # seletor: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce              # não interativo
pnpm demo -- --example ecommerce --classic    # logs com timestamp via a ponte do winston
pnpm demo -- --example ecommerce --no-pause   # roda direto do início ao fim, sem pontos de parada
pnpm demo -- --example ecommerce --lang es    # renderiza novamente a execução usando examples/ecommerce/glossary.json
pnpm demo -- --list
```

**Ele caminha, não rola.** Em um terminal, a demo para depois de cada cenário — `[Enter]`
avança, `q` sai — e cada cenário começa com uma nota sobre *como o trace daquele cenário está
configurado*: `@traced`/`@narrated`/`@onError`/`@notTraced` aqui, um `traceObject` simples com um
mapa `paramNames` ali, `ForkJoinGroup` para o concorrente. As notas ficam junto ao código no
`src/scenarios.ts` de cada exemplo (`Scenario { title, wiring, run }`), e o teste raiz
`tools/__tests__/demo-wiring.test.ts` falha se um cenário perder sua nota ou se o registro e o
`--list` divergirem. Execuções pausadas são gravadas primeiro e só depois exibidas passo a passo, então um
ponto de parada nunca pode inflar as durações que a árvore de trace reporta; `--no-pause` reproduz a execução
direto do início ao fim, ao vivo, e é o que pipes e o CI recebem. `NO_COLOR` remove as cores, `FORCE_COLOR` as
mantém em um pipe.

**De onde vêm as renderizações** é respondido uma vez por execução, na primeira seção de renderização.
Não existe renderer padrão nem nada para configurar: a captura produz uma `TraceTree` e você chama
o renderer que quiser — `renderIndentedText(tree)`, `renderProse`, `renderMermaidSequence`,
`renderPlantUmlSequence`. As linhas ao vivo `→ ← !!` não são um renderer: isso é um
`EventConsumer` no caminho inline do `DualPathPipeline` do exemplo (`tools/demo-stream.ts`, o
gêmeo do `Slf4jTraceEventListener` do Java) — a única visão que não custa nenhum código de renderização.
A configuração seleciona um renderer em exatamente um lugar, os arquivos de trace escritos pelos testes:
`NARRATIVETRACE_OUTPUT=true` mais `NARRATIVETRACE_FORMAT=md|mmd|json|puml`.

**A saída de log clássica é um modo de primeira classe.** `--classic` envia a mesma execução por
`@narrativetrace/winston` com um formato tradicional `yyyy-MM-dd HH:mm:ss.SSS LEVEL [thread] [logger] -
message` — o ponto é que a narração vira linhas de log comuns, que qualquer ferramenta de log consegue ingerir.

**Traces traduzidos também são um modo de primeira classe.** Cada exemplo do launcher commita um glossário
de domínio (`examples/<name>/glossary.json` — um bounded context com termos selecionados em espanhol e
chinês simplificado), e `--lang es` (ou `zh-CN`) renderiza novamente a mesma execução através dele: os
identificadores aparecem no idioma escolhido com o original mantido entre colchetes (`buscar cliente
[findCustomer]`), enquanto os valores de parâmetros, valores de retorno e mensagens de erro permanecem byte
a byte idênticos. O seletor oferece exatamente os locales que o glossário *e* o pacote de scaffolding da
biblioteca carregam. Frases não traduzidas se acumulam em um rodapé de "lacunas do glossário" — a fila de
trabalho de curadoria — e os cenários com nomes ruins (a metade não refatorada do minecraft, o processamento
legado do clarity) permanecem intencionalmente não traduzidos: nomes que não contam nenhuma história não
podem ser traduzidos para uma. Os templates de `@narrated`/`@onError` estão nos glossários, mas ainda não
foram traduzidos (o schema de exportação ainda não carrega o template).

Código do launcher: `tools/demo.ts` (integração com o terminal), `tools/demo-runner.ts` (orquestração, testada
contra um terminal falso), `tools/demo-args.ts`, `tools/demo-colors.ts`, `tools/demo-stream.ts`,
`tools/demo-registry.ts`, `tools/demo-translate.ts`. Zero dependências de runtime além do workspace; execute
a partir da raiz do repositório.

## Ecommerce

O carro-chefe. Cinco serviços em memória (customer, catalog, inventory, payment, notification) são
envolvidos com `traceObject()`; a orquestração interessante é a `DefaultOrderService`. Os nomes dos
parâmetros vêm de `@traced`, a narração em `placeOrder` vem de `@narrated`, o texto de falha entre
colchetes vem de `@onError`, e o token do cartão é impresso como `[REDACTED]` graças a `@notTraced(2)`.
`src/scenarios.ts` executa os seis cenários do Java, cada um imprimindo `--- Trace tree ---`, `--- Prose ---`
e `--- Mermaid ---` (ou PlantUML):

1. **Pedido bem-sucedido + notificação assíncrona** — o caminho feliz; a notificação aguardada (`await`)
   cai no mesmo trace porque o `AsyncNarrativeContext` carrega o span através do `await`.
2. **Falha de pagamento — bug de vazamento no inventário** — o trace mostra que `InventoryService.reserve`
   foi chamado, mas `release` nunca foi: o trace expõe um bug real.
3. **Serviço externo instável** — `FlakyNotificationService` decorando um stub tem sucesso uma vez, depois
   lança `ExternalServiceError`; envolvido com um `traceObject` simples no local da chamada.
4. **Cliente desconhecido** — ramo de falha de validação de entrada.
5. **Fora de estoque** — ramo de falha de regra de negócio, também renderizado como PlantUML.
6. **Captura assíncrona explícita** — `ForkJoinGroup.all` sobre duas consultas concorrentes a
   `RemoteCatalogService`, unidas em um único segmento `⑂ fork`.

```bash
pnpm run example:ecommerce      # todos os cenários, apenas as seções (o launcher adiciona o stream ao vivo)
pnpm demo -- --example ecommerce
```

**Arquivos principais:**
- `examples/ecommerce/src/scenarios.ts` — o registro de cenários com as notas de wiring
- `examples/ecommerce/src/scenario.ts` — `Scenario`/`ScenarioContext` e `createDemoContext(listener)`
- `examples/ecommerce/src/traced-services.ts` — factory `createTracedServices()`
- `examples/ecommerce/src/order-service.ts` — orquestrador que chama todos os outros serviços
- `examples/ecommerce/glossary.json` — o bounded context que o `--lang` traduz

## Clareza

O `ClarityDemoExample` do Java: um domínio de reserva de hotel em quatro níveis de qualidade de
nomenclatura, seguido pelo relatório de clareza sobre as quatro árvores capturadas. O wiring é idêntico
entre os níveis — a variável sob teste é a nomenclatura, não a configuração.

1. **Hóspede reserva um quarto** — nomenclatura excelente, específica do domínio (`DefaultReservationService`).
2. **Reserva via manager** — nomenclatura adequada, porém menos expressiva (`DefaultBookingManager`).
3. **Processamento de dados legado** — nomenclatura intencionalmente fraca (`DefaultDataProcessor`).
4. **Operações do repositório de hóspedes** — uma incompatibilidade de coesão (busca, renderização de
   relatório e e-mail em um único repositório).
5. **Relatório de análise de clareza** — `analyzeClarity` sobre as árvores capturadas, impresso com
   `renderClarityReport` e `renderClaritySuiteReport`.

```bash
pnpm run example:clarity
pnpm demo -- --example clarity
```

**Arquivos principais:**
- `examples/clarity/src/scenarios.ts` — `createClarityScenarios()`; o cenário do relatório lê as
  árvores capturadas pelos quatro primeiros
- `examples/clarity/src/reservation-service.ts` — o nível bem-nomeado

## Express

Um servidor HTTP Express que envolve os serviços do ecommerce com o middleware `narrativeTrace()`. Cada requisição recebe seu próprio contexto de trace via `AsyncNarrativeContext`.

```bash
pnpm run example:express
```

Depois abra `http://localhost:3000` em um navegador. Envie o formulário de pedido — a resposta JSON inclui tanto o resultado do pedido quanto a árvore de trace completa.

**Arquivos principais:**
- `examples/express/src/app.ts` — app Express com o middleware `narrativeTrace(ctx)`

## Hono

O mesmo que o exemplo Express, mas usando o framework Hono.

```bash
pnpm run example:hono
```

Abra `http://localhost:3001`. Mesmo formulário de pedido, mesmo trace na resposta.

**Arquivos principais:**
- `examples/hono/src/app.ts` — app Hono com o middleware `narrativeTrace(ctx)`

## Distribuído

Cinco microsserviços rodando em containers Docker, conectados via HTTP, com correlação de trace distribuído através do OpenTelemetry e do Jaeger.

**Arquitetura:**

```
Browser → Gateway (:3000) → Customer-Catalog (:3001)
                           → Inventory (:3002)
                           → Payment (:3003) → Fraud (:3004)
```

Todos os serviços compartilham o mesmo `traceId` via propagação do header W3C `traceparent`. Cada serviço produz tanto traces no nível de método do NarrativeTrace quanto spans OTel.

### Pré-requisitos

- Docker e Docker Compose

### Executando

```bash
pnpm run example:distributed
```

Isso sobe 6 containers:

| Container | Finalidade | Porta exposta |
|---|---|---|
| jaeger | Collector de trace + UI | `localhost:16686` |
| gateway | API gateway, orquestra o fluxo do pedido | `localhost:3000` |
| customer-catalog | Busca de clientes + produtos | interno |
| inventory | Reserva de estoque | interno |
| payment | Processamento de pagamento, chama o fraud | interno |
| fraud | Avaliação de fraude | interno |

### Fazendo um pedido

Abra `http://localhost:3000` em um navegador. Envie o formulário de pedido com um cliente, um produto e uma quantidade.

A resposta JSON inclui:
- `order` — o resultado do pedido (totalCharged, transactionId)
- `trace` — a árvore do NarrativeTrace sob a perspectiva do gateway

### Visualizando traces no Jaeger

Abra `http://localhost:16686`. Selecione um serviço no dropdown (por exemplo, `api-gateway`) e clique em **Find Traces**. Clique em um trace para ver a árvore completa de spans distribuídos entre os 5 serviços.

**Experimente estes cenários:**
- **C1 + P1** — caminho feliz, todos os serviços têm sucesso
- **C3 + P1** — pagamento recusado (Charlie está na blacklist), o trace mostra a propagação do erro por payment → gateway
- **Any + P2 qty 999** — estoque insuficiente, o serviço de inventory rejeita a reserva

### Parando

```bash
docker compose -f examples/distributed/src/docker-compose.yml down
```

**Arquivos principais:**
- `examples/distributed/src/gateway-app.ts` — orquestra as chamadas aos serviços downstream
- `examples/distributed/src/traced-service-factory.ts` — cria contextos de trace integrados com OTel
- `examples/distributed/src/docker-compose.yml` — definições dos containers

## Minecraft

Um domínio inspirado em Minecraft (world generator, player inventory, crafting table, creature spawner, world server) com nomes descritivos e orientados a domínio. O trace se lê como documentação.

```bash
pnpm run example:minecraft
```

**Saída:**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", ...}
  PlayerInventory.addItem(item: {"name": "oak_log", ...}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", ...}) -> {"name": "oak_planks", ...}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> ...
-> "Steve joined the world in plains biome"
```

## Minecraft-Generic

Exatamente a mesma lógica do exemplo minecraft, mas com nomes genéricos e opacos (GameManager, DataProcessor, StateManager, ThingFactory, EntityHandler). Compare os dois traces lado a lado — a diferença na qualidade da nomenclatura é imediatamente visível. Este é o argumento central do NarrativeTrace: se o seu trace é ilegível, o seu código precisa de renomeação, não de mais statements de log.

```bash
pnpm run example:minecraft-generic
pnpm demo -- --example minecraft     # as duas metades, a refatorada primeiro, como no exemplo único do Java
```

As duas metades usam exatamente o mesmo wiring, byte a byte — `traceObject(impl, context, paramNames,
{ className })`, sem decoradores — então é o mapa `paramNames` que nomeia os parâmetros.

## Plain-JS

O análogo, nesta plataforma, do exemplo Kotlin `library` do Java: um consumidor ESM em JavaScript puro
(`.mjs`, tipos JSDoc verificados por `tsc --checkJs`, sem decoradores, sem TypeScript) fazendo tracing de um
pequeno domínio de empréstimo de livros (`CatalogService`, `MemberService`, `LendingService`) via
`traceObject` com mapas `paramNames`. Dois cenários: um empréstimo bem-sucedido (tree, prose, Mermaid) e uma
falha `BookUnavailableError`.

```bash
pnpm run example:plain-js
pnpm demo -- --example plain-js
```

**Arquivos principais:**
- `examples/plain-js/src/scenarios.mjs` — o registro, `createTracedLendingService(context)`
- `examples/plain-js/src/lending-service.mjs` — recebe um clock injetável para que os testes sejam reprodutíveis

## Navegador

Uma página de navegador real, servida pelo Vite. Ela usa `SyncNarrativeContext` (sem `AsyncLocalStorage` no navegador) e `@narrativetrace/core-web` para o gerador de id do Web Crypto. Ao clicar em **Run traced calculation**, uma `Calculator` é envolvida com `traceObject()`, incluindo um `divide(1, 0)` capturado para que um resultado `✗` fique visível, e então:

- renderiza o trace na página com `renderIndentedText`,
- espelha para o console do DevTools com `renderToConsole`,
- envia via POST como JSON com `postToCollector` para `/traces`, um middleware collector exclusivo de desenvolvimento em `vite.config.ts` que registra cada trace recebido no terminal. A página reporta o resultado (accepted / rejected / unreachable).

```bash
pnpm run example:browser      # servidor de desenvolvimento do Vite em http://localhost:5175
```

Os testes rodam sob jsdom com `core-web` (nunca `core-node`), então a suíte exercita o caminho da plataforma de navegador; `pnpm --filter @narrativetrace/example-browser build` faz a checagem de tipos e produz um bundle de produção com `vite build`.

**Arquivos principais:**
- `examples/browser/index.html` — a página; carrega `src/app.ts`
- `examples/browser/src/app.ts` — ponto de entrada: importa `@narrativetrace/core-web`, monta a demo
- `examples/browser/src/demo.ts` — `mountDemo()`: tracing, renderização na página + no console, exportação para o collector
- `examples/browser/src/calculator.ts` — a classe traced
- `examples/browser/vite.config.ts` — servidor de desenvolvimento + middleware collector `/traces`

## Tag script

A contraparte no navegador do [plain-js](#plain-js): JavaScript puro em uma página web, **sem TypeScript, sem bundler, sem módulos ES**. `public/index.html` carrega dois scripts clássicos em ordem: `/narrativetrace.global.js` — o bundle do [`@narrativetrace/standalone`](../../packages/standalone/README.md), que define `window.NarrativeTrace` e registra o gerador de id do navegador — e `/app.js`, JavaScript escrito à mão em estilo ES5 (função construtora + métodos de protótipo; `traceObject` não se importa com como os objetos são construídos). Ao clicar em **Run traced checkout**, um `ShoppingCart` é traceado, incluindo um `checkout("EXPIRED")` capturado para que um resultado `✗` fique visível; em seguida o trace é renderizado na página, espelhado no console do DevTools e enviado via POST para `/traces`.

Um servidor `node:http` de ~60 linhas (`src/server.ts`) serve os três arquivos a partir de uma tabela de rotas explícita (sem percorrer diretórios) e responde a `POST /traces` com 202 enquanto registra `[collector] received trace (N bytes)`; qualquer outro método em `/traces` recebe 405, qualquer outra coisa recebe 404.

```bash
pnpm run example:script-tag      # http://localhost:5176
```

Testes: o servidor contra uma porta efêmera (rotas, content types, collector, 405/404, traversal), e o próprio `app.js` sob jsdom — carregado da mesma forma que um navegador faria (corpo HTML, depois os dois scripts clássicos) — verificando as quatro linhas de trace renderizadas e os status accepted / rejected / unreachable do collector.

**Arquivos principais:**
- `examples/script-tag/public/index.html` — a página; se explica em comentários HTML
- `examples/script-tag/public/app.js` — a aplicação em JavaScript puro
- `examples/script-tag/src/server.ts` — rotas estáticas + collector `/traces`; `src/entry.ts` o inicia

## Angular + Express

Exemplo full-stack: frontend Angular chamando o backend Express do ecommerce, com correlação de trace ponta a ponta.

Demonstra todos os recursos do `@narrativetrace/angular`:
- `provideNarrativeTrace()` — configuração em uma chamada, com headers `traceparent` automáticos
- `provideTraced(OrderService)` — tracing de serviço zero-code via DI do Angular
- `TraceCaptureService` — captura o trace do lado do cliente após cada pedido
- `traceInterceptor` — adiciona automaticamente o header W3C `traceparent` a cada requisição `HttpClient`

### Executando

```bash
pnpm run example:express-angular
```

Isso inicia o backend Express em `:3000` e o servidor de desenvolvimento do Vite em `:4200`. Abra `http://localhost:4200`.

Faça um pedido e veja:
- **Order result** — orderId, transactionId, totalCharged
- **Client trace** — trace do lado do Angular mostrando `OrderService.placeOrder` (via `provideTraced`)
- **Server trace** — trace do lado do Express mostrando CustomerService, CatalogService, InventoryService, PaymentService
- **Trace ID** — mesmo ID de 32 hex em ambos os lados (correlação por traceparent)

**Arquivos principais:**
- `examples/express-angular/client/app.config.ts` — configuração de `provideNarrativeTrace()` + `provideTraced(OrderService)`
- `examples/express-angular/client/order.service.ts` — wrapper de `HttpClient`, auto-traced
- `examples/express-angular/client/order-form.component.ts` — UI do formulário + exibição do trace
- `examples/express-angular/server/app.ts` — backend Express com CORS + middleware `narrativeTrace(ctx)`

## NestJS + React

Exemplo full-stack: um backend NestJS que traceia seu grafo de serviços com **zero código de aplicação** via injeção de dependência do Nest, combinado com um frontend React que traceia as chamadas do lado do cliente. Os dois lados retornam sua árvore de trace, para que você veja a requisição de ponta a ponta.

Demonstra:
- `AutoProxyModule.forRoot(...)` — módulo `@narrativetrace/nestjs` que faz auto-proxy de cada provider (`OrdersService`, `InventoryService`, `PaymentService`), de forma que as chamadas de método são traceadas sem tocar no corpo dos serviços
- `NarrativeStorage` — injetado no `OrdersController` para fazer `captureTrace()` da requisição atual
- `@narrativetrace/react` no cliente — `NarrativeTraceProvider`, `useTraced()` (envolve `OrderService`), `useTracedFetch()`, e `useTraceCapture()` para o trace do lado do cliente

### Executando

O exemplo não tem um script `example:` na raiz; execute-o através dos próprios scripts do `package.json` do pacote, com `pnpm --filter`:

```bash
# Inicia o servidor NestJS e o servidor de desenvolvimento do Vite juntos
pnpm --filter @narrativetrace/example-nestjs-react start

# ...ou inicia cada um de forma independente
pnpm --filter @narrativetrace/example-nestjs-react start:server   # NestJS em :3000
pnpm --filter @narrativetrace/example-nestjs-react start:client   # Servidor de desenvolvimento do Vite em :5173
```

O backend NestJS escuta em `:3000` (substituível com `PORT`) e o servidor de desenvolvimento do Vite em `:5173`, fazendo proxy de `/orders` para o backend. Abra `http://localhost:5173`.

Faça um pedido e veja:
- **Order result** — orderId (`ORD-*`), transactionId (`TXN-*`), totalCharged
- **Client trace** — trace do lado do React de `OrderService.placeOrder` (via `useTraced`)
- **Server trace** — trace do lado do NestJS de `OrdersService` → `InventoryService` / `PaymentService`, auto-proxied pela DI

### Testes

```bash
pnpm --filter @narrativetrace/example-nestjs-react test
```

**Arquivos principais:**
- `examples/nestjs-react/server/app.module.ts` — wiring do `AutoProxyModule.forRoot(...)`
- `examples/nestjs-react/server/orders.controller.ts` — captura o trace da requisição via `NarrativeStorage` injetado
- `examples/nestjs-react/server/orders.service.ts` — orquestrador (`InventoryService` + `PaymentService`)
- `examples/nestjs-react/client/order-form.tsx` — `useTraced` / `useTracedFetch` / `useTraceCapture` + exibição do trace

## Executando todos os exemplos

```bash
pnpm run example:all
```

Executa ecommerce, minecraft, minecraft-generic, clarity e plain-js sequencialmente, depois inicia express e hono em paralelo. O exemplo distributed requer Docker e roda separadamente. Para o tour guiado e pausado, use `pnpm demo`.

## Executando os testes

Cada exemplo tem sua própria suíte de testes:

```bash
cd examples/ecommerce && pnpm run test      # 51 testes (domínio + tracing + os seis cenários)
cd examples/clarity && pnpm run test        # 8 testes (domínio + os níveis e o relatório)
cd examples/express && pnpm run test         # 4 testes
cd examples/hono && pnpm run test            # 5 testes
cd examples/distributed && pnpm run test     # 40 testes
cd examples/minecraft && pnpm run test       # 22 testes (domínio + integração de tracing)
cd examples/minecraft-generic && pnpm run test  # 18 testes
cd examples/plain-js && pnpm run test        # 8 testes (.mjs tipado com JSDoc)
cd examples/browser && pnpm run test         # 4 testes
cd examples/express-angular && pnpm run test # 16 testes (server + componentes e services do Angular)
cd examples/nestjs-react && pnpm run test    # 13 testes (NestJS supertest + componentes e services do React)

# Ou execute tudo via turbo:
pnpm run test

# Os testes do próprio launcher (parser, colorizer, stream, checagem de registry/wiring, tradução, runner)
pnpm run test:root
```
