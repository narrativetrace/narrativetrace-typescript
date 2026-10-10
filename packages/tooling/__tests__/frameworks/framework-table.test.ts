// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  type FrameworkRow,
  frameworkRow,
  NO_TIER_B_CASE,
} from "../../src/frameworks/framework-row.js";
import {
  FRAMEWORK_ROWS,
  frameworkCheckIds,
  frameworkRowById,
  importOf,
} from "../../src/frameworks/framework-table.js";
import { carriedFixtures, wiringSnippet } from "../../src/frameworks/wiring-snippets.js";

/** The rows this port starts with (Phase 6 milestone 4 brief), row id → check id: a contract. */
const CONTRACT: Readonly<Record<string, string>> = {
  vitest: "config.vitest-fixture",
  express: "config.express-middleware",
  hono: "config.hono-middleware",
  nestjs: "config.nestjs-module",
  angular: "config.angular-provider",
  react: "config.react-provider",
  "react-router": "config.react-router-capture",
  pino: "config.pino-consumer",
  winston: "config.winston-consumer",
  opentelemetry: "config.opentelemetry-consumer",
  "default-logger": "trap.silent-sink",
  fastify: "config.fastify-integration",
  koa: "config.koa-integration",
};

const SPECIFIER = /\bfrom\s+["']([^"']+)["']/g;

function importedPackages(source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .map((match) => match[1] as string)
    .filter((specifier) => !specifier.startsWith("."));
}

function validRow(overrides: Partial<FrameworkRow> = {}): FrameworkRow {
  return { ...(FRAMEWORK_ROWS[1] as FrameworkRow), ...overrides };
}

describe("the framework table", () => {
  test("carries exactly the contracted rows, in order, each bound to its check", () => {
    expect(Object.fromEntries(FRAMEWORK_ROWS.map((row) => [row.id, row.check.id]))).toEqual(
      CONTRACT,
    );
    expect(FRAMEWORK_ROWS.map((row) => row.id)).toEqual(Object.keys(CONTRACT));
  });

  test("every check it adds is named config.<row id>-<thing>", () => {
    for (const row of FRAMEWORK_ROWS.filter((r) => r.check.kind !== "existing-check")) {
      expect(row.check.id.startsWith(`config.${row.id}-`), row.id).toBe(true);
    }
  });

  test("lists the checks it adds in table order, leaving out the row bound to an existing one", () => {
    expect(frameworkCheckIds()).toEqual(
      Object.values(CONTRACT).filter((id) => id !== "trap.silent-sink"),
    );
  });

  test("finds a row by id, and nothing for an id it lacks", () => {
    expect(frameworkRowById("express")?.name).toBe("Express");
    expect(frameworkRowById("expres")).toBeUndefined();
  });

  test("ships a module for exactly the rows that are not no-integration rows", () => {
    for (const row of FRAMEWORK_ROWS) {
      expect(row.module === null, row.id).toBe(row.check.kind === "no-integration");
    }
  });

  test("carries every snippet fixture it names", () => {
    const fixtures = FRAMEWORK_ROWS.flatMap((row) =>
      row.wiring.kind === "snippet" ? [row.wiring.fixture] : [],
    );
    expect([...new Set(fixtures)]).toEqual(carriedFixtures());
  });

  test("installs every package a row's snippet imports, beyond the framework itself", () => {
    for (const row of FRAMEWORK_ROWS) {
      if (row.wiring.kind !== "snippet" || row.module === null) continue;
      const covered = new Set([...row.module.packages, ...row.marker.packages]);
      const imports = importedPackages(wiringSnippet(row.wiring.fixture));
      const uncovered = imports.filter((name) => !covered.has(name));
      expect(uncovered, row.id).toEqual([]);
    }
  });

  test("the default logger ships pino and quotes the pino row's own wiring", () => {
    const fallback = frameworkRowById("default-logger");
    expect(fallback?.module?.packages).toEqual([
      "@narrativetrace/pino",
      "@narrativetrace/core",
      "@narrativetrace/observability",
      "pino",
    ]);
    expect(fallback?.wiring).toBe(frameworkRowById("pino")?.wiring);
  });

  test("names no Tier B case it does not mean: none, or an init-prompt case", () => {
    for (const row of FRAMEWORK_ROWS) {
      expect(row.tierBCase === NO_TIER_B_CASE || row.tierBCase.startsWith("init-prompt-")).toBe(
        true,
      );
    }
  });
});

