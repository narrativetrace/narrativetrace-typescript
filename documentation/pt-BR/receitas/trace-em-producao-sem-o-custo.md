<!-- source: documentation/recipes/trace-in-production-without-the-cost.md blob 3d257fa9673c | translated: 2026-10-18 | reviewed: - -->
# Trace em produção sem o custo

[English](../../recipes/trace-in-production-without-the-cost.md) | [Español](../../es/recetas/traza-en-produccion-sin-el-coste.md) | **Português** | [简体中文](../../zh-CN/实用方案/在生产环境追踪而不付出代价.md)

## O problema

> Quero isto em produção para as requisições que dão errado. Não quero pagar por
> um trace completo de toda requisição que dá certo.

Isso é uma única configuração — o nível de tracing — e esta página é a mesma
execução vista por meio dele duas vezes: o checkout com pagamento recusado em
`detail`, onde todo valor é capturado, e em `errors`, onde só sobrevivem as
execuções que falharam.

## Configuração mínima

Um nível, definido onde quer que o seu deploy seja configurado. Todas estas
formas dizem a mesma coisa:

```bash
# the environment — the usual place for a deployment to set it
NARRATIVETRACE_LEVEL=errors node server.js
```

```jsonc
// narrativetrace.config.json — a project file, below the environment in precedence
{ "level": "errors" }
```

```ts
// or in code, which wins over both
const config = new NarrativeTraceConfig("errors"); // "off" | "errors" | "summary" | "narrative" | "detail"
```

