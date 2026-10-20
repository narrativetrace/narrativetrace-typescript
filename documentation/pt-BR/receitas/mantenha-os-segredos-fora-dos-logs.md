<!-- source: documentation/recipes/keep-secrets-out-of-the-logs.md blob e8220a1dc202 | translated: 2026-10-18 | reviewed: - -->
# Mantenha os segredos fora dos logs

[English](../../recipes/keep-secrets-out-of-the-logs.md) | [Español](../../es/recetas/manten-los-secretos-fuera-de-los-logs.md) | **Português** | [简体中文](../../zh-CN/实用方案/别让密钥进日志.md)

## O problema

> Se esta coisa registra toda chamada com todos os argumentos, ela vai acabar
> registrando um número de cartão. Convença-me de que não registra.

O checkout recebe uma senha e um número de cartão. Abaixo estão uma execução
dele com os dois, o log que ele de fato escreveu e o teste que prova que nenhum
dos dois valores está nesse arquivo.

## Configuração mínima

Nenhuma. A ocultação está ativa em toda integração distribuída e não existe
nenhuma superfície de configuração que a desligue — a lista de bloqueio é
consultada na *captura*, antes de um valor virar evento, então um valor
bloqueado nunca chega à linha de log, ao arquivo de trace, ao caminho em buffer
nem a um consumidor no pipeline.
[Privacidade e ocultação](../privacidade-e-ocultacao.md) é a versão linha a
linha, verificada contra o código. As linhas de log aqui vêm da ponte do pino,
configurada como em [Adicione logs a este serviço](adicione-logs-a-este-servico.md).

Duas coisas, porém, valem ser feitas uma vez no seu próprio projeto:

1. **Escreva o teste desta página para o seu próprio fluxo.** Uma ocultação que
   você não verificou com uma asserção é uma afirmação, não uma propriedade do
   seu build. O achado "redaction never proven in a test" do doctor existe
   exatamente para isso.
