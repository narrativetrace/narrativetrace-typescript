<!-- source: documentation/configuration-guide.md blob 42bde5f4fa1e | translated: 2026-09-11 | reviewed: - -->
# Guia de Configuração do NarrativeTrace TypeScript

[English](../configuration-guide.md) | [Español](../es/guia-de-configuracion.md) | **Português** | [简体中文](../zh-CN/配置指南.md)

Este guia documenta a configuração de runtime e de testes do NarrativeTrace TypeScript.

## 1. Níveis de tracing (`NarrativeTraceConfig`)

`SyncNarrativeContext` e `AsyncNarrativeContext` usam `NarrativeTraceConfig`, cujo padrão é `"detail"`.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";

const config = new NarrativeTraceConfig("narrative");
const context = new SyncNarrativeContext(config);
```

Níveis disponíveis:

| Nível | Comportamento |
|---|---|
| `"off"` | Nenhum trace é capturado |
| `"errors"` | Apenas caminhos de exceção são capturados |
| `"summary"` | Captura a entrada raiz, a folha mais profunda e as cadeias de exceção completas |
| `"narrative"` | Captura o fluxo de chamadas completo, suprime os valores de parâmetro |
| `"detail"` | Captura o fluxo de chamadas completo com valores de parâmetro e valores de retorno |

Mudanças de nível em tempo de execução são suportadas:

```ts
config.level = "errors";
```

### Auxiliares de nível

```ts
import { isActiveLevel, isEnabled } from "@narrativetrace/core";

isActiveLevel("off");       // false
isActiveLevel("errors");    // true
isEnabled("detail", "narrative"); // true — detail >= narrative
isEnabled("errors", "detail");    // false — errors < detail
```

## 2. Configuração do Vitest

### Fixture básica (sem saída)

```ts
import { narrativeTest } from "@narrativetrace/vitest";

narrativeTest("my test", ({ narrativeContext }) => {
  // narrativeContext é um SyncNarrativeContext com a configuração padrão
});
```

### Com saída em arquivo

O `createNarrativeTest` escreve os artefatos por conta própria — o artefato é
o motivo de usá-lo, então não há nada para ativar:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",      // padrão: "narrativetrace-output"
  formats: ["md", "json", "mmd", "puml"],  // padrão: ["md", "json", "mmd"]
});
```

Desligue para uma execução que quer a narrativa no console e os metadados de
clareza/glossário, mas não os arquivos — `NARRATIVETRACE_OUTPUT=false` (ou
`outputEnabled: false` no código, ou `"output": "false"` no arquivo de
configuração do projeto). Qualquer outro valor, inclusive a variável não
definida, mantém a escrita ativada. *(since 0.1.3, unreleased)*
A versão atualmente publicada no npm, `@narrativetrace/vitest@0.1.1`, escreve
os arquivos incondicionalmente — `NARRATIVETRACE_OUTPUT` não tem efeito nela.

### Layout de saída

Os artefatos são agrupados por *módulo* de teste (o nome-base do arquivo de
teste — o equivalente, nesta plataforma, ao diretório de classe de teste do
Java), com os diagramas em uma árvore espelhada:

```
narrativetrace-output/
  order-service/                 # a partir de order-service.test.ts
    places_order.md              # narrative + frontmatter YAML
    places_order.json            # JSON canônico
  diagrams/
    order-service/
      places_order.mmd           # diagrama de sequência Mermaid
```

Testes com o mesmo nome em blocos `describe` diferentes continuam distintos:
a cadeia de suíte faz parte do nome do arquivo. Tanto o nome do módulo quanto
o do teste são sanitizados, então nenhum dos dois consegue escrever fora de
`outputDir`.

### Formatos disponíveis

