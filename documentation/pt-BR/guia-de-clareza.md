<!-- source: documentation/clarity-guide.md blob ace66e2b1458 | translated: 2026-09-03 | reviewed: - -->
# Guia de Clareza do NarrativeTrace TypeScript

[English](../clarity-guide.md) | [Español](../es/guia-de-claridad.md) | **Português** | [简体中文](../zh-CN/清晰度指南.md)

Se o trace é o código, então a qualidade do trace é a qualidade do código. O módulo de clareza analisa os nomes dos seus métodos, classes e parâmetros, e pontua o quão bem eles comunicam a intenção.

## Início rápido

```ts
import { analyzeClarity, renderClarityReport } from "@narrativetrace/clarity";

const result = analyzeClarity(context.captureTrace());
console.log(renderClarityReport([{ scenario: "Order Placement", result }]));
```

Com o Vitest, os relatórios de clareza são gerados automaticamente ao usar o formato `"clarity-json"` — sem necessidade de código.

## O que é pontuado

A clareza produz uma única pontuação geral (0.0–1.0) a partir de cinco componentes ponderados:

| Component | Weight | What it measures |
|---|---|---|
| Nomes de métodos | 30% | Qualidade do verbo, especificidade dos tokens, abreviações, contagem de tokens |
| Nomes de parâmetros | 25% | Especificidade de domínio vs. tokens genéricos/sem significado |
| Nomes de classes | 20% | Qualidade do sufixo de papel, especificidade do prefixo |
| Estrutural | 15% | Penalidades por contagem de parâmetros e profundidade de chamadas |
| Coesão | 10% | Se os métodos se alinham com o sufixo de papel da classe |

## A pontuação na prática

### Nomes de métodos

O primeiro token é tratado como um verbo. Verbos de domínio pontuam mais alto, verbos genéricos pontuam mais baixo:

| Verb category | Examples | Score |
|---|---|---|
| Domínio | `calculate`, `validate`, `reserve`, `dispatch` | 0.60 |
| Padrão | `create`, `find`, `delete`, `update` | 0.45 |
| Prefixo booleano | `is`, `has`, `can`, `contains` | 1.00 |
| Genérico | `get`, `set`, `process`, `handle`, `execute` | 0.10 |

Métodos com vários tokens, como `reserveInventory`, pontuam mais alto do que métodos de um único token, como `reserve`, porque os tokens adicionais aumentam a especificidade.

### Nomes de classes

Um sufixo de papel é esperado. Sufixos de padrão de projeto e funcionais pontuam bem quando combinados com um prefixo de domínio:

| Pattern | Score | Why |
|---|---|---|
| `OrderService` | 1.0 | Prefixo de domínio + sufixo funcional |
| `Service` | 0.0 | Sem prefixo — sem significado |
| `DataProcessor` | Baixa | Prefixo vago + sufixo genérico |
| `BookingManager` | Média | Prefixo de domínio, mas `Manager` é genérico |

### Nomes de parâmetros

Nomes específicos de domínio pontuam alto, nomes genéricos pontuam baixo:

| Tier | Examples | Score |
|---|---|---|
| Específico de domínio | `customerId`, `checkInDate`, `roomCategory` | 0.80+ |
| Genérico tipado | `id`, `name`, `count`, `status` | 0.50 |
| Vago | `data`, `info`, `result`, `object` | 0.10 |
| Sem significado | `x`, `foo`, `val`, `temp` | 0.00 |

### Penalidades estruturais

Métodos com mais de 4 parâmetros ou profundidade de chamada além de 5 são penalizados. Cada parâmetro excedente custa 0.1; cada nível de profundidade excedente custa 0.05.

### Coesão

Os métodos são verificados contra os verbos esperados para o sufixo de papel da classe. Espera-se que uma classe `Repository` tenha métodos como `find`, `save`, `delete`, `count`. Um método como `renderReport` em um `GuestRepository` é sinalizado como desalinhado.

## Problemas e severidade

Os problemas de clareza são relatados como itens ordenados por impacto:

| Severity | Threshold | Examples |
|---|---|---|
| HIGH | pontuação <= 0.20 | `DataProcessor.execute(data)` |
| MEDIUM | pontuação <= 0.50 | `BookingManager.handleBooking(name, type)` |
| LOW | pontuação > 0.50 | Uso pontual de abreviação |

Problemas duplicados (mesma categoria e mesmo elemento) são deduplicados com uma contagem de ocorrências. Os problemas são ordenados pela pontuação de impacto (peso da severidade x ocorrências).

## Seu próprio vocabulário, a partir do glossário que você já tem

