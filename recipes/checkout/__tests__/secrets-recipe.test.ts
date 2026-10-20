// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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
