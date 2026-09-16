<!-- source: documentation/sixty-seconds.md blob bb2f0edb007e | translated: 2026-09-16 | reviewed: - -->
# Veja um trace em 60 segundos

[English](../sixty-seconds.md) | [Español](../es/sesenta-segundos.md) | **Português** | [简体中文](../zh-CN/60秒.md)

Sem instruções de log, sem framework de testes, sem nenhum arquivo para abrir depois. Um script
simples, uma execução, e o trace aparece no seu terminal. Tudo abaixo foi executado de verdade
contra os pacotes publicados `@narrativetrace/core-node` e `@narrativetrace/proxy` — a saída está
colada como saiu, não é imaginada. Precisa de Node 20+ (o pacote publicado `@narrativetrace/core`
declara isso em `engines`); pnpm é usado abaixo, mas o npm também funciona, com uma diferença
explicada no passo 1.

## 1. Projeto novo, adicione o(s) pacote(s)

```bash
mkdir narrativetrace-quickstart && cd narrativetrace-quickstart
pnpm init
pnpm add @narrativetrace/core-node @narrativetrace/proxy
```

`core-node` reexporta tudo que existe em `@narrativetrace/core` e registra o gerador de id do
Node. Usar apenas `@narrativetrace/core` também funciona — ele recorre diretamente ao Web Crypto
quando disponível — mas `core-node` é o caminho testado e documentado. `pnpm init` grava um
`package.json` com `"type": "module"`, então a sintaxe `import` abaixo
funciona sem nenhuma outra configuração. Está usando npm? `npm init -y` usa CommonJS por padrão —
rode `npm pkg set type=module` logo depois (antes do `npm add`), ou o `import` do passo 2 falha
com `SyntaxError: Cannot use import statement outside a module`.

## 2. O programa

```js
// index.js
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```

`OrderService` é uma classe comum — sem interface, sem classe base, sem decorator obrigatório.
`traceObject()` encapsula a instância concreta em um `Proxy` de ES; seu terceiro argumento fornece
os nomes dos parâmetros de `placeOrder`, porque o JavaScript não os preserva em tempo de execução.
Chame o objeto encapsulado em vez do original, e cada chamada que ele fizer é registrada no
`context`.

## 3. Execute

```bash
node index.js
```

Saída real, da execução que produziu esta página:

```text
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 0.5849169999999901ms
```

O `Nms` no final é tempo de relógio — vai ser um número diferente na sua máquina, e um número
diferente na próxima vez que você executar. Todo o resto da linha é determinístico: o nome da
classe, o nome do método, os nomes e valores dos parâmetros, e o valor de retorno.

Você não escreveu nenhuma instrução de log. A narrativa veio do nome do seu método, dos nomes dos
seus parâmetros e do valor que o método retornou — a informação já estava ali.

## O que acabou de acontecer

- **Um contexto** (`new SyncNarrativeContext(new NarrativeTraceConfig())`) é onde as chamadas são
  registradas — um objeto comum, não um global, não um singleton. (Código Node que atravessa um
  `await` ao longo de uma requisição precisa do `AsyncNarrativeContext` em vez disso; veja o
  [Guia de Integração de Frameworks](guia-de-integracao-de-frameworks.md).)
- **O encapsulamento** (`traceObject(new OrderService(), context, {...})`) é a única linha que
  liga o rastreamento para aquele objeto. Nada em `OrderService` mudou — sem import, sem classe
  base, sem anotação. Uma classe que você possui pode usar os decorators `@traced`/`@narrated` em
  vez do mapa de nomes de parâmetros; veja o [Guia de Decoradores](guia-de-decoradores.md).
- **Capture e depois renderize** — `context.captureTrace()` tira um retrato do que aconteceu em
  uma árvore comum; `renderMarkdownBody()` é um dos vários renderizadores sobre essa mesma árvore.
  `renderIndentedText()` desenha uma árvore ASCII em vez disso, `@narrativetrace/diagrams`
  transforma isso em um diagrama de sequência Mermaid ou PlantUML, e o `renderToConsole()` do
  `@narrativetrace/browser` imprime tudo formatado no console do DevTools do navegador.

## Envie para o seu logger