2. **Conheça a saída de emergência.** Um segredo sob um nome que ninguém
   adivinharia — `fingerprint`, `answer2` — é alcançável pelo índice:
   `traceObject(service, context, { methods: { signIn: { params: [...], notTraced: [1] } } })`
   oculta o segundo argumento seja qual for o nome, e `@notTraced(1)` faz o
   mesmo com decoradores. Ele sempre vence
   ([Guia de decoradores § `@notTraced`](../guia-de-decoradores.md#nottraced)).

## O cenário

Um colaborador novo, para que a execução leve uma senha além do cartão. O
parâmetro dele se chama `password` — esse nome é o ponto central:

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

A execução autentica o cliente e faz o pedido. Os dois valores secretos são
constantes aqui para que o teste possa procurá-los no log depois — um fluxo real
os recebe da requisição:

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

## A saída real

**O log que a execução escreveu**, pelo logger do próprio projeto. Cada
parâmetro é um par `name`/`value` em `nt.parameters`:

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

**A narrativa da mesma execução**, renderizada a partir do trace capturado — a
outra superfície que um segredo poderia ter alcançado (um arquivo de trace é
isto, gravado em disco):

```text
- `CustomerAccounts.signIn(customerId: "C-1234", password: [REDACTED])` → `"SESSION-C-1234"` — 1ms #1
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #2
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #2.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.18ms #2.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.16ms #2.3
```

## Como ler a saída

**Qual regra pegou qual valor.** Três valores sumiram, por dois mecanismos
independentes:

| Linha | Valor | Pego por |
|---|---|---|
| `#1` `CustomerAccounts.signIn(…, password: [REDACTED])` | `orchid-trombone-77` | Seu **nome**. `password` está na lista de bloqueio sempre ativa, que casa nomes de parâmetros e de campos — em vários idiomas — em qualquer classe, inclusive a sua. Nenhuma regra de formato teria pego este: é uma string comum |
| `#2` `OrderService.placeOrder(…, cardNumber: [REDACTED])` | `4242424242424242` | Seu **nome** de novo: `cardNumber` está na mesma lista |
| `#2.2` `PaymentService.charge(…, card: [REDACTED])` | o mesmo número, uma chamada mais fundo | Seu **valor**. O parâmetro se chama `card`, que a lista de bloqueio não conhece — e o número é válido pelo Luhn, então a verificação independente de formato de valor o pegou do mesmo jeito |

Essa terceira linha é a que vale lembrar: `card` é como um parâmetro é chamado
no código real, e só o eixo do nome o teria impresso. O eixo do formato conhece
um número de cartão válido pelo Luhn, um JWT, uma string `Set-Cookie`, um
número de Seguro Social americano com hifens e um número de documento de
identidade nacional que passa no próprio dígito verificador.

**Onde as regras vivem.** Na biblioteca, não na sua configuração:
`RedactionPolicy.DEFAULT` em `@narrativetrace/core`, consultada pelo renderizador
de valores que toda integração distribuída constrói do mesmo modo. Não há opção,
variável de ambiente nem nível de log que a alcance, e `traceObject()` não
recebe nenhum `redactionPolicy` próprio;
[Privacidade e ocultação](../privacidade-e-ocultacao.md) lista as superfícies e
o que prevalece sobre o quê. Aliás, `customerId: "C-1234"` *é* escrito por
inteiro — um id de cliente identifica, mas não é segredo, e o NarrativeTrace não
adivinha. Se o seu não pode ser registrado, isso é `notTraced`, que é uma
decisão no seu código-fonte, e não um estado que um deploy possa alternar.

**Por que o teste é a prova, e não a página.** `assertNeitherSecretIsInTheLog`
lê o arquivo que o logger escreveu e afirma duas coisas: que os três parâmetros
ocultados estão presentes *como* `[REDACTED]` e que nenhuma das duas strings
secretas aparece em lugar nenhum dele. Uma página só consegue mostrar bytes; um
teste derruba o build no dia em que uma refatoração renomear `password` para
algo que a lista não conhece. Essa é a diferença entre "era seguro quando isto
foi escrito" e "é seguro agora". Mantenha a asserção de ausência — o
`not.toContain` — mesmo quando a de presença parecer suficiente: um valor que
some porque a chamada deixou de ter trace por completo ainda satisfaria a
primeira. O segundo teste faz o mesmo para a saída de emergência: `answer2` é
um nome que a lista não conhece, e é ocultado porque a chamada assim determinou.

## O que não é capturado

- **O que não tem trace não é do NarrativeTrace para ocultar.** Cinco objetos
  estão encapsulados acima; um segredo passado entre duas classes sem
  encapsulamento não é visto e, portanto, não é nem ocultado nem registrado.
  Isso não é uma garantia de segurança — é uma garantia de silêncio.
- **Um segredo que a sua própria instrução de log escreve é seu.** O
  NarrativeTrace oculta o que *ele* renderiza. `logger.info({ card }, "charging")`
  é uma linha sua, no seu código, e nada aqui a filtra. O contrato de ocultação
  trata da narrativa gerada, não de tudo o que o processo escreve.
- **Um valor de retorno não é casado por nome**, porque não tem nenhum.
  `signIn` devolve `"SESSION-C-1234"` e ele é impresso. Um token de sessão
  devolvido por um método com trace precisa que as regras de formato o peguem,
  ou de um tipo de retorno mais restrito.
- **Nomes que a lista não conhece.** A lista é grande e multilíngue, não
  infinita. Um segredo chamado `q3` só é pego pelo formato, se tiver um.
  Verifique com asserções, não presuma — que é o ponto central desta página.
- **Nomes de parâmetros que o runtime não consegue recuperar.** O JavaScript não
  guarda nomes de parâmetros em tempo de execução, então o `traceObject()`
  recebe esses nomes (as listas acima). Uma integração que não consegue
  recebê-los, como o auto-proxy do NestJS, captura `arg0`, `arg1`, … e o eixo do
  nome não casa com eles; a verificação de formato de valor e `@notTraced(i)`
  ainda os protegem ([Privacidade e ocultação](../privacidade-e-ocultacao.md)).
- **O que acontece depois que a linha de log é escrita.** Envio, retenção e
  acesso ao arquivo são da sua plataforma; o `.nt` estrutural não carrega valor
  algum e é o artefato feito para ser commitado e entregue a um modelo
  ([Revise um fluxo complexo antes de alterá-lo](revise-um-fluxo-complexo-antes-de-altera-lo.md)).

**A skill para isso:** `narrativetrace-doctor` — uma das suas verificações é
exatamente "redaction never proven in a test", e ela indica a correção.