O nível é o botão do próprio NarrativeTrace e fica na frente: uma chamada que
ele filtra nunca vira evento, para nenhum consumidor. O nível do seu logger é um
segundo botão, independente, que decide o que é *impresso* —
[FAQ, "Two dials, two paths"](../../faq.md) é a versão longa, e a distinção
importa aqui porque subir o nível de um logger economiza volume de log sem mudar
nada na captura. De onde vem cada configuração e qual prevalece:
[Guia de configuração § 1](../guia-de-configuracao.md#1-tracing-levels-narrativetraceconfig)
e [§ 2b](../guia-de-configuracao.md#2b-where-settings-come-from).

## O cenário

A execução é a reprodução do pagamento recusado de
[Ajude-me a depurar e corrigir este bug](ajude-me-a-depurar-e-corrigir-este-bug.md)
— `reserve`, depois `charge` lançando exceção, depois `release` — reaproveitada
sem alterações, porque o assunto desta página é o botão e não outro fluxo. O
driver abaixo a executa nos dois níveis em processos reais e aninhados do
Vitest, e executa também um checkout *bem-sucedido* em `errors`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/trace-in-production-without-the-cost.md: the SAME declined-payment
 * run, captured once at `detail` and once at `errors`, writes the two artifacts that page embeds —
 * `errors` keeps the failed run whole and drops every parameter value, and a successful run at
 * `errors` writes no artifact at all (release rule 8, docs as tests).
 *
 * @llmNote The scenario is `declined-payment-fixture`'s fixed reproduction, reused rather than
 * rewritten: this page's subject is the level dial, not another flow, and a reader comparing the two
 * levels should be comparing one run's renderings. Only the passing test is selected — the
 * fixture's other test fails by design for documentation/recipes/help-me-debug-and-fix-this-bug.md.
 */
const SLUG = "trace-in-production-without-the-cost";
const DECLINED = {
  fixture: "declined-payment-fixture",
  scenario: "the_stock_is_released_when_the_card_is_declined",
  testPattern: "declined$",
};
const SUCCESSFUL = {
  fixture: "checkout-review-fixture",
  scenario: "a_customer_buys_two_keyboards",
};
const CALLS_OF_THE_FAILED_RUN = [
  "OrderService.placeOrder",
  "InventoryService.reserve",
  "PaymentService.charge",
  "InventoryService.release",
];

interface Scenario {
  readonly fixture: string;
  readonly scenario: string;
  readonly testPattern?: string;
}

/** One nested, real Vitest run of `scenario` into `<slug>/<directory>` at `level` (absent: detail). */
function capture(scenario: Scenario, directory: string, level?: string): string {
  const output = recipeOutput(SLUG, directory);
  const run = runFixture(join("fixtures", `${scenario.fixture}.ts`), output, {
    ...(level ? { settings: { NARRATIVETRACE_LEVEL: level } } : {}),
    ...(scenario.testPattern ? { testPattern: scenario.testPattern } : {}),
  });
  expect(run.exitCode).toBe(0);
  return output;
}

/** The narrative a run wrote, without its per-run frontmatter, as the page embeds it. */
function narrativeOf(output: string, scenario: Scenario): string {
  return writeNarrativeBody(
    join(output, scenario.fixture, `${scenario.scenario}.md`),
    join(output, "narratives", `${scenario.scenario}.md`),
  );
}

describe("trace in production without the cost", () => {
  let detail: string;
  let errors: string;
  let successfulAtDetail: string;
  let successfulAtErrors: string;

  beforeAll(() => {
    detail = narrativeOf(capture(DECLINED, "detail"), DECLINED);
    errors = narrativeOf(capture(DECLINED, "errors", "errors"), DECLINED);
    successfulAtDetail = capture(SUCCESSFUL, "detail-successful");
    successfulAtErrors = capture(SUCCESSFUL, "errors-successful", "errors");
  }, 60_000);

  it("errors keeps the failed run whole", () => {
    for (const call of CALLS_OF_THE_FAILED_RUN) {
      expect(errors).toContain(call);
    }
  });

  it("a successful run writes no artifact at errors and does at detail", () => {
    // The control: the same path IS written when the level keeps successful runs, so the
    // absence is the level's doing and not a path that was never right.
    expect(existsSync(join(successfulAtDetail, SUCCESSFUL.fixture))).toBe(true);
    expect(existsSync(join(successfulAtErrors, SUCCESSFUL.fixture))).toBe(false);
    expect(readdirSync(successfulAtErrors)).toEqual(["vitest-report.json"]);
  });

  it("detail carries the values errors suppresses", () => {
    expect(detail).toContain('customerId: "C-1234"');
    expect(errors).not.toContain("C-1234");
  });

  it("both levels still redact the card number", () => {
    for (const narrative of [detail, errors]) {
      expect(narrative).toContain("[REDACTED]");
      expect(narrative).not.toContain("4000000000000002");
    }
  });

  it("writes a structural trace at errors that carries no values", () => {
    const structural = readFileSync(
      join(recipeOutput(SLUG, "errors"), "structural", DECLINED.fixture, `${DECLINED.scenario}.nt`),
      "utf-8",
    );

    expect(structural).toContain("InventoryService.release(sku, quantity)");
    expect(structural).not.toContain("C-1234");
  });
});
```

## A saída real

**Em `detail`**, a execução recusada, com todos os valores capturados (mostrada
sem o frontmatter, que carrega o nome da execução, um id de trace novo e uma
duração de relógio que mudam a cada execução):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.81ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.09ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.1ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.3
```

**Em `errors`**, a mesma execução do mesmo código:

```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.72ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.09ms #1.2
  - `InventoryService.release(sku: , quantity: )` — 0.02ms #1.3
```

**E em `errors`, um checkout que deu certo**: nenhum artefato. Não há nada para
embutir, e esse é todo o ponto — o driver acima afirma as duas metades dessa
alegação, a ausência do diretório em `errors` e a presença dele em `detail`, de
modo que o vazio é obra do nível e não de um caminho que nunca esteve certo.

## Como ler a saída

- **O que `errors` mantém.** A execução que falhou, inteira. `#1` lançou
  exceção, e a subárvore de um nó com erro é mantida intacta — então `reserve`
  (`#1.1`), `charge` (`#1.2`) e `release` (`#1.3`) continuam todos lá, inclusive
  as duas chamadas que retornaram normalmente. Isso é deliberado: as chamadas ao
  redor de uma falha são o que você precisa para diagnosticá-la, e descartar o
  irmão bem-sucedido deixaria você com uma exceção e sem história. Uma chamada
  que retornou *e* não leva a nenhuma falha abaixo dela é descartada, e uma raiz
  sem nenhuma falha em toda a sua subárvore é descartada por inteiro — por isso
  o checkout bem-sucedido não escreveu nada.
- **O que `errors` descarta.** Todo valor de parâmetro:
  `customerId: , sku: , quantity: `. O espaço vazio depois de cada nome é
  supressão na *captura* — o valor nunca foi renderizado, então não pode ser
  recuperado desses eventos depois, em nenhum nível posterior. O que sobrevive é
  o formato, os resultados e a exceção, e `cardNumber: [REDACTED]` continua
  ocultado porque ocultação é uma decisão diferente de supressão.
- **A poda acontece depois da captura, não no lugar dela.** Toda chamada foi
  interceptada e todo evento foi publicado; o construtor da árvore então montou a
  árvore e removeu o que o nível não mantém. Esse é o formato honesto do custo:
  `errors` é mais barato que `detail` porque os valores não são renderizados — a
  parte cara —, não porque chamadas deixem de ser interceptadas.
- **Só `off` pula a interceptação.** Em `off`, o proxy retorna antes de qualquer
  argumento, evento ou publicação acontecer, e nada adiante pode trazer a
  chamada de volta. `errors`, `summary` e `narrative` ainda interceptam toda
  chamada e publicam uma entrada e uma saída para ela. Se a pergunta é "quanto
  custa o tracing neste laço quente", a resposta é um nível diferente para esse
  escopo, ou `off`.
- **Os números.** Os valores medidos — o custo de uma chamada com tracing ligado
  mas em `off`, e o de uma totalmente capturada — estão na
  [seção Performance do README](../../../README.md#performance), com a data, a
  versão do Node e o harness de onde vêm. Não são repetidos aqui, porque uma
  cópia que acompanha as medições vale mais que duas que discordam.

## O que não é capturado

- **Os valores publicados são medições, não uma promessa.** Foram obtidos no
  harness e no hardware que o README nomeia. Os seus números dependem da sua
  versão do Node, do seu hardware, do formato dos seus parâmetros (um grafo de
  objetos profundo leva mais tempo para renderizar que um número) e de quanto do
  seu código tem trace. Meça o nível que você pretende rodar.
- **Um nível não é um controle de privacidade.** `errors` por acaso escreve
  menos valores porque os suprime, mas supressão e ocultação são mecanismos
  diferentes, com garantias diferentes:
  [Mantenha os segredos fora dos logs](mantenha-os-segredos-fora-dos-logs.md) é
  o que vale em todos os níveis.
- **Nada aqui muda quanto o seu logger escreve.** Cada evento capturado ainda é
  oferecido aos consumidores ao vivo, então o nível do próprio logger é o que
  decide o volume de log: `cost-logger-dial.test.ts`, no mesmo projeto, executa
  um checkout bem-sucedido em `errors` e encontra o trace capturado vazio e as
  oito linhas de log todas escritas. Dois botões.
- **Um nível não pode ser aumentado retroativamente.** Valores não capturados
  se foram; reproduzir a execução em `detail` é o único caminho de volta, que é
  o que a receita de depuração faz.
- **Níveis por escopo não são mostrados aqui.** Esta página define um nível para
  uma execução inteira. Restringir o escopo com trace — quais objetos são
  encapsulados, afinal — é a outra metade da questão do custo, e pertence a
  [Escolhendo uma integração](../escolhendo-uma-integracao.md).

**A skill para isso:** `narrativetrace-doctor` — ela informa o nível em que um
projeto está de fato rodando, que é a primeira coisa a verificar quando um trace
está mais magro do que o esperado.