| Formato | Extensão | Renderer |
|--------|-----------|----------|
| `"md"` | `.md` | `renderMarkdown()` com o nome do cenário |
| `"json"` | `.json` | `exportJson()` com metadados do cenário |
| `"mmd"` | `.mmd` | `renderMermaidSequence()` |
| `"puml"` | `.puml` | `renderPlantUmlSequence()` |
| `"clarity-json"` | `.clarity-json` | `exportClarityJson()` com análise |
| `"canonical-json"` | `.canonical.json` | `exportCanonicalJson()` — a lista plana de entradas |

`"json"` e `"canonical-json"` descrevem o mesmo trace para leitores
diferentes. `"json"` é o envelope aninhado em árvore de capítulos, moldado
para humanos e para ferramentas que percorrem uma árvore de chamadas.
`"canonical-json"` é o array plano de registros de enter/exit que
[`schema/entry.schema.json`](../../schema/entry.schema.json) declara — um
registro por evento, chaves alinhadas ao OTel, o formato em que as fixtures
de conformidade entre plataformas são escritas. Peça um dos dois, ou ambos.

Isso é determinístico de propósito: um trace capturado sem um contexto de
span (um teste unitário simples) recebe ids de span sintéticos sequenciais e
um id de trace sintético fixo, de modo que duas execuções do mesmo teste
produzem bytes idênticos. Os aliases `canonical` e `canonicalJson` são
aceitos em `NARRATIVETRACE_FORMATS`.

### Nomes de cenário

O nome do teste é usado como o nome do cenário nos arquivos de saída. Os nomes de arquivo são sanitizados (caracteres não alfanuméricos são removidos, espaços são substituídos por underscores):

- `"customer places order"` → `customer_places_order.md`
- `"order with quantity < 1 fails"` → `order_with_quantity__1_fails.md`

### Enquadramento de cenário

`frameScenario()` converte nomes de teste em títulos de cenário legíveis para humanos:

- `customerPlacesOrder` → "Customer places order"
- `customer_places_order` → "Customer places order"
- `test_should_validate_input` → "Should validate input"

## 2b. De onde vêm as configurações

As configurações são resolvidas da maior para a menor prioridade. Cada canal
preenche apenas o que os canais acima dele deixaram sem definir:

| Precedência | Canal | Exemplo |
|---|---|---|
| 1 (vence) | Opções explícitas no código | `createNarrativeTest({ level: "summary" })` |
| 2 | Variável de ambiente | `NARRATIVETRACE_LEVEL=off pnpm test` |
| 3 | Arquivo de configuração do projeto | `narrativetrace.config.json` na raiz do repositório |
| 4 | Padrão embutido | `level: "detail"`, `outputDir: "narrativetrace-output"`, `formats: ["md", "json", "mmd"]` |

### Arquivo de configuração do projeto

Coloque **um** destes na raiz do seu projeto — o que a sua equipe preferir:

```jsonc
// narrativetrace.config.json   (ou: .narrativetracerc.json)
{
  "level": "summary",
  "outputDir": "narrativetrace-output",
  "format": "md,json"
}
```

As chaves espelham as variáveis de ambiente sem o prefixo
`NARRATIVETRACE_`: `level`, `output`, `outputDir`, `format`. `output` é a
exclusão voluntária da escrita de arquivos do `createNarrativeTest` —
`"false"` a desativa, qualquer outra string (inclusive `"true"`) a mantém
ativa. Chaves desconhecidas e valores com tipo errado são ignorados, então
uma configuração perdida nunca quebra uma execução.

### Dois arquivos de configuração são um erro, não um cara ou coroa

Enviar **os dois** nomes de arquivo aceitos falha a execução imediatamente:

```
DuplicateConfigurationError: Multiple NarrativeTrace configuration sources
found: narrativetrace.config.json, .narrativetracerc.json.
Keep exactly one and delete the rest.
```

