<!-- source: documentation/recipes/trace-in-production-without-the-cost.md blob 3d257fa9673c | translated: 2026-10-18 | reviewed: - -->
# Traza en producción sin el coste

[English](../../recipes/trace-in-production-without-the-cost.md) | **Español** | [Português](../../pt-BR/receitas/trace-em-producao-sem-o-custo.md) | [简体中文](../../zh-CN/实用方案/在生产环境追踪而不付出代价.md)

## El problema

> Quiero esto en producción para las peticiones que salen mal. No quiero pagar
> por una traza completa de cada petición que sale bien.

Eso es un solo ajuste — el nivel de trazado — y esta página es la misma
ejecución vista a través de él dos veces: el checkout con pago rechazado en
`detail`, donde se captura cada valor, y en `errors`, donde solo sobreviven las
ejecuciones que fallaron.

## Configuración mínima

Un nivel, fijado donde se configure tu despliegue. Todo lo siguiente dice lo
mismo:

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

El nivel es el dial propio de NarrativeTrace y está al frente: una llamada que
filtra nunca se convierte en evento, para ningún consumidor. El nivel de tu
logger es un segundo dial independiente que decide lo que se *imprime* —
[FAQ, "Two dials, two paths"](../../faq.md) es la versión larga, y la
distinción importa aquí porque subir el nivel de un logger te ahorra volumen de
log sin cambiar nada de la captura. De dónde viene cada ajuste y cuál prevalece:
[Guía de configuración § 1](../guia-de-configuracion.md#1-niveles-de-trazado-narrativetraceconfig)
y [§ 2b](../guia-de-configuracion.md#2b-de-dónde-provienen-los-ajustes).

## El escenario

La ejecución es la reproducción del pago rechazado de
[Ayúdame a depurar y arreglar este error](ayudame-a-depurar-y-arreglar-este-error.md)
— `reserve`, luego `charge` lanzando una excepción, luego `release` — reutilizada
sin cambios, porque el tema de esta página es el dial y no otro flujo. El driver
de abajo la ejecuta en ambos niveles en procesos reales y anidados de Vitest, y
ejecuta también un checkout *exitoso* en `errors`:

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

## La salida real

**En `detail`**, la ejecución rechazada, con cada valor capturado (se muestra
sin su frontmatter, que lleva el nombre de la ejecución, un id de traza nuevo y
una duración de reloj que difieren en cada ejecución):

```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.81ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.09ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.1ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.3
```

**En `errors`**, la misma ejecución del mismo código:

```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.72ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.09ms #1.2
  - `InventoryService.release(sku: , quantity: )` — 0.02ms #1.3
```

**Y en `errors`, un checkout que tuvo éxito**: ningún artefacto en absoluto. No
hay nada que incluir, que es todo el punto — el driver de arriba comprueba las
dos mitades de esa afirmación, la ausencia del directorio en `errors` y su
presencia en `detail`, de modo que el vacío es obra del nivel y no de una ruta
que nunca fue la correcta.

## Cómo leerlo

- **Lo que conserva `errors`.** La ejecución fallida, entera. `#1` lanzó una
  excepción, y el subárbol de un nodo de error se conserva intacto — así que
  `reserve` (`#1.1`), `charge` (`#1.2`) y `release` (`#1.3`) siguen ahí,
  incluidas las dos llamadas que retornaron con normalidad. Es deliberado: las
  llamadas alrededor de un fallo son lo que necesitas para diagnosticarlo, y
  descartar al hermano exitoso te dejaría con una excepción y sin historia. Una
  llamada que retornó *y* no lleva a ningún fallo por debajo se descarta, y una
  raíz sin ningún fallo en todo su subárbol se descarta por completo — por eso
  el checkout exitoso no escribió nada.
- **Lo que descarta `errors`.** Cada valor de parámetro:
  `customerId: , sku: , quantity: `. El espacio vacío tras cada nombre es
  supresión en la *captura* — el valor nunca se renderizó, así que no puede
  recuperarse de estos eventos después, a ningún nivel posterior. Lo que
  sobrevive es la forma, los resultados y la excepción, y
  `cardNumber: [REDACTED]` sigue oculto porque la ocultación es una decisión
  distinta de la supresión.
- **La poda ocurre después de la captura, no en lugar de ella.** Cada llamada
  se interceptó y cada evento se publicó; el constructor del árbol construyó
  entonces el árbol y eliminó lo que el nivel no conserva. Esa es la forma
  honesta del coste: `errors` es más barato que `detail` porque los valores no
  se renderizan — la parte cara — no porque las llamadas queden sin interceptar.
- **Solo `off` omite la intercepción.** En `off` el proxy retorna antes de que
  ocurra ningún argumento, evento o publicación, y nada aguas abajo puede
  recuperar la llamada. `errors`, `summary` y `narrative` siguen interceptando
  cada llamada y publicando una entrada y una salida para ella. Si la pregunta
  es "cuánto cuesta el trazado en este bucle caliente", la respuesta es un nivel
  distinto para ese ámbito, o `off`.
- **Los números.** Las cifras medidas — el coste de una llamada con el trazado
  activado pero en `off`, y de una capturada por completo — están en la
  [sección Performance del README](../../../README.md#performance), con la
  fecha, la versión de Node y el harness de los que provienen. No se repiten
  aquí, porque una copia que se mueve con las mediciones vale más que dos que
  discrepan.

## Lo que no se captura

- **Las cifras publicadas son mediciones, no una promesa.** Se tomaron en el
  harness y el hardware que nombra el README. Tus números dependen de tu versión
  de Node, tu hardware, la forma de tus parámetros (un grafo de objetos profundo
  se renderiza durante más tiempo que un número) y cuánto de tu código se traza.
  Mide el nivel que piensas ejecutar.
- **Un nivel no es un control de privacidad.** `errors` escribe menos valores
  porque los suprime, pero supresión y ocultación son mecanismos distintos con
  garantías distintas:
  [Mantén los secretos fuera de los logs](manten-los-secretos-fuera-de-los-logs.md)
  es la que se sostiene a todos los niveles.
- **Nada de esto cambia cuánto escribe tu logger.** Cada evento capturado se
  sigue ofreciendo a los consumidores en vivo, así que el nivel propio del
  logger es lo que decide el volumen de log: `cost-logger-dial.test.ts` en el
  mismo proyecto ejecuta un checkout exitoso en `errors` y encuentra la traza
  capturada vacía y las ocho líneas de log escritas. Dos diales.
- **Un nivel no puede subirse con efecto retroactivo.** Los valores no
  capturados se han perdido; reproducir la ejecución en `detail` es la única
  vuelta atrás, que es lo que hace la receta de depuración.
- **Aquí no se muestran niveles por ámbito.** Esta página fija un nivel para
  toda una ejecución. Acotar el ámbito trazado en su lugar — qué objetos se
  envuelven siquiera — es la otra mitad de la cuestión del coste, y le
  corresponde a [Eligiendo una integración](../eligiendo-una-integracion.md).

**La skill para esto:** `narrativetrace-doctor` — informa del nivel al que
realmente se ejecuta un proyecto, que es lo primero que hay que comprobar
cuando una traza es más delgada de lo esperado.
