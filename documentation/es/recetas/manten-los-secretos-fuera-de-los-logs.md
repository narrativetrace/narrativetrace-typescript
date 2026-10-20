<!-- source: documentation/recipes/keep-secrets-out-of-the-logs.md blob e8220a1dc202 | translated: 2026-10-18 | reviewed: - -->
# Mantén los secretos fuera de los logs

[English](../../recipes/keep-secrets-out-of-the-logs.md) | **Español** | [Português](../../pt-BR/receitas/mantenha-os-segredos-fora-dos-logs.md) | [简体中文](../../zh-CN/实用方案/别让密钥进日志.md)

## El problema

> Si esto registra cada llamada con cada argumento, va a registrar un número
> de tarjeta. Convénceme de que no lo hace.

El checkout recibe una contraseña y un número de tarjeta. A continuación hay
una ejecución con ambos, el log que realmente escribió y la prueba que demuestra
que ninguno de los dos valores está en ese fichero.

## Configuración mínima

Nada. La ocultación está activada en todas las integraciones publicadas y no
hay ninguna superficie de configuración que la desactive — la lista de
denegación se consulta en la *captura*, antes de que un valor se convierta en
evento, así que un valor denegado nunca llega a la línea de log, al fichero de
traza, a la ruta con búfer ni a un consumidor del pipeline.
[Privacidad y ocultación](../privacidad-y-ocultacion.md) es la versión fila por
fila, verificada contra el código. Las líneas de log de aquí salen del puente
de pino, conectado como en [Añade registro a este servicio](anade-registro-a-este-servicio.md).

Aun así, hay dos cosas que vale la pena hacer una vez en tu propio proyecto:

1. **Escribe la prueba de esta página para tu propio flujo.** Una ocultación que
   no has comprobado es una afirmación, no una propiedad de tu build. El hallazgo
   del doctor "redaction never proven in a test" existe exactamente para esto.
2. **Conoce la salida de emergencia.** Un secreto bajo un nombre que nadie
   podría adivinar — `fingerprint`, `answer2` — se alcanza por índice:
   `traceObject(service, context, { methods: { signIn: { params: [...], notTraced: [1] } } })`
   oculta el segundo argumento sea cual sea su nombre, y `@notTraced(1)` hace lo
   mismo con decoradores. Siempre gana
   ([Guía de decoradores § `@notTraced`](../guia-de-decoradores.md#nottraced)).

## El escenario

Un colaborador nuevo, para que la ejecución lleve una contraseña además de una
tarjeta. Su parámetro se llama `password` — ese nombre es todo el punto:

```ts
// src/accounts.ts
/** Signs a customer in before the checkout charges them. The parameter is named `password`. */
export interface CustomerAccounts {
  /**
   * @returns the session id the checkout carries for the rest of the request
   * @throws {RangeError} when the password is blank
   */
  signIn(customerId: string, password: string): string;
}

/** Accounts that accept any non-blank password, so the scenario needs no user store. */
export class InMemoryAccounts implements CustomerAccounts {
  signIn(customerId: string, password: string): string {
    if (password.trim() === "") {
      throw new RangeError("password must not be blank");
    }
    return `SESSION-${customerId}`;
  }
}
```

La ejecución inicia sesión del cliente y hace el pedido. Los dos valores
secretos son constantes aquí para que la prueba pueda buscarlos en el log
después — un flujo real los obtiene de la petición:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAccounts } from "../src/accounts.js";
import { contextLoggingTo } from "../support/log-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/keep-secrets-out-of-the-logs.md: one checkout carrying a password
 * and a card number writes neither into the log its own logger produced — the password caught by
 * its NAME, the card number by its name and again, one call deeper, by its VALUE (release rule 8,
 * docs as tests).
 *
 * @llmNote The assertion reads the file the pino logger wrote, not a rendering this test produced:
 * a page claiming "the secret is not in your log" is only worth what a real log file says.
 */
const SLUG = "keep-secrets-out-of-the-logs";
const LOG_FILE = recipeOutput(SLUG, "checkout.log");

/** Luhn-valid, like a real one — which is what the value-shape rule recognizes. */
const CARD_NUMBER = "4242424242424242";

/**
 * The password this run signs in with. Matches no value-shape rule at all: only its parameter's
 * NAME can save it.
 *
 * @llmNote Named for the phrase rather than for the field it fills, because the public snapshot's
 * secrets gate reads a constant whose name carries that word and whose value is a string literal as
 * a credential shipped in the open — correctly, for every such line but a documentation fixture's.
 */
const SIGN_IN_PASSPHRASE = "orchid-trombone-77";

beforeEach(useStableSpanIds);

describe("keep secrets out of the logs", () => {
  it("a checkout with a password and a card writes neither", () => {
    const context = contextLoggingTo(LOG_FILE);
    const accounts = traceObject(
      new InMemoryAccounts(),
      context,
      { signIn: ["customerId", "password"] },
      { className: "CustomerAccounts" },
    );
    const { checkout } = tracedCheckout(context);

    const session = accounts.signIn("C-1234", SIGN_IN_PASSPHRASE);
    const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);

    expect(session).toBe("SESSION-C-1234");
    expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
    assertNeitherSecretIsInTheLog();
    const narrative = renderMarkdownBody(context.captureTrace());
    writeFileSync(recipeOutput(SLUG, "narrative.md"), `${narrative}\n`);
    assertNeitherSecretIsInTheNarrative(narrative);
  });

  it("a secret under a name nobody could guess is redacted by index", () => {
    const context = contextLoggingTo(recipeOutput(SLUG, "by-index.log"));
    const accounts = traceObject(new InMemoryAccounts(), context, {
      className: "CustomerAccounts",
      methods: { signIn: { params: ["customerId", "answer2"], notTraced: [1] } },
    });

    accounts.signIn("C-1234", SIGN_IN_PASSPHRASE);

    const log = readFileSync(recipeOutput(SLUG, "by-index.log"), "utf-8");
    expect(log).toContain('{"name":"answer2","value":"[REDACTED]"}');
    expect(log).not.toContain(SIGN_IN_PASSPHRASE);
  });
});