O mesmo vale para um arquivo de configuração que não seja um JSON válido, ou
cujo nível superior não seja um objeto. Preferir silenciosamente uma fonte é
assim que um merge que ressuscita uma configuração antiga passa despercebido
por meses — em vez disso, a execução para. Um *valor* que você errou é
tratado com mais gentileza: um `level` não reconhecido degrada para o padrão
em vez de falhar.

Resolva as configurações você mesmo com `resolveConfig()` de
`@narrativetrace/core-node`; todo canal é injetável (`{ env, projectRoot,
read, fallbackLevel }`) para testes.

## 3. Opções de renderização (`renderValue`)

A função `renderValue()` serializa valores em strings. Ela aceita opções para controlar a truncagem:

```ts
import { renderValue } from "@narrativetrace/core";

renderValue(someObject, {
  maxStringLength: 200,   // padrão: 200 — trunca strings além disso
  maxArrayItems: 5,       // padrão: 5 — mostra os primeiros N elementos do array
  maxObjectKeys: 5,       // padrão: 5 — mostra as primeiras N chaves do objeto
});
```

| Opção | Padrão | Efeito |
|--------|---------|--------|
| `maxStringLength` | 200 | Strings mais longas que isso são truncadas com `"..."` |
| `maxArrayItems` | 5 | Arrays mostram os primeiros N itens, depois `... (N total)` |
| `maxObjectKeys` | 5 | Objetos mostram as primeiras N chaves, depois `... (N total)` |

### Tratamento de tipos

| Tipo | Renderizado como |
|------|-------------|
| `null` | `"null"` |
| `undefined` | `"undefined"` |
| `string` | `"\"hello\""` (entre aspas) |
| `number` | `"42"` |
| `boolean` | `"true"` |
| `bigint` | `"42n"` |
| `symbol` | `"Symbol(name)"` |
| `function` | `"<function>"` |
| `Array` | `[1, 2, 3]` |
| `Object` | `{"key": "value"}` |
| Referência circular | `"<circular>"` |

## 4. Opções de Markdown

`renderMarkdown()` aceita opções para a saída renderizada:

```ts
import { renderMarkdown } from "@narrativetrace/core";

const markdown = renderMarkdown(tree, {
  scenarioName: "Customer places order",   // aparece no frontmatter YAML
  slowThresholdMs: 200,                     // padrão: 200 — sinaliza chamadas lentas
});
```

| Opção | Padrão | Efeito |
|--------|---------|--------|
| `scenarioName` | (nenhum) | Adicionado ao frontmatter YAML |
| `slowThresholdMs` | 200 | Chamadas mais lentas que isso recebem um marcador de aviso |

### Formato de saída

A saída em Markdown inclui frontmatter YAML e uma lista aninhada com marcadores:

```markdown
---
scenario: Customer places order
methods: 5
result: success
---

- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `{"orderId": "ORD-1", ...}`
  - `CustomerService.findCustomer(customerId: "C1")` → `{"id": "C1", ...}`
  - `PaymentService.charge(customerId: "C1", amount: 59.98)` → `{"transactionId": "TX-1", ...}`
```

## 5. Ocultação de parâmetros (`@notTraced`)

Marque parâmetros sensíveis como ocultos para que os valores nunca apareçam na saída de trace:

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // oculta o parâmetro no índice 1
  login(username: string, password: string) {
    // ...
  }
}
```

A saída de trace mostra `***` em vez do valor real:

```
AuthService.login(username: "admin", password: ***)
```

Para ocultação manual (sem decorador), veja o [Guia de Decoradores](guia-de-decoradores.md).

## 6. Opções de proxy

`traceObject()` aceita configuração opcional:

```ts
import { traceObject } from "@narrativetrace/proxy";