describe("frameworkRow", () => {
  test("returns a valid row unchanged", () => {
    const row = validRow();
    expect(frameworkRow(row)).toBe(row);
  });

  test.each([
    ["a non-kebab id", { id: "Express" }, 'a row id is kebab-case, got "Express"'],
    ["a blank name", { name: " " }, "row express names no framework"],
    [
      "a blank marker",
      { marker: { description: "", packages: [], deferTo: [] } },
      "row express has no marker",
    ],
    ["a blank Tier B case", { tierBCase: "" }, "row express names no Tier B case or none"],
    [
      "a check id outside config.<framework>-<thing>",
      { check: { kind: "wiring-check", id: "config.express" } },
      "row express: a framework check id is config.<framework>-<thing>",
    ],
    [
      "a wiring check over wiring no source shows",
      { wiring: { kind: "none", description: "nothing" } },
      "row express earns a wiring check only for wiring visible in source",
    ],
    [
      "a no-integration row that ships a module",
      { check: { kind: "no-integration", id: "config.express-integration" } },
      "row express: exactly the no-integration rows ship no module",
    ],
    [
      "a shipped row with no module",
      { module: null },
      "row express: exactly the no-integration rows ship no module",
    ],
    [
      "an evidence item with nothing to look for",
      {
        wiring: {
          kind: "snippet",
          description: "d",
          fixture: "f",
          language: "ts",
          evidence: [{ allOf: [] }],
        },
      },
      "row express has an evidence item with nothing to look for",
    ],
    [
      "a module that adds nothing",
      { module: { packages: [], dev: false } },
      "row express adds no package",
    ],
  ] as const)("refuses %s", (_name, overrides, message) => {
    expect(() => frameworkRow(validRow(overrides as Partial<FrameworkRow>))).toThrow(message);
  });

  test.each([["a"], ["ab-cd"], ["a1-b2-c3"]])("accepts the kebab-case id %s", (id) => {
    expect(frameworkRow(validRow({ id })).id).toBe(id);
  });

  test.each([
    ["a-"],
    ["-a"],
    ["a--b"],
    ["a_b"],
    ["a b"],
    ["a-B"],
  ])("refuses the near-kebab id %s", (id) => {
    expect(() => frameworkRow(validRow({ id }))).toThrow(`a row id is kebab-case, got "${id}"`);
  });

  test.each([
    ["xconfig.express-x"],
    ["config.express-x-"],
    ["config.express_x-y"],
    ["config.-x"],
  ])("refuses the near-miss check id %s", (id) => {
    expect(() => frameworkRow(validRow({ check: { kind: "wiring-check", id } }))).toThrow(
      "a framework check id is config.<framework>-<thing>",
    );
  });

  test("accepts a check id with several kebab segments", () => {
    const check = { kind: "wiring-check", id: "config.react-router-capture" } as const;
    expect(frameworkRow(validRow({ check })).check.id).toBe("config.react-router-capture");
  });

  test("lets an existing check keep its own id shape", () => {
    const row = validRow({ check: { kind: "existing-check", id: "trap.silent-sink" } });
    expect(frameworkRow(row)).toBe(row);
  });
});

describe("importOf", () => {
  test("matches the package as a quoted specifier, either quote", () => {
    expect(importOf("@narrativetrace/react").test(`from "@narrativetrace/react";`)).toBe(true);
    expect(importOf("@narrativetrace/react").test(`require('@narrativetrace/react')`)).toBe(true);
  });

  test("never matches a sibling that shares the prefix", () => {
    expect(importOf("@narrativetrace/react").test(`from "@narrativetrace/react-router";`)).toBe(
      false,
    );
    expect(importOf("@narrativetrace/vitest").test(`from "@narrativetrace/vitest/reporters"`)).toBe(
      false,
    );
  });

  test("reads a dot in a name literally", () => {
    expect(importOf("a.b").test(`"axb"`)).toBe(false);
  });
});