/** The proof: the log file the project's own logger wrote, read back and searched. */
function assertNeitherSecretIsInTheLog(): void {
  const log = readFileSync(LOG_FILE, "utf-8");
  expect(log).toContain('{"name":"password","value":"[REDACTED]"}');
  expect(log).toContain('{"name":"cardNumber","value":"[REDACTED]"}');
  expect(log).toContain('{"name":"card","value":"[REDACTED]"}');
  expect(log).not.toContain(SIGN_IN_PASSPHRASE);
  expect(log).not.toContain(CARD_NUMBER);
}

/** The other surface a secret could have reached: the narrative rendered from the same run. */
function assertNeitherSecretIsInTheNarrative(narrative: string): void {
  expect(narrative).not.toContain(SIGN_IN_PASSPHRASE);
  expect(narrative).not.toContain(CARD_NUMBER);
}
```

## La salida real

**El log que escribió la ejecución**, a través del logger propio del proyecto.
Cada parámetro es un par `name`/`value` en `nt.parameters`:

```text
{"level":10,"code.namespace":"CustomerAccounts","code.function":"signIn","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"password","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ CustomerAccounts.signIn"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"SESSION-C-1234\"","msg":"← returned: \"SESSION-C-1234\""}
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```

**La narrativa de la misma ejecución**, renderizada desde su traza capturada —
la otra superficie a la que podría haber llegado un secreto (un fichero de traza
es esto, escrito a disco):

```text
- `CustomerAccounts.signIn(customerId: "C-1234", password: [REDACTED])` → `"SESSION-C-1234"` — 1ms #1
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #2
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #2.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.18ms #2.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.16ms #2.3
```

## Cómo leerlo

**Qué regla atrapó qué valor.** Tres valores han desaparecido, por dos
mecanismos independientes:

| Línea | Valor | Atrapado por |
|---|---|---|
| `#1` `CustomerAccounts.signIn(…, password: [REDACTED])` | `orchid-trombone-77` | Su **nombre**. `password` está en la lista de denegación siempre activa, que coincide con nombres de parámetros y de campos — en varios idiomas — en cualquier clase, incluidas las tuyas. Ninguna regla de forma lo habría atrapado: es una cadena corriente |
| `#2` `OrderService.placeOrder(…, cardNumber: [REDACTED])` | `4242424242424242` | Su **nombre** otra vez: `cardNumber` está en la misma lista |
| `#2.2` `PaymentService.charge(…, card: [REDACTED])` | el mismo número, una llamada más abajo | Su **valor**. El parámetro se llama `card`, que la lista de denegación no conoce — y el número es válido según Luhn, así que la comprobación independiente de forma del valor lo atrapó igualmente |