const traced = traceObject(service, context, paramNames, {
  className: "OrderService",      // sobrescreve o nome da classe (padrão: constructor.name)
  includeReturnValues: true,      // captura valores de retorno (padrão: true)
});
```

| Opção | Padrão | Efeito |
|--------|---------|--------|
| `className` | `target.constructor.name` | Nome de classe mostrado nos traces |
| `includeReturnValues` | `true` | Quando `false`, valores de retorno não são renderizados |

## 7. Padrões recomendados por ambiente

| Ambiente | Nível sugerido | Saída sugerida |
|---|---|---|
| Trabalho local em features | `"detail"` | `formats: ["md", "json"]` |
| Execuções de teste em CI | `"narrative"` ou `"summary"` | `formats: ["md"]` |
| Produção | `"errors"` (ou `"off"`) | Sem saída em arquivo |

## 8. Buffer do pipeline de eventos (`BufferedEventConsumer`)

Um contexto construído com argumentos padrão recebe um
`DualPathPipeline(null, new BufferedEventConsumer())`. O caminho em buffer é
o de melhor esforço: uma chamada traceada paga uma escrita no anel, e um
timer drena o anel para o event store (e para quaisquer subscribers) em
ticks posteriores.

```ts
import { BufferedEventConsumer, DualPathPipeline, SyncNarrativeContext } from "@narrativetrace/core";

// Padrões — dimensionados para um processo de longa duração em uma VM pequena, container ou cloud function.
const context = new SyncNarrativeContext(config);

