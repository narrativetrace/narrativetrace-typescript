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

  test("a bare key naming a secret always renders the marker", () => {
    // The other production of the grammar, and the one the path property above cannot reach: a
    // bare key naming a value directly (2026-09-04, family security fix). Every generated path
    // routes through the branch that was already correct, which is why a template printing
    // {password} in full survived a suite aimed at exactly this class of bug.
    fc.assert(
      fc.property(
        redactedKeyArb(),
        fc.constantFrom("", " ", "charging ", " for ", "$", "\n", "[", "]", "%s", "0"),
        (key, surrounding) => {
          const sentinel = freshSentinel();

          const resolved = resolveTemplate(`${surrounding}{${key}}${surrounding}`, {
            [key]: sentinel,
          });

          expect(resolved, `key ${key} leaked`).not.toContain(sentinel);
          expect(resolved, `key ${key} fell silent instead of redacting`).toContain(
            RedactionPolicy.MARKER,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("a credential-shaped scalar is refused whatever the key is called", () => {
    // The second axis on the same production: the bytes are a credential under any name at all.
    fc.assert(
      fc.property(fc.constantFrom("value", "data", "header", "payload", "item"), (key) => {
        const sentinel = freshSentinel();
        const jwt = `eyJhbGciOiJIUzI1NiJ9.${sentinel}.c2lnbmF0dXJl`;

        const resolved = resolveTemplate(`issued {${key}}`, { [key]: jwt });

        expect(resolved, `key ${key} leaked the token`).not.toContain(sentinel);
        expect(resolved, `key ${key} fell silent instead of redacting`).toContain(
          RedactionPolicy.MARKER,
        );
      }),
      { numRuns: 50 },
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

/**
 * Bare parameter names the deny-list knows, across its two matching modes: plain substring
 * (camelCase and accent-folded spellings included) and whole identifier token (`pan`, `senha`,
 * `dni`, …). Samples the multilingual vocabulary (`DEFAULT_PATTERNS` is multilingual and always
 * on — the family standard, mirrored from the Java runtime 2026-09-07) exactly as Java's
 * analogous arbitrary does: Spanish, Portuguese, French and Chinese names beside the English
 * ones, accented and folded spellings both.
 */
function redactedKeyArb(): fc.Arbitrary<string> {
  return fc.constantFrom(
    "password",
    "apiToken",
    "cardCvv",
    "secret",
    "sessionId",
    "privateKey",
    "routingNumber",
    "accountPan",
    // Spanish
    "contraseña",
    "contrasena",
    "tarjetaCredito",
    "claveAcceso",
    "dniTitular",
    // Portuguese
    "senha",
    "senhaUsuario",
    "cartão",
    "cpf_cliente",
    // French
    "motDePasse",
    "carteBancaire",
    "nirAssure",
    // Chinese, and the pinyin a non-CJK codebase writes
    "密码",
    "身份证",
    "shenfenzheng",
    "mimaHash",
  );
}

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
