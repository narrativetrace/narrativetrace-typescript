// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  renderIndentedText,
  renderMarkdown,
  SyncNarrativeContext,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { traceObject } from "../src/trace-object.js";

// Parity check C4 (2026-10-11): a Luhn-valid 13–19 digit value in a traced parameter is redacted
// BY VALUE, whatever the parameter is called. The checkout domain: reserve inventory, charge
// payment, save order — the card number arrives under a name that is not a secret word.
class CheckoutService {
  reserve(_sku: string, _quantity: number): boolean {
    return true;
  }
  charge(_reference: string, _amount: number): string {
    return "charged";
  }
}

function tracedCheckout() {
  const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const checkout = traceObject(new CheckoutService(), context, {
    reserve: ["sku", "quantity"],
    charge: ["reference", "amount"],
  });
  return { context, checkout };
}

describe("a card number is redacted by value under any parameter name", () => {
  const LUHN_VALID = {
    "13 digits": "4222222222222",
    "16 digits": "4111111111111111",
    "19 digits": "6304000000000000000",
    "16 digits, dash-separated": "4111-1111-1111-1111",
  };

  for (const [label, pan] of Object.entries(LUHN_VALID)) {
    test(`${label} passed as 'reference' is flagged redacted and never rendered`, () => {
      const { context, checkout } = tracedCheckout();

      checkout.charge(pan, 20);

      const tree = context.captureTrace();
      const reference = tree.roots[0]?.signature.parameters.find((p) => p.name === "reference");
      expect(reference?.redacted).toBe(true);
      expect(reference?.renderedValue).toBe("[REDACTED]");
      for (const output of [renderMarkdown(tree), renderIndentedText(tree)]) {
        expect(output).not.toContain(pan);
        expect(output).toContain("[REDACTED]");
      }
    });
  }

  test("a Luhn-invalid 16-digit order reference stays visible", () => {
    const { context, checkout } = tracedCheckout();

    checkout.charge("4111111111111112", 20);

    const tree = context.captureTrace();
    const reference = tree.roots[0]?.signature.parameters.find((p) => p.name === "reference");
    expect(reference?.redacted).toBe(false);
    expect(reference?.renderedValue).toContain("4111111111111112");
  });

  test("a 12-digit and a 20-digit Luhn-valid run are outside the card-number length and stay visible", () => {
    const { context, checkout } = tracedCheckout();

    checkout.charge("424242424242", 20);
    checkout.charge("42424242424242424242", 20);

    const output = renderIndentedText(context.captureTrace());
    expect(output).toContain("424242424242");
    expect(output).toContain("42424242424242424242");
  });

  test("a card number in one call leaves the other calls' parameters visible", () => {
    const { context, checkout } = tracedCheckout();

    checkout.reserve("P-1", 2);
    checkout.charge("4111111111111111", 20);

    const output = renderMarkdown(context.captureTrace());
    expect(output).toContain("P-1");
    expect(output).not.toContain("4111111111111111");
  });
});
