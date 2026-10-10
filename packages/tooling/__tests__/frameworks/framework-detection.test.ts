// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  declaredPackages,
  installLine,
  isDetected,
  isReferenced,
  narrativeTraceVersionOf,
  VERSION_PLACEHOLDER,
  wiringFoundIn,
} from "../../src/frameworks/framework-detection.js";
import type { FrameworkRow, Wiring } from "../../src/frameworks/framework-row.js";
import { frameworkRowById } from "../../src/frameworks/framework-table.js";
import { pkg, withPackages } from "../fixture.js";

function row(id: string): FrameworkRow {
  const found = frameworkRowById(id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

const EXPRESS_WIRING = row("express").wiring;

describe("declaredPackages", () => {
  test("collects every dependency field of every manifest", () => {
    const declared = declaredPackages([
      pkg({ dependencies: { express: "5" } }),
      pkg({ devDependencies: { vitest: "3" }, peerDependencies: { react: "19" } }),
      pkg({ optionalDependencies: { pino: "9" } }),
    ]);
    expect([...declared].sort()).toEqual(["express", "pino", "react", "vitest"]);
  });

  test("is empty for no manifests, or manifests declaring nothing", () => {
    expect(declaredPackages([]).size).toBe(0);
    expect(declaredPackages([pkg()]).size).toBe(0);
  });
});

describe("isDetected", () => {
  test("detects a framework declared under its exact name", () => {
    expect(isDetected(row("express"), new Set(["express"]))).toBe(true);
  });

  test("never detects a package that only shares the prefix", () => {
    expect(isDetected(row("express"), new Set(["express-session", "expressjs"]))).toBe(false);
    expect(isDetected(row("react"), new Set(["react-dom", "react-router-dom"]))).toBe(false);
  });

  test("detects any one of a row's marker packages", () => {
    expect(isDetected(row("react-router"), new Set(["react-router-dom"]))).toBe(true);
  });

  test("a row whose presence is an absence is never detected from a manifest", () => {
    expect(isDetected(row("default-logger"), new Set(["pino", "express"]))).toBe(false);
  });

  test("stands down while a row it defers to is detected too", () => {
    const servletLike: FrameworkRow = {
      ...row("koa"),
      marker: { description: "koa", packages: ["koa"], deferTo: ["express"] },
    };
    expect(isDetected(servletLike, new Set(["koa"]))).toBe(true);
    expect(isDetected(servletLike, new Set(["koa", "express"]))).toBe(false);
  });

  test("refuses a deferral to a row the table does not have", () => {
    const typo: FrameworkRow = {
      ...row("koa"),
      marker: { description: "koa", packages: ["koa"], deferTo: ["expres"] },
    };
    expect(() => isDetected(typo, new Set(["koa"]))).toThrow(
      "row koa defers to expres, which is not a row",
    );
  });

  test("an undetected row never consults its deferrals", () => {
    const typo: FrameworkRow = {
      ...row("koa"),
      marker: { description: "koa", packages: ["koa"], deferTo: ["expres"] },
    };
    expect(isDetected(typo, new Set(["express"]))).toBe(false);
  });
});

describe("isReferenced", () => {
  test("means the row's integration package itself is declared", () => {
    const module = row("express").module;
    if (module === null) throw new Error("express ships a module");
    expect(isReferenced(module, new Set(["@narrativetrace/express"]))).toBe(true);
    expect(isReferenced(module, new Set(["@narrativetrace/core-node"]))).toBe(false);
  });
});

describe("wiringFoundIn", () => {
  test("finds the wiring when one file carries every pattern of an evidence item", () => {
    const source = `import { narrativeTrace } from "@narrativetrace/express";\napp.use(narrativeTrace(ctx));`;
    expect(wiringFoundIn(EXPRESS_WIRING, [source])).toBe(true);
  });

  test("never pieces one evidence item together from two files", () => {
    const sources = [
      `import { narrativeTrace } from "@narrativetrace/express";`,
      "app.use(narrativeTrace(ctx));",
    ];
    expect(wiringFoundIn(EXPRESS_WIRING, sources)).toBe(false);
  });

  test("a commented-out wiring line is not wiring", () => {
    const source = `import { narrativeTrace } from "@narrativetrace/express";\n// app.use(narrativeTrace(ctx));`;
    expect(wiringFoundIn(EXPRESS_WIRING, [source])).toBe(false);
  });

  test("the same call imported from a sibling integration is not this row's wiring", () => {
    const source = `import { narrativeTrace } from "@narrativetrace/hono";\napp.use(narrativeTrace(ctx));`;
    expect(wiringFoundIn(EXPRESS_WIRING, [source])).toBe(false);
  });

  test("any one evidence item suffices", () => {
    const reporterOnly = `import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";`;
    expect(wiringFoundIn(row("vitest").wiring, [reporterOnly])).toBe(true);
  });

  test("wiring with nothing to look for is never found", () => {
    const none: Wiring = { kind: "none", description: "nothing shipped" };
    expect(wiringFoundIn(none, ["anything at all"])).toBe(false);
  });
});

describe("installLine", () => {
  const express = row("express").module;
  const vitest = row("vitest").module;
  const logger = row("default-logger").module;
  if (!express || !vitest || !logger) throw new Error("rows ship modules");

  test.each([
    ["npm", "npm install @narrativetrace/express@1.2.3"],
    ["pnpm", "pnpm add @narrativetrace/express@1.2.3"],
    ["yarn", "yarn add @narrativetrace/express@1.2.3"],
    ["bun", "bun add @narrativetrace/express@1.2.3"],
  ] as const)("adds a runtime integration with %s", (manager, start) => {
    expect(installLine(manager, express, "1.2.3").startsWith(`${start} `)).toBe(true);
  });

  test.each([
    ["npm", "npm install --save-dev "],
    ["pnpm", "pnpm add -D "],
    ["yarn", "yarn add --dev "],
    ["bun", "bun add --dev "],
  ] as const)("adds a test-runner integration as a dev dependency with %s", (manager, start) => {
    expect(installLine(manager, vitest, "1.2.3").startsWith(start)).toBe(true);
  });

  test("pins every NarrativeTrace package to the version and leaves a third-party one bare", () => {
    expect(installLine("npm", logger, "1.2.3")).toBe(
      "npm install @narrativetrace/pino@1.2.3 @narrativetrace/core@1.2.3 @narrativetrace/observability@1.2.3 pino",
    );
  });
});

describe("narrativeTraceVersionOf", () => {
  test("reads core-node first, then core, then vitest", () => {
    const all = withPackages({
      "@narrativetrace/vitest": pkg({ version: "3.0.0" }),
      "@narrativetrace/core": pkg({ version: "2.0.0" }),
      "@narrativetrace/core-node": pkg({ version: "1.0.0" }),
    });
    expect(narrativeTraceVersionOf(all)).toBe("1.0.0");
    expect(
      narrativeTraceVersionOf(
        withPackages({ "@narrativetrace/vitest": pkg({ version: "3.0.0" }) }),
      ),
    ).toBe("3.0.0");
  });

  test("skips a resolved manifest with no version", () => {
    const installed = withPackages({
      "@narrativetrace/core-node": { name: "@narrativetrace/core-node" },
      "@narrativetrace/core": pkg({ version: "2.0.0" }),
    });
    expect(narrativeTraceVersionOf(installed)).toBe("2.0.0");
  });

  test("prints the placeholder when nothing resolves", () => {
    expect(narrativeTraceVersionOf(new Map())).toBe(VERSION_PLACEHOLDER);
  });
});