// Todo padrão pode ser sobrescrito, posicionalmente: (capacity, drainIntervalMs, chunkSize)
const highThroughput = new BufferedEventConsumer(262_144, 50, 4096);
const pipeline = new DualPathPipeline(null, highThroughput);
const context2 = new SyncNarrativeContext(config, undefined, pipeline);
```

| Opção | Padrão | Efeito |
|--------|---------|--------|
| `capacity` | `65536` (2^16) | **O tamanho fixo do anel**, e portanto também o teto de eventos não drenados |
| `drainIntervalMs` | `100` | Período de drenagem. O timer roda apenas enquanto há eventos esperando |
| `chunkSize` | `1024` | Eventos drenados por tick |

### O buffer tem tamanho fixo — ele nunca cresce

`capacity` é o tamanho do anel, não um teto rumo ao qual ele trabalha. Não
há capacidade inicial nem fator de crescimento: o dimensionamento é uma
única decisão, tomada antecipadamente.

- **Nada é alocado até o primeiro evento.** Um contexto ocioso — um teste
  que nunca traceia, uma requisição que retorna cedo — mantém
  `allocatedCapacity === 0`. O primeiro evento em buffer aloca o anel **por
  inteiro**, em `capacity`, e ele permanece exatamente com esse tamanho pela
  vida do consumer, inclusive através de `clear()`.
- **No limite, o buffer descarta, nunca bloqueia.** O evento não lido mais
  antigo é sobrescrito e contado em `consumer.overflowCount()`.
  (`droppedCount()` é um número diferente: eventos não entregues porque um
  *subscriber* ainda estava ocupado.) Um `overflowCount()` diferente de zero
  significa uma coisa: `capacity` está pequeno demais.

### Contextos de vida curta: dimensione-os para baixo

Como o anel é alocado por inteiro, a *primeira chamada traceada* em um
contexto paga pela `capacity` inteira. Isso é gratuito para um servidor que
constrói um contexto e o mantém, e não é gratuito para o padrão por
requisição, por teste, por clique no navegador. Medido por consumer
recém-criado (alocar, dois eventos, drenar, fechar):

| `capacity` | custo por contexto |
|---|---|
| 1.024 | 0,8 µs |
| 2.048 | 1,1 µs |
| **8.192** | **3,8 µs** |
| 16.384 | 31,7 µs |
| 65.536 | 99,0 µs |

O salto entre 8.192 e 16.384 não é uma curva suave: 16.384 ponteiros são 128
KB, que é onde o V8 move um backing store para o large-object space. Mantenha
o anel de um contexto de vida curta abaixo dessa linha.

`@narrativetrace/vitest` já faz isso por você — `createNarrativeTest()` dá a
cada teste um contexto com `DEFAULT_TEST_BUFFER_CAPACITY` (8.192),
sobrescrevível por fixture com `createNarrativeTest({ bufferCapacity:
32_768 })`. Se uma janela de captura estoura, a execução avisa: uma linha
de aviso nomeando a contagem e o valor para o qual subir, além da mesma
frase como rodapé nos artefatos de Markdown e diagrama. Note que a
integração passa o tamanho **explicitamente** — o runtime nunca detecta um
framework de teste e muda de comportamento, porque um runtime que se
comporta diferente sob teste é um runtime cujos testes não provam nada.

Para seus próprios contextos de vida curta, faça o mesmo na costura que os constrói:

```ts
// Um contexto por requisição HTTP, dimensionado para uma requisição, não para um processo.
const buffer = new BufferedEventConsumer(4096);
const ctx = new SyncNarrativeContext(config, undefined, new DualPathPipeline(null, buffer));
try {
  /* ... trate a requisição, capture o trace ... */
} finally {
  ctx.eventPipeline.close();
}
```

### O timer de drenagem, e `close()`

- **O timer de drenagem começa no primeiro evento em buffer e só para
  quando o buffer drena até ficar vazio**, reiniciando no próximo evento.
  Ele nunca é cancelado sobre um buffer não vazio, então uma rajada seguida
  de silêncio ainda é drenada até o fim — nada fica encalhado. Um consumer
  ocioso não mantém nenhum timer, então descartá-lo sem `close()` não deixa
  nada retido. No Node o timer também recebe `unref`, então uma drenagem
  pendente nunca mantém o processo vivo.

**Ainda assim, chame `close()` onde quer que exista um ciclo de vida** —
fim de requisição, teardown de teste, desligamento. É o caminho
determinístico: ele drena a cauda para que um desligamento não a perca,
para o timer imediatamente em vez de esperar o próximo tick, e libera quem
espera em `whenClosed()`/`whenCountReached()`. `DualPathPipeline.close()` e
`context.eventPipeline.close()` encaminham para ele.

### Regra de dimensionamento — quando configurar para cima

Para um processo de longa duração, o anel só precisa cobrir eventos
produzidos *enquanto uma drenagem está travada* — ele é drenado a cada 100
ms, então estourar o padrão exige ~655.000 eventos/s sustentados ao longo
de uma janela. Durabilidade não é trabalho desse caminho; o consumer
síncrono do pipeline é quem cuida disso.

```
capacidade ≈ pico de eventos/s × pior travamento tolerável de drenagem (segundos)
memória após alocada ≈ capacidade × ~300 B/evento      (65.536 ≈ ~20 MB)
```

Exemplo prático — um serviço a 1.000 req/s, 50 chamadas traceadas por requisição, dois eventos por chamada (enter + exit):

```
1.000 × 50 × 2                = 100.000 eventos/s
100.000 × 0,5 s de travamento  =  50.000 eventos  →  abaixo de 65.536, o padrão aguenta
```

Dobre a taxa ou o travamento tolerado e você já está acima do padrão: passe
uma `capacity` maior (e verifique `overflowCount()` em staging). A memória
escala linearmente com ela — 262.144 é ~80 MB, e é por isso que deixou de
ser o padrão. O buffer nunca vai encontrar o espaço sozinho, então o número
que você passa é o número que você recebe: pequeno demais descarta eventos,
grande demais cobra de todo contexto que aloca um.

## Ver também

- [Guia de Instalação](guia-de-instalacao.md) — dependências, caminhos de integração, configuração da saída de trace
- [Guia de Decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guia de Clareza](guia-de-clareza.md) — modelo de pontuação, componentes de NLP, scanner estático
- [Guia de Integração com Frameworks](guia-de-integracao-de-frameworks.md) — Express, Hono, browser, AsyncLocalStorage
