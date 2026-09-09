<!-- source: documentation/feature-guide.md blob d1a164f011f4 | translated: 2026-09-07 | reviewed: - -->
# NarrativeTrace TypeScript — Guia de funcionalidades

[English](../feature-guide.md) | [Español](../es/guia-de-funcionalidades.md) | **Português** | [简体中文](../zh-CN/功能指南.md)

O que **esta plataforma** entrega, da perspectiva de quem usa. O catálogo
canônico de funcionalidades para todas as plataformas — cada
funcionalidade do NarrativeTrace em cada plataforma, com o vocabulário
de status autoritativo — vive em
[o guia de funcionalidades canônico](https://github.com/narrativetrace/narrativetrace-java/blob/main/documentation/feature-guide.md).
Este arquivo é deliberadamente enxuto: registra apenas o que os pacotes
TypeScript entregam, onde eles diferem do catálogo canônico, e o que
está por vir nesta plataforma — o *porquê* do mecanismo (decoradores +
Proxy de ES em vez de instrumentação via loader-hook, a divisão de
pacotes por plataforma, o pipeline com buffer limitado) é um registro
de engenharia interno, não repetido aqui.

**Rótulos de status** (mesmo vocabulário do guia canônico):

- **Gratuito** — lançado neste repositório, gratuito e com
  código-fonte disponível sob [BSL 1.1](../../LICENSE) (SPDX
  `BUSL-1.1`), convertendo para Apache 2.0 quatro anos após cada
  lançamento. A API de anotações/decoradores, a especificação do
  formato de saída e a rubrica de clareza são padrões abertos Apache
  2.0.
- **Pro** — lançado no tier comercial.
- **Em desenvolvimento** — em construção ativa; o design está definido.
- **Planejado** — especificado, ainda não iniciado; pode mudar.

---

## Capture a história do seu código (tracing essencial)

| Funcionalidade | Status | Notas |
|---|---|---|
| Captura automática de narrativa via `Proxy` de ES — classe, método, argumentos, valores de retorno, tempos, erros; zero instruções de log | Gratuito | `traceObject(service, context)` de `@narrativetrace/proxy` |
| Decoradores — `@traced` (nomes de parâmetros), `@narrated` (narração com templates `{param}`), `@onError` (templates de contexto de erro), `@notTraced` (ocultação) | Gratuito | Ambos os dialetos de decoradores (TC39 padrão e `experimentalDecorators` legado), TS 5.0+; [guia-de-decoradores.md](guia-de-decoradores.md) |
| API programática para JS puro — configuração por método `traceObject(service, context, { methods: { method: { params, narration, onError, notTraced } } })` (gêmeo de configuração de cada decorador), o atalho de mapa de nomes `{ method: ["paramA", …] }` e a API bruta de enter/exit do `NarrativeContext` | Gratuito | Conjunto completo de funcionalidades sem suporte a decoradores |
| Ocultação de dados sensíveis — índices `@notTraced`, listas de campos `static notTraced`, lista de negação por padrão de nome `RedactionPolicy`, multilíngue e sempre ativa (`password`, `token`, `contraseña`, `senha`, `motDePasse`, `密码`, …); valores ocultados não podem vazar através de templates de narração/erro | Gratuito | |
| Cinco níveis de captura (`off` → `errors` → `summary` → `narrative` → `detail`), alteráveis em runtime via `config.level`; variável de ambiente `NARRATIVETRACE_LEVEL` no Node | Gratuito | Os nomes dos níveis diferem ligeiramente do Java (`summary` vs `FLOW`); `off` interrompe antes de qualquer trabalho de captura |
| Níveis com duas comportas — o nível de captura é independente dos níveis do logger (configuração winston/pino) | Gratuito | Product ADR-008 |
| Serialização antecipada (eager) de valores — valores renderizados em strings no momento da chamada; sem retenção de objetos, seguro contra referências circulares, limites de truncamento | Gratuito | Veja o FAQ do README + o contrato de pureza no guia de decoradores |
| Identidade do trace — traceId, nomes de trace legíveis por humanos, storyId/chapterId, herança do `traceparent` do W3C entre serviços | Gratuito | Alinhada ao schema canônico; demo distribuída em `examples/` |

**Limitação da plataforma (saiba disso de antemão).** O JavaScript não
retém nomes de parâmetros em runtime — sem ajuda, os argumentos são
renderizados como `arg0`, `arg1`, …. As anotações de Tier 2, portanto,
carregam mais peso aqui do que na JVM: `@traced("customerId", …)` ou o
mapa `paramNames` é como os traces recebem nomes reais, e os
minificadores tornam isso obrigatório para bundles de produção. Veja
TS-004 no ADL da plataforma.

## Concorrência e contexto assíncrono

| Funcionalidade | Status | Notas |
|---|---|---|
| Contexto por requisição com `AsyncLocalStorage` no Node (`AsyncNarrativeContext` em `@narrativetrace/core-node`) — traces nunca vazam entre requisições concorrentes | Gratuito | TS-001 no ADL da plataforma |
| Grupos fork/join — tarefas paralelas sob um único trace com tempos por membro e análise de tempo de espera (`ForkJoinGroup.all`) | Gratuito | |
| Grupos fire-and-forget — trabalho em segundo plano que ainda aparece no trace (`FireAndForgetGroup`) | Gratuito | |
| Detecção de intercalação sequencial-assíncrona; regra do navegador: chamadas sobrepostas sem `await` em um `SyncNarrativeContext` compartilhado exigem um grupo explícito | Gratuito | [framework-integration-guide.md](guia-de-integracao-de-frameworks.md) |
| Auto-flush no desligamento no Node (`beforeExit`/`SIGTERM`) para que eventos finais em buffer não se percam | Gratuito | `registerAutoFlush` em core-node |

## Conecte ao seu stack (os 19 pacotes)

| Integração | Status | Notas |
|---|---|---|
| `core` / `core-node` / `core-web` — núcleo agnóstico de plataforma + costuras de runtime para Node e navegador | Gratuito | TS-005 no ADL da plataforma |
| `proxy` — `traceObject` com ES Proxy + decoradores | Gratuito | O ponto de entrada mais comum |
| `express` — middleware por requisição, extractors à prova de falhas, `onRequestComplete` | Gratuito | |
| `hono` — middleware para edge/serverless, paridade de conclusão via `finally` com o Express | Gratuito | |
| `nestjs` — `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })` | Gratuito | |
| `angular` — `provideNarrativeTrace()`, interceptor HTTP, tracing de DI | Gratuito | |
| `react` — hooks/provider para traces de componentes e serviços | Gratuito | |
| `react-router` — captura de navegação | Gratuito | |
| `vitest` — fixture `narrativeTest`, arquivos de trace por teste (`md`/`mmd`/`puml`/`json`/`clarity-json`/`canonical-json`), resumo no console + reporters de clareza | Gratuito | |
| Schema canônico 1.2 + artefatos validados pelo escritor (writer) | Gratuito | `nt.schemaVersion` `1.2` a partir de uma única constante `SCHEMA_VERSION`; `.canonical.json` por teste (lista plana de entradas, determinística para uma captura livre de contexto); os schemas vivem em `schema/` e um teste de conformidade valida os bytes que `writeTraceOutput` escreve, não uma entrada construída à mão |
| `winston` / `pino` — eventos de narrativa através do seu logger existente, campos tipados, níveis configuráveis por evento | Gratuito | TS-003 no ADL da plataforma |
| `observability` — enriquecedor de escopo de log (`trace_id`, `code.*`, `service.*`, `nt.depth`) + middleware de requisição | Gratuito | |
| `opentelemetry` — `createOtelEventConsumer` ao vivo + `TraceSpanExporter` em lote, atributos tipados `narrative.param.*` | Gratuito | |
| `browser` — renderer de console, exportação via rede, `fetch` traçado | Gratuito | |
| `clarity` / `diagrams` — veja as seções abaixo | Gratuito | |

Não presente nesta plataforma: um equivalente ao agente Java
(auto-instrumentação via loader/require-hook) deliberadamente **não**
é oferecido — veja TS-004.

## Leia a história (saídas)

| Funcionalidade | Status | Notas |
|---|---|---|
| Renderers de texto indentado, Markdown e prosa | Gratuito | |
| Referências de valor no trace — deduplicação endereçada por conteúdo de valores capturados repetidos com rótulos legíveis (`‹Hotel›=full` na primeira emissão, `‹Hotel›` depois) | Gratuito | Os rótulos vêm do campo de identidade do valor estruturado (name/id/description/…), nunca de um campo ocultado; a igualdade de bytes certifica a mesmidade; a contenção dentro de outros valores capturados conta e é substituída. Somente Markdown |
| Deltas de valor dentro do trace — uma recaptura da mesma entidade, alterada, é renderizada como um diff contra a referência (`‹Dinner›′{amount: 100→92, currency: "USD"→"EUR"}`) | Gratuito | "Mesma entidade" é o mesmo nome de tipo estruturado mais um campo de identidade igual; apenas campos escalares alterados (string, number, boolean e o tipo `other` pré-transformado em string), nunca reconstruído a partir da árvore estruturada. Um objeto ou lista aninhada alterada, um conjunto de campos diferente, ou um valor sem campo de identidade é renderizado por completo exatamente como antes. Uma variante alterada que por sua vez se repete é definida COMO o diff (`‹Dinner·2›=‹Dinner›′{…}`). Somente Markdown |
| Exportação JSON canônica — envelope versionado (`version`, `scenario`, `trace`, `events[]`) com campos storyId/chapterId | Gratuito | `exportJson(tree, { scenario })` |
| Diagramas de sequência — Mermaid + PlantUML | Gratuito | `@narrativetrace/diagrams` |
| Arquivos de trace por teste + resumos de teste no console via Vitest | Gratuito | |
| Resumos de fluxo — caminhos agregados + frequências por ponto de entrada | Planejado (Pro) | Plano enterprise, Fase E3 |
| Diffs de migração — comparação comportamental antes/depois | Planejado (Pro) | Plano enterprise, Fase E3 |
| Grafos de dependência em runtime (sempre chamado vs condicional) | Planejado (Pro) | Plano enterprise, Fase E4 |

## Melhore o código (diagnóstico de clareza)

| Funcionalidade | Status | Notas |
|---|---|---|
| Pontuação de clareza — qualidade dos nomes de método/classe/parâmetro a partir da execução real | Gratuito | [clarity-guide.md](guia-de-clareza.md); o README rotula a pontuação de clareza como **experimental** |
| Relatório de clareza no nível da suíte + gate `clarity-results.json` | Gratuito | Via os reporters do Vitest |
| Vocabulário do projeto na pontuação — o glossário commitado estende os dicionários integrados | Gratuito | Um arquivo, um fluxo de revisão: os verbos do `glossary.json` commitado pontuam como verbos do domínio e seus substantivos como tokens do domínio. Lido a partir de `NARRATIVETRACE_GLOSSARY_DIR` (padrão: diretório de trabalho), memoizado por worker; a leitura é incondicional, diferente da coleta (harvesting). Os níveis integrados mantêm autoridade — verbos genéricos, prefixos booleanos, placeholders sem sentido, sinônimos obsoletos e termos `stale` nunca são promovidos |
| Abreviatura aceita — a seção `abbreviations` do glossário | Gratuito | `"abbreviations": {"fx": "foreign exchange"}` no nível raiz, no schema 2; um token listado não precisa ser soletrado por extenso e carrega uma expansão da qual aprender. Declarada, nunca inferida a partir dos tokens de termos commitados. De posse humana: a coleta (harvesting) nunca a escreve, o merge a repassa, `glossary.md` a renderiza. Um glossário que não declara nenhuma permanece byte-idêntico no schema 1 |

## Tier Pro (comercial)

| Funcionalidade | Status | Notas |
|---|---|---|
| Agregação de stream de eventos — `@narrativetrace/pro-aggregate` com a fachada `EventAggregator` (árvores agregadas, hotspots, caminhos/taxas de erro, frequências de método/erro) | Pro | Realocado para fora do core gratuito em 2026-07-12 (divisão de tier da Fase 31a, product ADR-010); buffer/retenção permaneceram gratuitos — alimente `pipeline.events()` no `EventAggregator` |
| Servidor MCP — transporte stdio real (`@modelcontextprotocol/sdk`), 7 ferramentas de análise, conecte Claude Code / Cursor diretamente | Em desenvolvimento (Pro) | Plano enterprise, Fase E5; vai além do módulo apenas-handlers do Java |
| Resumos de fluxo, diffs de migração, diagramas de grafo de dependência | Planejado (Pro) | Fases E3–E4, veja acima |
| Conjunto de auditoria e conformidade | Planejado (Pro) | Gated — veja a seção de auditoria do guia canônico |

---

## Mantendo este guia honesto

Adaptado das regras do guia canônico para um guia de plataforma
enxuto:

1. Toda funcionalidade visível ao usuário **desta plataforma** aparece
   aqui, exatamente uma vez, com um status. As definições de
   funcionalidades entre plataformas e o catálogo completo vivem
   apenas no guia canônico — este arquivo nunca reafirma
   funcionalidades que esta plataforma não entrega nem planeja.
2. Uma funcionalidade só passa para **Gratuito**/**Pro** quando está
   integrada (merged), testada e documentada no repositório TS
   relevante. "Em desenvolvimento" significa que o design está
   definido e o trabalho está agendado; "Planejado" significa apenas
   especificado.
3. Mudanças que adicionam ou promovem uma funcionalidade neste
   repositório devem atualizar este arquivo no mesmo commit — e,
   quando a funcionalidade é nova para o produto (não apenas para
   esta plataforma), o guia canônico também.
4. Onde o comportamento do TS difere da descrição canônica (nomes de
   níveis, nomes de parâmetros em runtime, ausência de instrumentação
   estilo agente), a diferença é declarada aqui, não absorvida
   silenciosamente.
