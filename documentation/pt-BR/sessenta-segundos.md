<!-- source: documentation/sixty-seconds.md blob fd3478465b06 | translated: 2026-09-12 | reviewed: - -->
# Veja um trace em 60 segundos

[English](../sixty-seconds.md) | [Español](../es/sesenta-segundos.md) | **Português** | [简体中文](../zh-CN/60秒.md)

Sem instruções de log, sem framework de testes, sem nenhum arquivo para abrir depois. Um script
simples, uma execução, e o trace aparece no seu terminal. Tudo abaixo foi executado de verdade
contra os pacotes publicados `@narrativetrace/core-node` e `@narrativetrace/proxy` (0.1.1, a versão
que está no ar no npm no momento em que isto foi escrito — rode
`npm view @narrativetrace/core version` para ver qual é a atual quando você ler isto) — a saída
está colada como saiu, não é imaginada. Precisa de Node 20+ (o pacote publicado
`@narrativetrace/core` declara isso em `engines`); pnpm é usado abaixo, mas o npm também funciona,
com uma diferença explicada no passo 1.

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
Winston for o seu logger — troque o import por `createWinstonEventConsumer`):

```diff
-import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
+import { NarrativeTraceConfig, SyncNarrativeContext, DualPathPipeline, BufferedEventConsumer, renderMarkdownBody } from "@narrativetrace/core-node";
 import { traceObject } from "@narrativetrace/proxy";
+import { createPinoEventConsumer } from "@narrativetrace/pino";
+import pino from "pino";

 class OrderService {
   placeOrder(customerId, productId, quantity) {
     return `ORD-${customerId}-${productId}-${quantity}`;
   }
 }

-const context = new SyncNarrativeContext(new NarrativeTraceConfig());
+const logger = pino();
+const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
+const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
+const context = new SyncNarrativeContext(new NarrativeTraceConfig(), undefined, pipeline);
 const service = traceObject(new OrderService(), context, {
   placeOrder: ["customerId", "productId", "quantity"],
 });

 service.placeOrder("C1", "P1", 2);
 console.log(renderMarkdownBody(context.captureTrace()));
```

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
node index.js
```

Saída real, da execução que produziu esta página:

```text
{"level":30,"time":1789158304041,"pid":44606,"hostname":"Danijels-MacBook-Air.local","code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C1\""},{"name":"productId","value":"\"P1\""},{"name":"quantity","value":"2"}],"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 1.2094590000000096ms
{"level":30,"time":1789158304042,"pid":44606,"hostname":"Danijels-MacBook-Air.local","nt.outcome":"returned","nt.depth":0,"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C1-P1-2\"","msg":"← returned: \"ORD-C1-P1-2\""}
```

Assim como o tempo acima, cada campo específico da execução (`time`, `pid`, `hostname`,
`trace_id`, `span_id`, `nt.traceName`) é um valor diferente na sua máquina e em cada execução; o
formato das duas linhas JSON e da linha markdown no meio não muda. Isso prova que o trace chega ao
destino que você já tem, sem alterar a saída de console. Configuração completa (níveis por evento,
o mixin `LogContext` para marcar suas próprias linhas de log, configuração do Winston): [Guia de
Integração de Frameworks § Winston & Pino](guia-de-integracao-de-frameworks.md#9-winston--pino).

## Próximos passos

| Você quer | Vá para |
|---|---|
| Usar isso nos seus testes | [Guia de Instalação § Opção B: Plugin do Vitest](guia-de-instalacao.md#opção-b-plugin-do-vitest-auto-contexto--saída-de-trace) |
| Manter um valor fora do trace (ocultação) | [Privacidade e Ocultação](privacidade-e-ocultacao.md) |
| Pontuar a clareza dos seus nomes | [Guia de Clareza](guia-de-clareza.md) |
| Cada opção de configuração | [Guia de Configuração](guia-de-configuracao.md) |
| Algo acima não funcionou como mostrado | [Solução de Problemas](solucao-de-problemas.md) |