Os dicionários integrados conhecem o inglês geral de software. Eles não sabem que
`fold` é um verbo do seu domínio, que `tranche` é um substantivo preciso, ou que `fx`
é a abreviatura aceita da sua equipe — e um nome que eles não conhecem pontua como
desconhecido, não como específico de domínio.

Você os ensina com o arquivo de vocabulário que o seu repositório já carrega: o
`glossary.json` commitado (ADR-012). Não existe um segundo arquivo de dicionário
para manter sincronizado.

| Glossary entry | Kind | What clarity learns |
|---|---|---|
| `settle trade` | `verb-phrase` | `settle` é um verbo de domínio; `trade` é um substantivo de domínio |
| `credit tranche` | `noun-phrase` | `credit` e `tranche` são substantivos de domínio |
| `foreign exchange` | `noun-phrase` | `foreign` e `exchange` são substantivos de domínio |

Termos com várias palavras ensinam um token de cada vez, porque os identificadores
são pontuados um token de cada vez. Todo contexto delimitado contribui: um
identificador não carrega um caminho de módulo, então o escopo por contexto não
pode se aplicar no momento da pontuação.

### A abreviatura aceita é declarada, não inferida

As abreviações vivem em sua própria seção de nível raiz (schema 2 do glossário):

```json
{
  "schemaVersion": 2,
  "abbreviations": { "fx": "foreign exchange", "calc": "calculate" }
}
```

Um token listado é a palavra da sua equipe: o dicionário de abreviações para de
pedir que ela seja escrita por extenso, e a expansão está ali para ensinar a
partir dela quando ela é mencionada.

**Ser um token de um termo commitado é, deliberadamente, não o suficiente.** A
coleta da frase `calc total` não deve aceitar `calc` silenciosamente em todo o
repositório — ninguém leu `calc` quando aprovou a frase, e a dica
`calc → calculate` desapareceria em todo lugar de uma só vez. A aceitação é uma
decisão que alguém toma.

Isso também mantém o glossário honesto quanto à linguagem ubíqua. Para aceitar
`fx` você teria, de outra forma, que commitar `fx` como um *termo* canônico —
mas a palavra do domínio é `foreign exchange`, e manter os dois cria duas
entradas para um único conceito, exatamente o que um glossário existe para
evitar (ADR-012).

A seção é de propriedade humana: a coleta nunca a escreve, um merge a carrega
intocada, e ela é renderizada em `glossary.md` para que a decisão seja revisada
como qualquer outra. Um glossário que não declara abreviações continua
registrando `"schemaVersion": 1` e serializa byte a byte como antes.

### O que o glossário não pode fazer

Os dicionários integrados mantêm sua autoridade. Um projeto pode ensinar aos
avaliadores uma palavra que eles não conhecem; não pode sobrepor uma que eles
já conhecem.

- **Verbos genéricos continuam genéricos.** Commitar `process` ou `handle` não
  os promove, e o mesmo vale para os prefixos booleanos (`is`, `has`).
- **Placeholders sem significado continuam sem significado.** `temp`, `foo` e
  companhia não são resgatados só por serem escritos.
- **Sinônimos obsoletos nunca são vocabulário.** Um alias existe para ser
  sinalizado; promovê-lo silenciaria o problema `non-canonical-term` para o
  qual foi declarado.
- **Termos `stale` não são vocabulário.** Marcar um termo como stale diz que a
  palavra saiu do domínio.

Só conta o arquivo *commitado*. Nada do que uma execução coleta realimenta as
pontuações dessa mesma execução — um vocabulário autoexpansível tornaria as
pontuações não determinísticas e autocertificadas. O commit é a aprovação
humana.

### Onde se aplica

A fixture do Vitest lê o glossário indicado por `NARRATIVETRACE_GLOSSARY_DIR`
(padrão: o diretório de trabalho), memoizado uma vez por processo worker. A
leitura é incondicional — diferente da coleta, que é opt-in
(`NARRATIVETRACE_GLOSSARY=true`) porque reescreve arquivos fora do diretório de
artefatos. Um repositório sem `glossary.json` pontua exatamente como pontuava
antes de essa funcionalidade existir, e um glossário que não pode ser lido
degrada para os dicionários integrados com um aviso, em vez de falhar a suíte.

```ts
import { analyzeClarity } from "@narrativetrace/clarity";
import { projectVocabulary } from "@narrativetrace/vitest";

// Pontuando manualmente, fora da fixture:
const result = analyzeClarity(tree, projectVocabulary());
```

`@narrativetrace/glossary` expõe o próprio mapeamento — `glossaryVocabulary(glossary)`
para um glossário já parseado, `readProjectVocabulary(dir, fileReader)` para um em
disco — para que um host que não seja Node possa fornecer seu próprio acesso a
arquivos.

