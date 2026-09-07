// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { resolveContext, UNASSIGNED_CONTEXT } from "../src/context-resolver.js";
import { glossary } from "../src/glossary.js";

const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
const prefix = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join("/"));

function modelOwning(declared: string) {
  return glossary(1, new Map([["billing", boundedContext("billing", [declared])]]), []);
}

test("a declared prefix owns every child path below it", () => {
  fc.assert(
    fc.property(prefix, fc.array(segment, { minLength: 1, maxLength: 3 }), (declared, rest) => {
      const model = modelOwning(declared);

      expect(resolveContext(model, `${declared}/${rest.join("/")}`)).toBe("billing");
      expect(resolveContext(model, `${declared}.${rest.join(".")}`)).toBe("billing");
      expect(resolveContext(model, declared)).toBe("billing");
    }),
    { numRuns: 300 },
  );
});

test("a declared prefix never claims a sibling that only starts with its text", () => {
  fc.assert(
    fc.property(
      prefix,
      fc.stringMatching(/^[a-z0-9-]{1,6}$/),
      fc.array(segment, { maxLength: 2 }),
      (declared, extra, rest) => {
        const sibling = [`${declared}${extra}`, ...rest].join("/");

        expect(resolveContext(modelOwning(declared), sibling)).toBe(UNASSIGNED_CONTEXT);
      },
    ),
    { numRuns: 300 },
  );
});

test("the longest matching prefix wins whichever order the contexts are declared in", () => {
  fc.assert(
    fc.property(
      prefix,
      segment,
      fc.array(segment, { minLength: 1, maxLength: 2 }),
      (outer, inner, rest) => {
        const nested = `${outer}/${inner}`;
        const contexts = new Map([
          ["broad", boundedContext("broad", [outer])],
          ["narrow", boundedContext("narrow", [nested])],
        ]);
        const model = glossary(1, contexts, []);
        const reversed = glossary(1, new Map([...contexts].reverse()), []);
        const path = `${nested}/${rest.join("/")}`;

        expect(resolveContext(model, path)).toBe("narrow");
        expect(resolveContext(reversed, path)).toBe("narrow");
      },
    ),
    { numRuns: 300 },
  );
});
