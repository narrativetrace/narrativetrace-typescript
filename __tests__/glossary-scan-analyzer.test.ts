// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  buildScannedTrees,
  scanGlossarySource,
  sourcePathIndex,
} from "../tools/glossary-scan-analyzer.js";

/** The methods of the single class a source snippet declares. */
function methodsOf(source: string) {
  return scanGlossarySource(source, "packages/billing/overdraft-service.ts")[0]?.methods ?? [];
}

describe("scanGlossarySource", () => {
  test("scans a class into its methods and their parameter names", () => {
    const source = `
      export class OverdraftService {
        openAccount(customerId: string, limit: number) {}
      }
    `;

    expect(scanGlossarySource(source, "packages/billing/overdraft-service.ts")).toStrictEqual([
      {
        className: "OverdraftService",
        sourcePath: "packages/billing/overdraft-service.ts",
        methods: [{ name: "openAccount", parameters: ["customerId", "limit"] }],
      },
    ]);
  });

  test("reads the raw narration template off a decorated method", () => {
    const source = `
      class OverdraftService {
        @narrated("Charges {amount} to {account}")
        charge(amount: number) {}
      }
    `;

    expect(methodsOf(source)).toStrictEqual([
      {
        name: "charge",
        parameters: ["amount"],
        narration: "Charges {amount} to {account}",
      },
    ]);
  });

  test("reads the error-context template, with or without a declared error type", () => {
    const source = `
      class OverdraftService {
        @onError("Could not charge {amount}")
        charge(amount: number) {}
        @onError(InsufficientFundsError, "Not enough funds for {amount}")
        withdraw(amount: number) {}
      }
    `;

    expect(methodsOf(source).map((method) => method.errorContext)).toStrictEqual([
      "Could not charge {amount}",
      "Not enough funds for {amount}",
    ]);
  });

  test("reads both templates off one method", () => {
    const source = `
      class OverdraftService {
        @narrated("Charges {amount}")
        @onError("Could not charge {amount}")
        charge(amount: number) {}
      }
    `;

    expect(methodsOf(source)[0]).toMatchObject({
      narration: "Charges {amount}",
      errorContext: "Could not charge {amount}",
    });
  });

  test("keeps the first of several error templates on one method", () => {
    // `@onError` is repeatable, one declaration per error type. They share one template *slot* on
    // a signature, so the scan keeps the first — matching what a captured trace would carry.
    const source = `
      class OverdraftService {
        @onError(InsufficientFundsError, "Not enough funds")
        @onError(AccountClosedError, "Account is closed")
        charge(amount: number) {}
      }
    `;

    expect(methodsOf(source)[0]?.errorContext).toBe("Not enough funds");
  });

  test("ignores a decorator whose template is not a literal string", () => {
    // A computed template is not vocabulary the scan can read — the value only exists at run time,
    // and guessing at it would write a placeholder-free fragment into a committed file.
    const source = `
      class OverdraftService {
        @narrated(TEMPLATES.charge)
        charge(amount: number) {}
      }
    `;

    expect(methodsOf(source)[0]).toStrictEqual({ name: "charge", parameters: ["amount"] });
  });

  test("ignores a decorator that is not a narration decorator", () => {
    const source = `
      class OverdraftService {
        @Injectable("something")
        charge(amount: number) {}
      }
    `;

    expect(methodsOf(source)[0]).toStrictEqual({ name: "charge", parameters: ["amount"] });
  });
});

describe("scanGlossarySource, on what is not vocabulary", () => {
  test.each([
    ["a private method", "private secretly(id: string) {}"],
    ["a hash-private method", "#secretly(id: string) {}"],
    ["a protected method", "protected secretly(id: string) {}"],
  ])("skips %s", (_case, member) => {
    const source = `class OverdraftService { charge(amount: number) {} ${member} }`;

    expect(methodsOf(source).map((method) => method.name)).toStrictEqual(["charge"]);
  });

  test("skips the constructor, which names no domain action", () => {
    const source = `class OverdraftService { constructor(ledger: Ledger) {} charge(a: number) {} }`;

    expect(methodsOf(source).map((method) => method.name)).toStrictEqual(["charge"]);
  });

  test("contributes nothing for a class that declares no method at all", () => {
    const source = `class OverdraftLimits { readonly max = 10; }`;

    expect(scanGlossarySource(source, "packages/billing/limits.ts")).toStrictEqual([]);
  });

  test("contributes nothing for a file with no declarations", () => {
    expect(scanGlossarySource("export const MAX = 10;", "packages/billing/max.ts")).toStrictEqual(
      [],
    );
  });

  test("scans a nested class declared inside a function", () => {
    const source = `
      function build() {
        class Ledger { post(entry: string) {} }
        return Ledger;
      }
    `;

    expect(scanGlossarySource(source, "packages/billing/build.ts")[0]?.className).toBe("Ledger");
  });
});

