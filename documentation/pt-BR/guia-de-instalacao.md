<!-- source: documentation/installation-guide.md blob 888db3e4a9fb | translated: 2026-09-12 | reviewed: - -->

# Guia de instalação do NarrativeTrace TypeScript

[English](../installation-guide.md) | [Español](../es/guia-de-instalacion.md) | **Português** | [简体中文](../zh-CN/安装指南.md)

Este guia cobre a instalação e o wiring do NarrativeTrace TypeScript em um projeto Node.js ou navegador.

## Pré-requisitos

- Node.js 20+
- pnpm (ou npm/yarn)

## Início rápido

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node (use @narrativetrace/core-web no navegador)
```

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
```

## 1. Adicione as dependências

Comece com o stack mínimo e depois adicione somente as integrações que você precisa.

```bash
# Mínimo — escolha o ponto de entrada da plataforma para seu runtime
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node
pnpm add @narrativetrace/core-web @narrativetrace/proxy    # Navegador / Web Worker

# `core-node` e `core-web` reexportam tudo em `@narrativetrace/core` e registram o
# gerador de id otimizado da plataforma (node:crypto vs. Web Crypto). Usar somente
# `@narrativetrace/core` ainda funciona — ele recorre diretamente ao Web Crypto onde disponível
# (todo runtime que esta biblioteca suporta) — mas o pacote da plataforma continua sendo o que
# você deve instalar: é o caminho testado e documentado, e o único garantidamente livre de
# lançar erro em um runtime sem Web Crypto algum.

# Integrações opcionais
pnpm add -D @narrativetrace/vitest           # plugin do Vitest
pnpm add @narrativetrace/diagrams            # Mermaid + PlantUML
pnpm add @narrativetrace/clarity             # Análise de clareza de nomes
pnpm add @narrativetrace/browser             # Console do navegador + exportação de rede
pnpm add @narrativetrace/standalone          # Bundle de arquivo único para páginas <script> simples (sem bundler)
```

## 2. Escolha um caminho de integração

### Opção A: Proxy de ES (funciona em qualquer aplicação TypeScript/JavaScript)

```ts
// Node: "@narrativetrace/core-node" — Navegador: "@narrativetrace/core-web"
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

const tracedOrderService = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

tracedOrderService.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
context.reset();
```

Use isso quando você quer controle explícito sobre o tracing. Funciona em Node, Deno, Bun e navegadores.

### Opção B: Plugin do Vitest (auto-contexto + saída de trace)

```bash
pnpm add -D @narrativetrace/vitest @narrativetrace/proxy vitest
```

`vitest` é a única dependência de pares (`peerDependency`) de `@narrativetrace/vitest`; as outras
quatro dependências do NarrativeTrace (core-node, clarity, diagrams, glossary) são instaladas
automaticamente com ele — elas são lançadas em conjunto e nunca são versionadas separadamente.
`@narrativetrace/proxy` é listado explicitamente porque os exemplos abaixo importam `traceObject`
diretamente dele: o pnpm só expõe as dependências do próprio pacote, não as dependências de uma
dependência, então qualquer coisa que você importe também precisa ser sua própria dependência (o
`node_modules` mais plano do npm não faz essa distinção, mas o pnpm — usado aqui — faz). *(since 0.1.3, unreleased)*

#### Fixture básica (sem saída em arquivo)

```ts
import { narrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

narrativeTest("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
  // narrativeContext está disponível para assertions
});
```

#### Com saída em arquivo

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "json", "mmd", "puml", "clarity-json"],
});

test("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
});
```

Funcionalidades:
- `NarrativeContext` por teste via fixture do Vitest
- Emissão automática do arquivo de trace após cada teste
- Nome do cenário derivado do nome do teste
- Múltiplos formatos de saída: Markdown, JSON, Mermaid, PlantUML, clarity JSON

### Opção C: Middleware Express/Hono

Tracing por requisição em aplicações web usando `AsyncNarrativeContext`:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

app.use((req, res, next) => {
  asyncContext.run(() => {
    // Todas as chamadas traced dentro desta requisição compartilham o mesmo contexto
    next();
  });
});

app.get("/orders", (req, res) => {
  const traced = traceObject(orderService, asyncContext);
  const result = traced.placeOrder("C1", "P1", 2);
  console.log(renderIndentedText(asyncContext.captureTrace()));
  res.json(result);
});
```

### Opção D: Navegador (renderização no console + exportação de rede)

```bash
pnpm add @narrativetrace/core-web @narrativetrace/proxy @narrativetrace/browser
```

```ts
// core-web registra o gerador de id do Web Crypto — importe-o, não @narrativetrace/core
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole, postToCollector } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
const tree = context.captureTrace();

// Mostra na página
document.querySelector("pre#trace").textContent = renderIndentedText(tree);

// Espelha no console do DevTools
renderToConsole(tree);

// Envia via POST como JSON para um endpoint coletor (resolve para qualquer status HTTP — verifique response.ok)
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
```