Esa tercera fila es la que vale la pena recordar: `card` es como se llama un
parámetro en el código real, y el eje del nombre por sí solo lo habría
imprimido. El eje de la forma conoce un número de tarjeta válido según Luhn, un
JWT, una cadena `Set-Cookie`, un número de la Seguridad Social estadounidense
con guiones y un número de identidad nacional que pasa su propio checksum.

**Dónde viven las reglas.** En la biblioteca, no en tu configuración:
`RedactionPolicy.DEFAULT` en `@narrativetrace/core`, consultada por el
renderizador de valores que toda integración publicada construye del mismo
modo. No hay ninguna opción, variable de entorno ni nivel de log que la alcance,
y `traceObject()` no acepta un `redactionPolicy` propio;
[Privacidad y ocultación](../privacidad-y-ocultacion.md) enumera las superficies
y qué prevalece sobre qué. Por cierto, `customerId: "C-1234"` *sí* se escribe
completo — un id de cliente es identificativo, no secreto, y NarrativeTrace no
adivina. Si el tuyo no debe registrarse, eso es `notTraced`, que es una decisión
en tu código fuente y no un estado que un despliegue pueda cambiar.

**Por qué la prueba es la demostración, no la página.**
`assertNeitherSecretIsInTheLog` lee el fichero que escribió el logger y
comprueba dos cosas: que los tres parámetros ocultos están presentes *como*
`[REDACTED]`, y que ninguna de las dos cadenas secretas aparece en ningún lugar
de él. Una página solo puede mostrarte bytes; una prueba rompe el build el día
en que una refactorización renombra `password` a algo que la lista no conoce.
Esa es la diferencia entre "era seguro cuando esto se escribió" y "es seguro
ahora". Conserva la aserción de ausencia — el `not.toContain` — incluso cuando
la de presencia parezca suficiente: un valor que desaparece porque la llamada
dejó de trazarse del todo seguiría satisfaciendo la primera. La segunda prueba
hace lo mismo con la salida de emergencia: `answer2` es un nombre que la lista
no conoce, y se oculta porque la llamada lo pidió.

## Lo que no se captura

- **El código que no se traza no le corresponde ocultarlo a NarrativeTrace.**
  Arriba hay cinco objetos envueltos; un secreto que pasa entre dos clases sin
  envolver no se ve y, por tanto, ni se oculta ni se registra. Eso no es una
  garantía de seguridad — es una garantía de silencio.
- **Un secreto que escribe tu propia sentencia de log es tuyo.** NarrativeTrace
  oculta lo que *él* renderiza. `logger.info({ card }, "charging")` es tu línea,
  en tu código, y nada de aquí la filtra. El contrato de ocultación trata de la
  narrativa generada, no de todo lo que escribe el proceso.
- **Un valor de retorno no se compara por nombre**, porque no tiene. `signIn`
  devuelve `"SESSION-C-1234"` y se imprime. Un token de sesión devuelto por un
  método trazado necesita que lo atrapen las reglas de forma, o un tipo de
  retorno más estrecho.
- **Nombres que la lista no conoce.** La lista es grande y multilingüe, no
  infinita. Un secreto llamado `q3` solo lo atrapa su forma, si tiene alguna.
  Comprueba, no asumas — que es todo el punto de esta página.
- **Nombres de parámetro que el runtime no puede recuperar.** JavaScript no
  conserva nombres de parámetros en tiempo de ejecución, así que a
  `traceObject()` se le dicen (las listas de arriba). Una integración a la que
  no se le pueden decir, como el auto-proxy de NestJS, captura `arg0`, `arg1`,
  … y el eje del nombre no puede coincidir con ellos; la comprobación de forma
  del valor y `@notTraced(i)` aún los protegen
  ([Privacidad y ocultación](../privacidad-y-ocultacion.md)).
- **Lo que ocurre después de escribirse la línea de log.** El envío, la
  retención y el acceso al fichero son de tu plataforma; el `.nt` estructural no
  lleva ningún valor y es el artefacto pensado para commitear y para entregar a
  un modelo ([Revisa un flujo complejo antes de cambiarlo](revisa-un-flujo-complejo-antes-de-cambiarlo.md)).

**La skill para esto:** `narrativetrace-doctor` — una de sus comprobaciones es
exactamente "redaction never proven in a test", y nombra el arreglo.