describe("scanGlossarySource, on module-level functions", () => {
  test("groups a file's exported functions under a module stand-in for the class", () => {
    const source = `
      export function openAccount(customerId: string) {}
      export const closeAccount = (accountId: string) => {};
    `;

    expect(scanGlossarySource(source, "packages/billing/overdraft-service.ts")).toStrictEqual([
      {
        className: "<overdraft-service>",
        sourcePath: "packages/billing/overdraft-service.ts",
        methods: [
          { name: "openAccount", parameters: ["customerId"] },
          { name: "closeAccount", parameters: ["accountId"] },
        ],
      },
    ]);
  });

  test("names the module stand-in so no class term is harvested from it", () => {
    // The angle brackets are load-bearing: the harvester only harvests class vocabulary from a
    // name that is a valid identifier, so a file name can never become a domain term. A per-file
    // name is still needed, because that is what resolves the module's bounded context.
    const source = "export function openAccount(customerId: string) {}";

    expect(scanGlossarySource(source, "packages/billing/overdraft-service.ts")[0]?.className).toBe(
      "<overdraft-service>",
    );
  });

  test("keeps a file's classes and its module functions apart", () => {
    const source = `
      export class Ledger { post(entry: string) {} }
      export function auditLedger(ledgerId: string) {}
    `;

    expect(
      scanGlossarySource(source, "packages/billing/ledger.ts").map((c) => c.className),
    ).toStrictEqual(["Ledger", "<ledger>"]);
  });

  test("ignores a const that is not a function", () => {
    const source = "export const MAX_OVERDRAFT = 10;";

    expect(scanGlossarySource(source, "packages/billing/limits.ts")).toStrictEqual([]);
  });
});

describe("sourcePathIndex", () => {
  const scanned = (className: string, sourcePath: string) => ({
    className,
    sourcePath,
    methods: [{ name: "charge", parameters: [] }],
  });

  test("resolves a class name to the file that declared it", () => {
    const index = sourcePathIndex([scanned("Ledger", "packages/billing/ledger.ts")]);

    expect(index("Ledger")).toBe("packages/billing/ledger.ts");
  });

  test("resolves a name it never saw to unknown", () => {
    const index = sourcePathIndex([scanned("Ledger", "packages/billing/ledger.ts")]);

    expect(index("Invoice")).toBeUndefined();
  });

  test("resolves an ambiguous name to unknown rather than guessing a context", () => {
    // Java's ClassPackageIndex does the same for a simple name seen in two packages: an unassigned
    // term is honest, whereas guessing files a term under a context it may not belong to.
    const index = sourcePathIndex([
      scanned("Ledger", "packages/billing/ledger.ts"),
      scanned("Ledger", "packages/shipping/ledger.ts"),
    ]);

    expect(index("Ledger")).toBeUndefined();
  });

  test("keeps a name declared twice in the same file resolvable", () => {
    const index = sourcePathIndex([
      scanned("Ledger", "packages/billing/ledger.ts"),
      scanned("Ledger", "packages/billing/ledger.ts"),
    ]);

    expect(index("Ledger")).toBe("packages/billing/ledger.ts");
  });

  test("resolves nothing from an empty scan", () => {
    expect(sourcePathIndex([])("Ledger")).toBeUndefined();
  });
});

describe("buildScannedTrees", () => {
  test("builds one tree per scanned class, with a node per method", () => {
    const trees = buildScannedTrees([
      {
        className: "OverdraftService",
        sourcePath: "packages/billing/overdraft-service.ts",
        methods: [
          { name: "openAccount", parameters: ["customerId"] },
          { name: "charge", parameters: ["amount"], narration: "Charges {amount}" },
        ],
      },
    ]);

    expect(trees).toHaveLength(1);
    expect(trees[0]?.roots.map((root) => root.signature.methodName)).toStrictEqual([
      "openAccount",
      "charge",
    ]);
    expect(trees[0]?.roots[1]?.signature.narration).toBe("Charges {amount}");
  });

  test("carries parameter names with no captured value", () => {
    const trees = buildScannedTrees([
      {
        className: "OverdraftService",
        sourcePath: "packages/billing/overdraft-service.ts",
        methods: [{ name: "charge", parameters: ["amount"] }],
      },
    ]);

    // A scan observes names, never values — nothing was executed, so there is nothing to render.
    expect(trees[0]?.roots[0]?.signature.parameters).toStrictEqual([
      { name: "amount", renderedValue: "", redacted: false },
    ]);
  });

  test("builds no tree at all from an empty scan", () => {
    expect(buildScannedTrees([])).toStrictEqual([]);
  });
});