Contexto principal, Proxy de ES e renderização de valores são JavaScript puro, sem dependências de Node. `AsyncLocalStorage` é exclusivo do Node; no navegador, propague o contexto manualmente via `snapshot()`.
Versão executável: `pnpm run example:browser` (veja o [Guia de Exemplos](guia-de-exemplos.md#navegador)).

### Opção E: Página JavaScript simples, sem bundler (tag script)

```bash
pnpm add @narrativetrace/standalone
```

`@narrativetrace/standalone` empacota um único arquivo contendo `core-web` + `proxy` + `browser` em duas formas: `dist/narrativetrace.global.js` (script clássico → `window.NarrativeTrace`) e `dist/narrativetrace.js` (módulo ES). Copie o que você precisa para perto da sua página; carregá-lo registra o gerador de id do navegador, então nada mais precisa ser importado.

```html
<script src="narrativetrace.global.js"></script>
<script>
  var NT = window.NarrativeTrace;
  var context = new NT.SyncNarrativeContext(new NT.NarrativeTraceConfig());
  var traced = NT.traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });

  traced.placeOrder("C1", "P1", 2);

  var tree = context.captureTrace();
  document.getElementById("trace").textContent = NT.renderIndentedText(tree);
  NT.renderToConsole(tree);
</script>
```

Versão executável: `pnpm run example:script-tag` (veja o [Guia de Exemplos](guia-de-exemplos.md#tag-script)). Prefira a Opção A/D com um bundler quando você tiver um — grafos menores e tree-shaking.

## 3. Configure a saída do trace

### Vitest (recomendado)

Use `createNarrativeTest` com opções:

```ts
const test = createNarrativeTest({
  outputDir: "narrativetrace-output",   // padrão: "narrativetrace-output"
  formats: ["md", "json"],              // padrão: ["md", "json", "mmd"]
  bufferCapacity: 8192,                 // padrão: 8192 eventos (~4.000 chamadas traced)
});
```

Um teste que gera mais eventos de trace do que a capacidade definida em `bufferCapacity` perde seus
eventos mais antigos. Isso não acontece silenciosamente: a execução imprime uma linha nomeando a
contagem e o valor para o qual aumentá-la, e os artefatos de Markdown e de diagrama trazem o mesmo
rodapé.

Formatos disponíveis:

| Formato | Extensão | Conteúdo |
|--------|-----------|---------|
| `md` | `.md` | Markdown com YAML frontmatter |
| `json` | `.json` | JSON com eventos enter/exit |
| `mmd` | `.mmd` | Diagrama de sequência Mermaid |
| `puml` | `.puml` | Diagrama de sequência PlantUML |
| `clarity-json` | `.clarity-json` | JSON de análise de clareza |

### Saída manual

Para configurações que não usam Vitest, use os renderizadores diretamente:

```ts
import { renderMarkdown, renderIndentedText, renderProse, exportJson } from "@narrativetrace/core";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";

const tree = context.captureTrace();

// Escolha seu formato
console.log(renderIndentedText(tree));
console.log(renderMarkdown(tree, { scenarioName: "Order placement" }));
console.log(renderProse(tree));
console.log(exportJson(tree, { scenario: "Order placement" }));
console.log(renderMermaidSequence(tree));
console.log(renderPlantUmlSequence(tree));
```

## 4. Valide a instalação

Rode os testes:

```bash
pnpm test
```

Se estiver usando `createNarrativeTest`, os arquivos de trace aparecem no diretório de saída configurado:

```
narrativetrace-output/
├── customer_places_order.md
├── customer_places_order.json
├── customer_places_order.mmd
├── customer_places_order.puml
└── customer_places_order.clarity-json
```

## Referência de seleção de pacotes

| Pacote | Quando adicioná-lo |
|---------|----------------|
| `@narrativetrace/core` | Sempre obrigatório |
| `@narrativetrace/proxy` | Tracing com Proxy de ES (o mais comum) |
| `@narrativetrace/vitest` | Fixture do Vitest e emissão de arquivos de trace |
| `@narrativetrace/diagrams` | Renderizadores Mermaid / PlantUML |
| `@narrativetrace/clarity` | Análise e relatório de clareza de nomes |
| `@narrativetrace/browser` | Renderização no console do navegador e exportação de rede |

## Veja também

- [Guia de Configuração](guia-de-configuracao.md) — níveis de tracing, opções de renderização, redação de parâmetros
- [Guia de Decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guia de Clareza](guia-de-clareza.md) — modelo de pontuação, componentes de NLP, scanner estático
- [Guia de Integração de Frameworks](guia-de-integracao-de-frameworks.md) — Express, Hono, navegador, AsyncLocalStorage