## Saída do relatório

### Cenário único

```ts
import { analyzeClarity, renderClarityReport, type ScenarioResult } from "@narrativetrace/clarity";

const result = analyzeClarity(tree);
const scenarios: ScenarioResult[] = [{ scenario: "Guest books a room", result }];
console.log(renderClarityReport(scenarios));
```

Produz um relatório em Markdown com uma tabela de pontuações e uma tabela de problemas (se houver):

```markdown
## Clarity Report — Guest books a room
Overall: 0.95 (high)

| Component  | Score |
|------------|-------|
| Method     | 0.98  |
| Class      | 1.00  |
| Parameter  | 0.90  |
| Structural | 1.00  |
| Cohesion   | 0.85  |
```

### Relatório da suíte

```ts
const scenarios: ScenarioResult[] = [
  { scenario: "Guest books a room", result: result1 },
  { scenario: "Legacy data processing", result: result2 },
];
console.log(renderClarityReport(scenarios));
```

Produz um resumo ordenado de todos os cenários. Cenários com pontuação abaixo de 0.7 recebem um detalhamento com os problemas individuais.

### Exportação JSON

```ts
import { exportClarityJson, exportClarityJsonReport } from "@narrativetrace/clarity";

// Cenário único
const json = exportClarityJson(result, { scenario: "Guest books a room" });

// Relatório multi-cenário
const reportJson = exportClarityJsonReport(scenarios);
```

## Integração com o Vitest

Use o formato `"clarity-json"` com `createNarrativeTest`:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "clarity-json"],
});

test("guest books a room", ({ narrativeContext }) => {
  // ... código do teste
});
```

Depois de cada teste, um arquivo `.clarity-json` é escrito ao lado da saída do trace.

## CLI do scanner estático

O scanner estático analisa os arquivos-fonte diretamente — sem necessidade de testes:

```bash
npx tsx tools/clarity-scan.ts
```

### Opções

| Flag | Effect |
|------|--------|
| `--min-score=0.80` | Encerra com erro se alguma classe pontuar abaixo do limiar |
| `--json` | Gera saída em JSON em vez de Markdown |

### Exemplos

```bash
# Escaneia todos os pacotes, saída legível por humanos
npx tsx tools/clarity-scan.ts

# Aplica a pontuação mínima na CI
npx tsx tools/clarity-scan.ts --min-score=0.80

