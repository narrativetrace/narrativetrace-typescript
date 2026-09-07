<!-- source: documentation/choosing-an-integration.md blob b965667a368c | translated: 2026-09-03 | reviewed: - -->
# Escolhendo uma integração

[English](../choosing-an-integration.md) | [Español](../es/eligiendo-una-integracion.md) | **Português** | [简体中文](../zh-CN/选择集成方式.md)

O NarrativeTrace tem um único modelo de captura — um evento de
entrada/saída, construído pelo `Proxy` de ES do `traceObject()`, publicado
em um `NarrativeContext` — alcançado por vários pontos de anexação
diferentes. Esta página responde "de qual pacote eu realmente preciso",
primeiro como uma tabela de consulta, depois como um diagrama de decisão, e
por fim com as ressalvas que cada caminho tem.

## Você quer... / Comece com...

| Você quer | Comece com |
|---|---|
| Traces em testes, com o mínimo de wiring | `@narrativetrace/vitest` (`createNarrativeTest`) |
| Para escolher exatamente o que é encapsulado, em TypeScript/JavaScript puro | `@narrativetrace/proxy` (`traceObject`) diretamente |
| Tracing por requisição em uma aplicação Express | `@narrativetrace/express` |
| Tracing por requisição no Hono (edge/serverless) | `@narrativetrace/hono` |
| Tracing de providers do Nest sem tocar no código da aplicação | `@narrativetrace/nestjs` (`AutoProxyModule`) |
| Tracing de serviços/DI do Angular + correlação HTTP | `@narrativetrace/angular` |
| Tracing de componentes/serviços React | `@narrativetrace/react` (+ `@narrativetrace/react-router` para navegação) |
| Página de navegador com um bundler | `@narrativetrace/core-web` + `@narrativetrace/browser` |
| Página de navegador, sem bundler, `<script>` clássico | `@narrativetrace/standalone` |
| Visibilidade entre requisições/assíncrona no Node | `AsyncNarrativeContext` (`@narrativetrace/core-node`, baseado em `AsyncLocalStorage`) |
| Trabalho paralelo sob um único trace | `ForkJoinGroup` / `FireAndForgetGroup` (`@narrativetrace/core`) |
| Traces no seu fluxo de logs de produção | `@narrativetrace/winston` ou `@narrativetrace/pino` |
| Spans do OpenTelemetry | `@narrativetrace/opentelemetry` |

Esta é a mesma matriz que o [README raiz](../../LEIAME.md#escolha-sua-integração)
carrega; ela também vive aqui como a âncora para o diagrama e os detalhes
abaixo.

## A decisão

```text
Onde a chamada acontece?

Teste Vitest
   |
   +--> @narrativetrace/vitest (createNarrativeTest)

TypeScript/JavaScript puro — você mesmo constrói o objeto
   |
   +--> @narrativetrace/proxy (traceObject) diretamente

Handler de requisição Express / Hono
   |
   +--> o pacote de middleware correspondente, um AsyncNarrativeContext por requisição

Grafo de providers do NestJS
   |
   +--> @narrativetrace/nestjs — nenhum call site é tocado, o DI encapsula todo provider

Árvore de componentes Angular / React
   |
   +--> @narrativetrace/angular ou @narrativetrace/react

Página de navegador sem framework
   |
   +-- tem um bundler --> @narrativetrace/core-web + @narrativetrace/browser
   +-- sem bundler     --> @narrativetrace/standalone (<script> clássico)
```

Todo ramo termina no mesmo mecanismo `traceObject()`/`Proxy` — um
middleware ou módulo de DI é um wrapper que decide *quando* chamá-lo e
*qual* `NarrativeContext` entregar a ele, nunca um segundo caminho de
captura. Isso é deliberado, não uma omissão: um hook de loader
`require`/ESM foi rejeitado porque o JS não retém nomes de parâmetros em
tempo de execução (as anotações já carregam esse peso) e a instrumentação
de loader é completamente contornada por bundlers, navegadores e edge
runtimes, onde o `Proxy` é padrão.

## Uma coisa que todo caminho compartilha

Todos os pacotes acima publicam através do mesmo `NarrativeContext` /
`DualPathPipeline` (`@narrativetrace/core`); nenhum deles define sua
própria noção de chamada capturada. Escolher uma integração é uma questão
de *como a chamada é encapsulada e qual contexto a recebe*, nunca do que é
registrado depois que ela é.

## Ressalvas por caminho

- **`traceObject` (proxy)** — encapsula um objeto por vez; não há
  exigência de interface (diferente de um proxy dinâmico da JVM) porque o
  `Proxy` encapsula o objeto concreto diretamente. Todo método alcançável
  por lookup de propriedade — próprio ou herdado da cadeia de protótipos —
  é encapsulado; uma chamada feita diretamente na instância não
  encapsulada contorna o tracing por completo, e
  campos `#private` não podem ser interceptados pelo `Proxy` de forma
  alguma — uma limitação da linguagem JavaScript, não um bug.
- **Express / Hono** — um `AsyncNarrativeContext.run()` por requisição é o
  que impede que requisições concorrentes vazem umas nos traces das
  outras; pular isso e compartilhar um único contexto entre requisições é
  um bug de corretude, não uma conveniência.
- **NestJS** — `AutoProxyModule.forRoot(...)` encapsula todo provider que
  recebe; hoje não há opt-out por método de dentro do módulo — restrinja
  o que você entrega a ele, ou adicione `@notTraced` nos métodos para os
  quais você não quer capturar valores.
- **Trabalho entre threads** — o Node não tem threads para cruzar, mas o
  trabalho assíncrono ainda precisa de propagação explícita: o
  `AsyncNarrativeContext` segue um `await` automaticamente, mas uma
  tarefa disparada e *não* aguardada (um timer, uma promise
  fire-and-forget, um Worker) não herda o span ativo por conta própria.
  Use `ForkJoinGroup`/`FireAndForgetGroup` para tarefas que você possui,
  ou `context.snapshot()` + `snapshot.wrap(...)` para enxertar trabalho
  desanexado no trace pai manualmente.
- **Navegador** — o `SyncNarrativeContext` não tem propagação implícita
  alguma (não há `AsyncLocalStorage` em um navegador); chamadas
  sobrepostas e não aguardadas em um contexto compartilhado se corrompem
  mutuamente. Use um grupo explícito de fork/fire-and-forget por tarefa
  concorrente, da mesma forma que a ressalva de trabalho assíncrono acima.

## Limites da plataforma

Não existe um caminho zero-código, de "encapsular uma aplicação que você
não pode modificar", nesta plataforma — nenhum equivalente ao agente Java,
e nenhum está planejado. Os decoradores `TC39` e o `traceObject()` precisam
de um call site ou de uma classe que você possa anotar; um hook de loader
`require`/ESM foi deliberadamente rejeitado (frágil entre versões do Node,
e completamente contornado por bundlers, navegadores e edge runtimes, onde
o `Proxy` é padrão).

## Receitas

Todo caminho da matriz tem uma receita completa e pronta para copiar e
colar no [Guia de Instalação](guia-de-instalacao.md) — esta página
responde *qual*, aquela responde *como*.
