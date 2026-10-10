// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { frameworkCheck } from "../src/doctor/checks/framework-wiring.js";
import { checkSilentSink } from "../src/doctor/checks/silent-sink.js";
import { buildSnapshot } from "../src/doctor/environment.js";
import { packageManagerOf } from "../src/doctor/package-manager.js";
import type { PackageJsonLike } from "../src/doctor/types.js";
import {
  declaredPackages,
  installLine,
  isDetected,
  isReferenced,
  narrativeTraceVersionOf,
  VERSION_PLACEHOLDER,
  wiringFoundIn,
} from "../src/frameworks/framework-detection.js";
import {
  type FrameworkRow,
  frameworkRow,
  type IntegrationModule,
  type Wiring,
} from "../src/frameworks/framework-row.js";
import { FRAMEWORK_ROWS, frameworkRowById } from "../src/frameworks/framework-table.js";
import { llmsTxtCoveredFrameworks, spliceBlock } from "../src/frameworks/framework-table-docs.js";
import { withoutComments } from "../src/frameworks/source-text.js";
import { pkg, snapshot, withFiles, withPackages } from "./fixture.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

function rowOf(id: string): FrameworkRow {
  const found = frameworkRowById(id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

function declaring(...names: string[]): ReadonlySet<string> {
  return new Set(names);
}

function customRow(packages: string[], deferTo: string[] = []): FrameworkRow {
  return {
    ...rowOf("express"),
    id: "custom",
    marker: { description: "custom", packages, deferTo },
  };
}

const EXPRESS_MODULE: IntegrationModule = rowOf("express").module as IntegrationModule;

describe("withoutComments (adversarial)", () => {
  test("a regex literal holding a quote does not hide a later commented-out wiring line", () => {
    const source = "const re = /'/;\n// narrativeTrace(app)\nconst b = 'x';";
    expect(withoutComments(source)).not.toContain("narrativeTrace(");
  });

  test("a JSX text apostrophe does not hide a later commented-out provider", () => {
    const source =
      "export const App = () => <p>Don't panic</p>;\n// <NarrativeTraceProvider>\nexport default App;";
    expect(withoutComments(source)).not.toContain("<NarrativeTraceProvider");
  });

  test("an escaped backslash before the closing quote still ends the literal", () => {
    const source = "const s = 'a\\\\'; // narrativeTrace(app)";
    expect(withoutComments(source)).toBe("const s = 'a\\\\'; ");
  });

  test("a nested template literal inside a placeholder keeps the following comment stripped", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the input IS a template literal's source.
    const code = "const a = `x ${`y`} z`; ";
    expect(withoutComments(`${code}// narrativeTrace(app)`)).toBe(code);
  });

  test("a comment marker inside a string literal is kept as code", () => {
    const source = 'const u = "http://x"; app.use(narrativeTrace(c));';
    expect(withoutComments(source)).toBe(source);
  });

  test("a block-comment opener inside a string literal does not start a comment", () => {
    const source = 'const s = "/*"; app.use(narrativeTrace(c));';
    expect(withoutComments(source)).toBe(source);
  });

  test("a CRLF file keeps its newline count when a line comment is dropped", () => {
    const source = "a();\r\n// b();\r\nc();";
    const out = withoutComments(source);
    expect(out.split("\n").length).toBe(source.split("\n").length);
    expect(out).not.toContain("b();");
  });

  test("a CRLF block comment keeps every line break it spanned", () => {
    const source = "a(); /* b();\r\n c(); */ d();";
    expect((withoutComments(source).match(/\n/g) ?? []).length).toBe(1);
  });
});

describe("declaredPackages and detection (adversarial)", () => {
  test("a dependencies field that is null declares nothing and does not throw", () => {
    const manifest = pkg({ dependencies: null as unknown as Record<string, string> });
    expect(declaredPackages([manifest]).size).toBe(0);
  });

  test("a dependencies field that is an array or string never declares the marker name", () => {
    const asArray = pkg({ dependencies: ["express"] as unknown as Record<string, string> });
    const asString = pkg({ dependencies: "express" as unknown as Record<string, string> });
    expect(declaredPackages([asArray]).has("express")).toBe(false);
    expect(declaredPackages([asString]).has("express")).toBe(false);
  });

  test("a marker package declared only in peerDependencies counts as declared", () => {
    const manifest = pkg({ peerDependencies: { express: "^4" } });
    expect(declaredPackages([manifest]).has("express")).toBe(true);
  });

  test("a marker package declared only in optionalDependencies counts as declared", () => {
    const manifest = pkg({ optionalDependencies: { express: "^4" } });
    expect(declaredPackages([manifest]).has("express")).toBe(true);
  });

  test("a row that defers to a detected row stands down", () => {
    const row = customRow(["foo"], ["express"]);
    expect(isDetected(row, declaring("foo", "express"))).toBe(false);
  });

  test("a row that defers to a declared-but-undetected row still applies", () => {
    const row = customRow(["foo"], ["express"]);
    expect(isDetected(row, declaring("foo"))).toBe(true);
  });

  test("a near-miss package name that only shares a marker's prefix does not detect the row", () => {
    expect(isDetected(rowOf("express"), declaring("express-session"))).toBe(false);
  });

  test("an integration is referenced only through its first package", () => {
    expect(isReferenced(EXPRESS_MODULE, declaring("@narrativetrace/core"))).toBe(false);
  });

  test("narrativeTraceVersionOf skips a core package whose version is empty", () => {
    const installed = new Map<string, PackageJsonLike>([
      ["@narrativetrace/core-node", pkg({ version: "" })],
      ["@narrativetrace/core", pkg({ version: "0.9.1" })],
    ]);
    expect(narrativeTraceVersionOf(installed)).toBe("0.9.1");
  });

  test("narrativeTraceVersionOf returns the placeholder when no core package resolves", () => {
    expect(narrativeTraceVersionOf(new Map())).toBe(VERSION_PLACEHOLDER);
  });
});

describe("wiringFoundIn and evidence (adversarial)", () => {
  const express = rowOf("express").wiring as Extract<Wiring, { kind: "snippet" }>;

  test("evidence split across two source files is not wiring", () => {
    const sources = [
      'import { narrativeTrace } from "@narrativetrace/express";',
      "app.use(narrativeTrace(options));",
    ];
    expect(wiringFoundIn(express, sources)).toBe(false);
  });

  test("evidence present only inside a comment is not wiring", () => {
    const sources = [
      '// import { x } from "@narrativetrace/express";\n// app.use(narrativeTrace(o));',
    ];
    expect(wiringFoundIn(express, sources)).toBe(false);
  });

  test("a call to a longer identifier is not the express wiring", () => {
    const sources = [
      'import { x } from "@narrativetrace/express";\napp.use(narrativeTraceOptions(o));',
    ];
    expect(wiringFoundIn(express, sources)).toBe(false);
  });

  test("an import of a longer package name is not the express wiring", () => {
    const sources = [
      'import { x } from "@narrativetrace/express-extra";\napp.use(narrativeTrace(o));',
    ];
    expect(wiringFoundIn(express, sources)).toBe(false);
  });

  test("an evidence item with no patterns never counts as wiring", () => {
    const hollow: Wiring = {
      kind: "snippet",
      description: "hollow",
      fixture: "x",
      language: "ts",
      evidence: [{ allOf: [] }],
    };
    expect(wiringFoundIn(hollow as Extract<Wiring, { kind: "snippet" }>, ["unrelated();"])).toBe(
      false,
    );
  });
});

describe("installLine and version placeholder (adversarial)", () => {
  test("a dev integration uses the dev flag of the chosen package manager", () => {
    const module: IntegrationModule = { packages: ["@narrativetrace/vitest"], dev: true };
    expect(installLine("yarn", module, "1.2.3")).toBe(
      "yarn add --dev @narrativetrace/vitest@1.2.3",
    );
  });

  test("a third-party package is printed bare and a scope sharing only the prefix is not pinned", () => {
    const module: IntegrationModule = {
      packages: ["@narrativetrace-tools/x", "pino"],
      dev: false,
    };
    expect(installLine("npm", module, "1.2.3")).toBe("npm install @narrativetrace-tools/x pino");
  });

  // Decided (2026-10-09, with the reference): an unknown version prints the placeholder, so a
  // pasted line fails loudly in the shell rather than installing a version that may not match the
  // packages already there.
  test("an unknown version prints the placeholder, never a guessed version", () => {
    const line = installLine("npm", EXPRESS_MODULE, VERSION_PLACEHOLDER);
    expect(line).toContain(`@narrativetrace/express@${VERSION_PLACEHOLDER}`);
  });
});

describe("framework table validation (adversarial)", () => {
  test("a framework check id without a thing segment is rejected", () => {
    const bad = {
      ...rowOf("express"),
      check: { kind: "wiring-check" as const, id: "config.express" },
    };
    expect(() => frameworkRow(bad)).toThrow(/config\.<framework>-<thing>/);
  });

  test("an uppercase framework check id is rejected", () => {
    const bad = {
      ...rowOf("express"),
      check: { kind: "wiring-check" as const, id: "config.Express-middleware" },
    };
    expect(() => frameworkRow(bad)).toThrow(/config\.<framework>-<thing>/);
  });

  test("a row id with an underscore is rejected as not kebab-case", () => {
    expect(() => frameworkRow({ ...rowOf("express"), id: "bad_id" })).toThrow(/kebab-case/);
  });

  test("a no-integration row that still names a module is rejected", () => {
    const bad = { ...rowOf("fastify"), module: EXPRESS_MODULE };
    expect(() => frameworkRow(bad)).toThrow(/exactly the no-integration rows/);
  });

  test("an integration row that names no package to add is rejected", () => {
    const bad = { ...rowOf("express"), module: { packages: [], dev: false } };
    expect(() => frameworkRow(bad)).toThrow(/adds no package/);
  });

  test("every framework check id in the table is unique", () => {
    const ids = FRAMEWORK_ROWS.filter((row) => row.check.kind !== "existing-check").map(
      (row) => row.check.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.skipIf(!REPO_ROOT_REACHABLE)(
    "every snippet fixture the table names exists in the repository",
    () => {
      const missing = FRAMEWORK_ROWS.flatMap((row) =>
        row.wiring.kind === "snippet" && !isFile(join(REPO_ROOT, row.wiring.fixture))
          ? [row.wiring.fixture]
          : [],
      );
      expect(missing).toEqual([]);
    },
  );
});

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

describe("docs rendering (adversarial)", () => {
  test("spliceBlock rejects an end marker that comes before the begin marker", () => {
    const doc = "<!-- t:end -->\n<!-- t:begin -->\n";
    expect(() => spliceBlock(doc, "t", "x")).toThrow(/begin \/ .*end marker pair/);
  });

  test("spliceBlock replaces only the content between the markers", () => {
    const doc = "before\n<!-- t:begin -->\nold\n<!-- t:end -->\nafter";
    expect(spliceBlock(doc, "t", "new\n")).toBe(
      "before\n<!-- t:begin -->\nnew\n<!-- t:end -->\nafter",
    );
  });

  test("the covered-frameworks line names every row and marks the no-integration rows", () => {
    const line = llmsTxtCoveredFrameworks();
    for (const row of FRAMEWORK_ROWS) expect(line).toContain(row.name);
    expect(line).toContain("no integration shipped, `config.fastify-integration` reports it");
  });
});

describe("packageManagerOf (adversarial)", () => {
  test("a packageManager field with an integrity suffix names its manager", () => {
    const root = pkg({ packageManager: "pnpm@9.12.0+sha256.abc" });
    expect(packageManagerOf(root, [])).toBe("pnpm");
  });

  test("a yarn packageManager with a berry tag names yarn", () => {
    const root = pkg({ packageManager: "yarn@berry" });
    expect(packageManagerOf(root, [])).toBe("yarn");
  });

  test("an empty packageManager field falls back to the lockfile", () => {
    const root = pkg({ packageManager: "" });
    expect(packageManagerOf(root, ["yarn.lock"])).toBe("yarn");
  });

  test("an unknown manager name falls back to the lockfile rather than npm", () => {
    const root = pkg({ packageManager: "deno@1.40.0" });
    expect(packageManagerOf(root, ["yarn.lock"])).toBe("yarn");
  });

  test("a declared manager wins over a conflicting lockfile", () => {
    const root = pkg({ packageManager: "pnpm@9" });
    expect(packageManagerOf(root, ["package-lock.json"])).toBe("pnpm");
  });

  test("a bun.lockb alone names bun", () => {
    expect(packageManagerOf(pkg(), ["bun.lockb"])).toBe("bun");
  });

  test("a non-string packageManager field does not crash and falls back to the lockfile", () => {
    const root = pkg({ packageManager: 42 } as unknown);
    expect(packageManagerOf(root, ["yarn.lock"])).toBe("yarn");
  });
});

describe("framework-wiring check (adversarial)", () => {
  const express = frameworkCheck(rowOf("express"));

  test("a module declared only in a workspace member's manifest counts as referenced", () => {
    const manifests = withPackages({
      "package.json": pkg({ dependencies: { express: "^4" } }),
      "packages/api/package.json": pkg({
        dependencies: { "@narrativetrace/express": "1.0.0" },
      }),
    });
    const finding = express(snapshot({ manifests, sourceFiles: withFiles({}) }));
    expect(finding.message).not.toContain("not installed");
  });

  test("a framework declared only in peerDependencies is detected and its missing module reported", () => {
    const manifests = withPackages({
      "package.json": pkg({ peerDependencies: { express: "^4" } }),
    });
    const finding = express(snapshot({ manifests, sourceFiles: withFiles({}) }));
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("not installed");
  });

  test("a commented-out wiring line does not satisfy the express check", () => {
    const manifests = withPackages({
      "package.json": pkg({
        dependencies: { express: "^4", "@narrativetrace/express": "1.0.0" },
      }),
    });
    const sourceFiles = withFiles({
      "src/app.ts":
        '// import { narrativeTrace } from "@narrativetrace/express";\n// app.use(narrativeTrace(o));',
    });
    expect(express(snapshot({ manifests, sourceFiles })).status).toBe("fail");
  });

  test("the not-installed fix uses the project's own package manager and version", () => {
    const manifests = withPackages({
      "package.json": pkg({ dependencies: { express: "^4" } }),
    });
    const installedPackages = new Map<string, PackageJsonLike>([
      ["@narrativetrace/core-node", pkg({ version: "0.9.1" })],
    ]);
    const finding = express(
      snapshot({
        manifests,
        sourceFiles: withFiles({}),
        packageManager: "pnpm",
        installedPackages,
      }),
    );
    expect(finding.fix).toContain("pnpm add @narrativetrace/express@0.9.1");
  });
});

describe("silent-sink check (adversarial)", () => {
  test("a commented-out traceObject() call alone is not a use and passes", () => {
    const sourceFiles = withFiles({ "src/a.ts": "// const s = traceObject(svc);\n" });
    expect(checkSilentSink(snapshot({ sourceFiles })).status).toBe("pass");
  });

  test("a commented-out captureTrace() does not count as an attached sink", () => {
    const sourceFiles = withFiles({
      "src/a.ts": "const t = traceObject(svc);\n// captureTrace();\n",
    });
    expect(checkSilentSink(snapshot({ sourceFiles })).status).toBe("fail");
  });

  test("a sink name that is only a prefix of a longer identifier does not count", () => {
    const sourceFiles = withFiles({
      "src/a.ts": "const t = traceObject(svc);\nconst x = captureTraces(t);\n",
    });
    expect(checkSilentSink(snapshot({ sourceFiles })).status).toBe("fail");
  });

  test("with only winston declared, the fix names winston's bridge and not pino's", () => {
    const sourceFiles = withFiles({ "src/a.ts": "const t = traceObject(svc);" });
    const manifests = withPackages({ "package.json": pkg({ dependencies: { winston: "^3" } }) });
    const finding = checkSilentSink(snapshot({ sourceFiles, manifests }));
    expect(finding.fix).toContain("config.winston-consumer");
    expect(finding.fix).not.toContain("config.pino-consumer");
  });

  test("with no logger declared, the fix quotes the default-logger install line and wiring", () => {
    const sourceFiles = withFiles({ "src/a.ts": "const t = traceObject(svc);" });
    const installedPackages = new Map<string, PackageJsonLike>([
      ["@narrativetrace/core-node", pkg({ version: "0.9.1" })],
    ]);
    const finding = checkSilentSink(
      snapshot({ sourceFiles, installedPackages, packageManager: "npm" }),
    );
    expect(finding.fix).toContain("npm install @narrativetrace/pino@0.9.1");
  });
});

describe("buildSnapshot on a real directory (adversarial)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "adv-phase6-m4-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, content: string): void {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }

  test("a lockfile in a workspace member does not choose the root's package manager", () => {
    write("package.json", JSON.stringify({ name: "root" }));
    write("packages/api/pnpm-lock.yaml", "lockfileVersion: 9");
    expect(buildSnapshot(root, {}).packageManager).toBe("npm");
  });

  test("the root packageManager field is read from disk", () => {
    write("package.json", JSON.stringify({ name: "root", packageManager: "pnpm@9.12.0" }));
    expect(buildSnapshot(root, {}).packageManager).toBe("pnpm");
  });

  test("a malformed root package.json degrades to npm rather than crashing", () => {
    write("package.json", "{not json");
    expect(buildSnapshot(root, {}).packageManager).toBe("npm");
  });

  test("manifests under node_modules, dist and dot-directories are never read", () => {
    write("package.json", JSON.stringify({ name: "root" }));
    write("node_modules/x/package.json", JSON.stringify({ name: "x" }));
    write("dist/package.json", JSON.stringify({ name: "d" }));
    write(".hidden/package.json", JSON.stringify({ name: "h" }));
    const manifests = [...buildSnapshot(root, {}).manifests.keys()];
    expect(manifests).toEqual(["package.json"]);
  });
});
