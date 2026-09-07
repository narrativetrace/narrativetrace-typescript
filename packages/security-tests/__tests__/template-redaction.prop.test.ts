// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { RedactionPolicy, resolveTemplate } from "@narrativetrace/core";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { hostileTemplates } from "../src/corpus/hostile-corpus.js";
import { templateValues } from "../src/corpus/hostile-graphs.js";
import { expectsRedaction, type TemplateCase } from "../src/corpus/types.js";
import { everyOutput, treeNarrating } from "../src/oracle/emitters.js";
import {
  containsNoSentinel,
  freshSentinel,
  idempotent,
  withinBudget,
} from "../src/oracle/oracles.js";

/**
 * Target 4: template parsing and rendering. Mirrors Java's `TemplateRedactionPropertyTest`.
 *
 * @llmNote This runtime's `resolveTemplate` resolves the whole object (`{obj}`) or a single property
 * level (`{obj.prop}` — the dot after the object name is the *only* dot it ever walks; see
 * `template-parser.ts`'s own doc comment). Java's `RedactedPaths` walks arbitrarily deep paths.
 * A corpus template case whose redacted segment sits two or more levels down (`redacted-mid-path`,
 * `redacted-deep-path`, and the generated multi-level paths below) therefore cannot resolve to
 * anything at all here — the placeholder stays literal, which is safe (nothing beyond the first
 * property is ever read, so nothing beyond it can leak) but does not exercise the marker the way a
 * whole-object or single-level path does. {@link resolvesDirectly} names the boundary so each
 * assertion applies the right oracle rather than silently skipping the deeper cases.
 */

function resolvesDirectly(path: string): boolean {
  return path.split(".").length <= 2;
}

function pathOf(templateCase: TemplateCase): string | undefined {
  const match = /\{([^}]+)\}/.exec(templateCase.template);
  return match?.[1];
}

function assertResolves(templateCase: TemplateCase): void {
  const sentinel = freshSentinel();
  const values = templateValues(templateCase.values, sentinel);

  const resolved = withinBudget(`template ${templateCase.id}`, () =>
    resolveTemplate(templateCase.template, values),
  );

  expect(resolved, templateCase.id).not.toContain(sentinel);
  if (expectsRedaction(templateCase)) {
    const path = pathOf(templateCase);
    if (path !== undefined && resolvesDirectly(path)) {
      expect(resolved, `${templateCase.id} must show the marker`).toContain(RedactionPolicy.MARKER);
    }
  }
}

describe("template redaction", () => {
  test("every corpus template resolves without leaking or throwing", () => {
    for (const templateCase of hostileTemplates()) {
      expect(() => assertResolves(templateCase), templateCase.id).not.toThrow();
    }
  });

  test("every corpus template resolves identically twice", () => {
    for (const templateCase of hostileTemplates()) {
      const values = templateValues(templateCase.values, freshSentinel());
      idempotent(`template ${templateCase.id}`, () =>
        resolveTemplate(templateCase.template, values),
      );
    }
  });

  test("a redacted path reaches no written artifact", () => {
    for (const templateCase of hostileTemplates()) {
      if (!expectsRedaction(templateCase)) continue;
      const sentinel = freshSentinel();
      const values = templateValues(templateCase.values, sentinel);
      const narration = resolveTemplate(templateCase.template, values);

      containsNoSentinel(everyOutput(treeNarrating(narration, narration)), sentinel);
    }
  });

  test("a whole-object placeholder naming a redacted member always renders the marker", () => {
    const whole = hostileTemplates().find((c) => c.id === "whole-object-placeholder");
    expect(whole, "corpus must carry the whole-object-placeholder case").toBeDefined();

    const sentinel = freshSentinel();
    const resolved = resolveTemplate(
      (whole as TemplateCase).template,
      templateValues("card", sentinel),
    );

    expect(resolved).not.toContain(sentinel);
    expect(resolved).toContain(RedactionPolicy.MARKER);
    // The safe part of the object is still visible — this is redaction, not silence.
    expect(resolved).toContain("4111");
  });

  test("a single-level path naming a redacted member always renders the marker", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("card.cvv", "user.password", "user.secret"),
        fc.constantFrom("", " ", "charging ", " for ", "$", "\n", "[", "]", "%s", "0"),
        (path, surrounding) => {
          const sentinel = freshSentinel();
          const fixture = path.startsWith("user") ? "user" : "card";
          const values = templateValues(fixture, sentinel);

          const resolved = resolveTemplate(`${surrounding}{${path}}${surrounding}`, values);

          expect(resolved, `path ${path} leaked`).not.toContain(sentinel);
          expect(resolved, `path ${path} fell silent instead of redacting`).toContain(
            RedactionPolicy.MARKER,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("resolving never throws whatever the template contains", () => {
    fc.assert(
      fc.property(braceSoupArb(), (template) => {
        const values = templateValues("card", freshSentinel());
        expect(() => resolveTemplate(template, values)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  test("no generated template leaks the redacted component", () => {
    fc.assert(
      fc.property(braceSoupArb(), (template) => {
        const sentinel = freshSentinel();
        const values = templateValues("card", sentinel);
        expect(resolveTemplate(template, values)).not.toContain(sentinel);
      }),
      { numRuns: 100 },
    );
  });

  test("a multi-level redacted path never leaks, even though it cannot resolve here", () => {
    for (const path of ["order.card.cvv", "a.b.c.d.secret"]) {
      const sentinel = freshSentinel();
      const fixture = path.startsWith("order") ? "order" : "deep";
      const values = templateValues(fixture, sentinel);

      const resolved = resolveTemplate(`{${path}}`, values);

      expect(resolved, path).not.toContain(sentinel);
    }
  });
});

/** Braces, dots and identifier fragments, recombined — the part nobody listed. */
function braceSoupArb(): fc.Arbitrary<string> {
  const alphabet = fc.constantFrom(
    "{",
    "}",
    ".",
    "card",
    "cvv",
    "number",
    "user",
    "password",
    "secret",
    "a",
    " ",
    "$",
    "\n",
    "[",
    "]",
    "0",
    String.fromCodePoint(0x200b),
    String.fromCodePoint(0x202e),
  );
  return fc.array(alphabet, { maxLength: 30 }).map((parts) => parts.join(""));
}