# Saída em JSON para ferramentas
npx tsx tools/clarity-scan.ts --json
```

### Como funciona

1. Encontra todos os arquivos-fonte `.ts` em todos os pacotes (excluindo testes e declarações)
2. Analisa cada arquivo usando a TypeScript Compiler API
3. Extrai classes com seus métodos e parâmetros
4. Executa `analyzeClarity()` em cada classe
5. Renderiza um relatório de clareza ou encerra com erro se estiver abaixo do limiar

## Aplicação na CI

Clareza é um gate de build, não apenas um relatório. Dois pontos de entrada a aplicam, e ambos encerram com código diferente de zero quando o orçamento de qualidade de nomenclatura é estourado, para que a CI falhe o build.

### O gate do `check`

O gate de qualidade `pnpm run check` da raiz executa o gate de clareza como um de seus estágios via o script `clarity:gate`:

```bash
# O que o pnpm run clarity:gate realmente executa:
tsx tools/clarity-scan.ts --min-score 0.4 --max-high-issues 15
```

Isso escaneia estaticamente cada arquivo-fonte em `packages/*/src`, pontua cada classe, e falha o build se alguma classe pontuar abaixo de `0.4` **ou** a suíte produzir mais de `15` problemas de severidade HIGH. Ajuste esses dois números para mover a régua.

### Flags de `tools/clarity-scan.ts`

O scanner estático aceita tanto a forma `--flag value` quanto `--flag=value`:

| Flag | Effect |
|------|--------|
| `--min-score <n>` | Falha se alguma classe escaneada pontuar abaixo de `<n>` |
| `--max-high-issues <n>` | Falha se a suíte tiver mais de `<n>` problemas de severidade HIGH |
| `--warn-only` | Imprime violações como `warning:` mas encerra com `0` (relata sem bloquear) |
| `--format <both\|md\|json>` | Com `--output-dir`, quais artefatos da suíte escrever |
| `--output-dir <dir>` | Escreve `clarity-report.md` e/ou `clarity-results.json` em `<dir>` em vez de imprimir |
| `--json` | Imprime o JSON da suíte no stdout em vez de Markdown |

**Códigos de saída:** `0` sucesso, `1` falha do gate (uma violação de `--min-score` ou `--max-high-issues` sem `--warn-only`), `2` erro de uso (um valor desconhecido de `--format`). Exemplos de invocações na CI:

```bash
# Gate estrito — falha na primeira classe abaixo do limiar
tsx tools/clarity-scan.ts --min-score 0.80

# Gate na contagem de problemas HIGH e emite artefatos para o pipeline arquivar
tsx tools/clarity-scan.ts --max-high-issues 15 --output-dir clarity-out --format both

# Somente observação: exibe avisos em PRs sem falhar o build ainda
tsx tools/clarity-scan.ts --min-score 0.80 --warn-only
```

### O bin `narrativetrace-clarity`

`@narrativetrace/clarity` também distribui um bin `narrativetrace-clarity`. Em vez de escanear o código-fonte, ele re-renderiza e aplica o gate em um `clarity-results.json` da suíte **já acumulado** (o arquivo que o reporter do Vitest escreve — veja abaixo), então ele se encaixa em um estágio do pipeline que roda depois da suíte de testes:

```bash
narrativetrace-clarity --min-score 0.4 --max-high-issues 15
```

| Flag | Effect |
|------|--------|
| `--input <file>` | Arquivo de resultados a ler (padrão `<output-dir>/clarity-results.json`) |
| `--output-dir <dir>` | Onde os artefatos re-renderizados são escritos (padrão `.`) |
| `--format <both\|md\|json>` | Quais artefatos re-renderizar |
| `--min-score <n>` | Falha se um cenário pontuar abaixo de `<n>` |
| `--max-high-issues <n>` | Falha se a suíte exceder `<n>` problemas de severidade HIGH |
| `--warn-only` | Imprime violações como `warning:` e encerra com `0` |

**Códigos de saída:** `0` sucesso, `1` falha do gate ou um erro de E/S (por exemplo, o arquivo de entrada está ausente ou ilegível), `2` erro de uso (um valor desconhecido de `--format` ou qualquer argumento desconhecido).

### Gerando o arquivo de resultados a partir do Vitest

A entrada do gate é produzida pelo `ClaritySuiteReporter` do Vitest. Assim que todo arquivo de teste de uma execução termina, ele escreve exatamente **um** `clarity-results.json` e **um** `clarity-report.md` para a suíte inteira (no `outputDir` do reporter, que assume `narrativetrace-output` por padrão). Uma execução sem metadados de clareza não escreve nada. Aponte `narrativetrace-clarity --input` para esse `clarity-results.json` para aplicar o gate no build com base na qualidade agregada de nomenclatura da suíte.

## Componentes de NLP

O módulo de clareza usa NLP escrito à mão, sem dependências externas:

| Component | Purpose |
|---|---|
| `IdentifierTokenizer` | Divide camelCase, snake_case, underscores e limites numéricos em tokens |
| `VerbDictionary` | Categoriza verbos em domínio/padrão/genérico/booleano com mais de 500 verbos cobertos por domínio (incluindo cobertura derivada de colocações/papéis) |
| `RoleSuffixDictionary` | Classifica sufixos de classe (padrão de projeto, funcional, genérico) |
| `GenericTokenDetector` | Classifica a especificidade dos tokens (sem significado -> específico de domínio) |
| `AbbreviationDictionary` | Pontua 187 abreviações em três níveis (universal, bem conhecida, ambígua) |
| `MorphologyAnalyzer` | Detecta classes gramaticais via sufixos (-tion, -ize, -able) |
| `CollocationDictionary` | Valida pareamentos verbo-substantivo em 209 substantivos mesclados (semântica de merge do mapa de domínio) |
| `CohesionScorer` | Verifica o alinhamento verbo-método com as expectativas do papel da classe |
| `DomainVocabulary` | As palavras próprias do projeto, lidas do glossário commitado; estende todos os dicionários acima sem sobrepô-los |

## Salvaguardas dos dicionários

Os dicionários de clareza são protegidos por salvaguardas automatizadas:

- Invariantes baseados em propriedades (`fast-check`) verificam buscas case-insensitive para colocações, expectativas de papel e abreviações.
- Verificações de consistência garantem que verbos de colocação e verbos esperados por papel sejam sempre classificados pelo `VerbDictionary`.
- Testes de guarda de drift aplicam limites inferiores conservadores para os tamanhos dos dicionários e imprimem métricas atuais durante as execuções de teste.

## Veja também

- [Guia de Configuração](guia-de-configuracao.md) — níveis de tracing, configuração da saída
- [Guia de Decoradores](guia-de-decoradores.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Guia de Instalação](guia-de-instalacao.md) — dependências e caminhos de integração