A linha de console acima é apenas um dos renderizadores sobre o trace; o mesmo trace pode fluir
direto para o logger que você já usa em produção. Adicione a ponte do
[Pino](https://github.com/pinojs/pino) (`@narrativetrace/winston` funciona do mesmo jeito se
Winston for o seu logger — troque o import por `createWinstonEventConsumer`). As linhas comentadas
abaixo são a mudança em relação ao passo 1:

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
```

```js
// index-with-logger.js
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  DualPathPipeline, // distribui os eventos para dois consumidores: a ponte do pino e o buffer em memória
  BufferedEventConsumer, // mantém o captureTrace() funcionando junto com o logger
  parseTraceparent, // transforma um cabeçalho traceparent no id de trace fixado abaixo
  renderMarkdownBody,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createPinoEventConsumer } from "@narrativetrace/pino"; // conecta os eventos de trace ao Pino
import pino from "pino";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

// Uma constante documentada só para ESTE exemplo — nunca o padrão da biblioteca, que sempre
// gera um id de trace aleatório — para que nt.traceName/trace_id abaixo continuem com a mesma
// frase toda vez que a saída desta página for regenerada.
const FIXED_TRACEPARENT = "00-a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4-a1b2c3d4a1b2c3d4-01";
const fixedTraceId = parseTraceparent(FIXED_TRACEPARENT);

const logger = pino(); // qualquer instância do pino funciona — esta mantém os valores padrão
const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
const context = new SyncNarrativeContext(
  new NarrativeTraceConfig(),
  undefined, // parentResolver — um script simples não tem nenhum span pai ambiente para resolver
  pipeline, // encaminha os eventos tanto para o logger acima quanto para o buffer que o captureTrace() lê
  null, // rootParentOverride — sem span pai de entrada para esta chamada raiz
  undefined, // serviceIdentity — não é necessário para este exemplo
  fixedTraceId, // semeia o id de trace que um cabeçalho traceparent de entrada carregaria em uma requisição real
);
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```

```bash
node index-with-logger.js
```

Saída real, da execução que produziu esta página:

```text
{"level":30,"time":1789269258472,"pid":22805,"hostname":"9a9362dce156","code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C1\""},{"name":"productId","value":"\"P1\""},{"name":"quantity","value":"2"}],"trace_id":"a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4","nt.traceName":"loose hook parks","span_id":"5bbbf25ced9a35c4","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 1ms
{"level":30,"time":1789269258474,"pid":22805,"hostname":"9a9362dce156","nt.outcome":"returned","nt.depth":0,"trace_id":"a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4","nt.traceName":"loose hook parks","span_id":"5bbbf25ced9a35c4","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C1-P1-2\"","msg":"← returned: \"ORD-C1-P1-2\""}
```

`time`, `pid`, `hostname` e `span_id` ficam fixados em um valor de preenchimento para esta amostra
capturada — uma execução real cunha os quatro de novo, do mesmo jeito que a duração, e na sua
máquina você vai ver valores diferentes em cada execução. `trace_id` e `nt.traceName` são os únicos
identificadores que realmente são os mesmos em toda execução, porque a constante
`FIXED_TRACEPARENT` faz o papel de um cabeçalho `traceparent` que uma requisição real de upstream
enviaria; veja o Guia de Integração de Frameworks para ler um a partir de uma requisição de
verdade. Não existe nenhum campo `nt.runName` aqui — um script simples não pertence a nenhuma
execução de suíte de testes, então não há execução nenhuma para nomear (a opção `runName` de
`createPinoEventConsumer` é como um caller que TEM uma — `runIdentity().name` de
`@narrativetrace/vitest`, entre outros — a adiciona). Isso prova que o trace chega ao destino que
você já tem, sem alterar a saída de console. Configuração completa (níveis por evento, a opção
`runName`, o mixin `LogContext` para marcar suas próprias linhas de log, configuração do Winston):
[Guia de Integração de Frameworks § Winston & Pino](guia-de-integracao-de-frameworks.md#9-winston--pino).

## Próximos passos

| Você quer | Vá para |
|---|---|
| Usar isso nos seus testes | [Guia de Instalação § Opção B: Plugin do Vitest](guia-de-instalacao.md#opção-b-plugin-do-vitest-auto-contexto--saída-de-trace) |
| Manter um valor fora do trace (ocultação) | [Privacidade e Ocultação](privacidade-e-ocultacao.md) |
| Pontuar a clareza dos seus nomes | [Guia de Clareza](guia-de-clareza.md) |
| Cada opção de configuração | [Guia de Configuração](guia-de-configuracao.md) |
| Algo acima não funcionou como mostrado | [Solução de Problemas](solucao-de-problemas.md) |
