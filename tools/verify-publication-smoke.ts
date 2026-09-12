// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_REGISTRY_BASE } from "./verify-publication-registry.js";

/**
 * The exact recipe `documentation/sixty-seconds.md` steps 1-5 document and this repository's
 * own copy of those steps is proven against — kept here as a literal string, not read off disk,
 * so a doc edit that silently drifts from what actually runs shows up as this tool's own smoke
 * test failing, not as a stale copy nobody notices.
 */
const ORDER_SERVICE_TS = `export class OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): string {
    return \`ORD-\${customerId}-\${productId}-\${quantity}\`;
  }
}
`;

const ORDER_SERVICE_TEST_TS = `import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C-1234", "SKU-KB", 2);
});
`;

export interface SmokeVersions {
  readonly coreNode: string;
  readonly proxy: string;
  readonly vitestPackage: string;
  /** This repo's own root `devDependencies.vitest` range — the smoke project's peer, read from
   * the workspace rather than pinned a second time here. */
  readonly vitestRuntimeRange: string;
}

export interface SmokeResult {
  readonly verdict: "PASSED" | "FAILED";
  readonly detail: string;
  readonly workDir: string;
}

function writeSmokeProject(dir: string, versions: SmokeVersions, registry: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "nt-verify-publication-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@narrativetrace/core-node": versions.coreNode,
          "@narrativetrace/proxy": versions.proxy,
        },
        devDependencies: {
          "@narrativetrace/vitest": versions.vitestPackage,
          vitest: versions.vitestRuntimeRange,
        },
      },
      null,
      2,
    ),
  );
  // Belt and suspenders alongside the env overrides in runSmokeTest: even if some ambient
  // .npmrc were ever mounted into a future runner, this project's own config still pins the
  // real registry.
  writeFileSync(join(dir, ".npmrc"), `registry=${registry}\n`);
  writeFileSync(join(dir, "src", "order-service.ts"), ORDER_SERVICE_TS);
  writeFileSync(join(dir, "src", "order-service.test.ts"), ORDER_SERVICE_TEST_TS);
}

/** Isolated env for both the install and the test run: a fresh cache directory (never the
 * container's warm `~/.npm`/pnpm store — the whole point is resolving as a first-time adopter,
 * not from anything warm) and the real registry, regardless of what the ambient environment
 * happens to have configured. */
function isolatedEnv(cacheDir: string, registry: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_cache: cacheDir,
    npm_config_registry: registry,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_loglevel: "error",
  };
}

interface RunOutcome {
  readonly ok: boolean;
  readonly log: string;
}

function runInstall(dir: string, env: NodeJS.ProcessEnv): RunOutcome {
  const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: dir,
    env,
    encoding: "utf-8",
  });
  const log = `$ npm install\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { ok: result.status === 0, log };
}

function runVitest(dir: string, env: NodeJS.ProcessEnv): RunOutcome {
  const vitestBin = join(dir, "node_modules", ".bin", "vitest");
  if (!existsSync(vitestBin)) {
    return { ok: false, log: `install did not produce ${vitestBin}` };
  }
  const result = spawnSync(vitestBin, ["run"], { cwd: dir, env, encoding: "utf-8" });
  const log = `$ vitest run\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { ok: result.status === 0, log };
}

/** What `documentation/sixty-seconds.md` step 5 promises the trace narrative contains, for
 * this exact call — the assertion is "the docs are true", not "a file exists". */
function assertMarkdown(dir: string): string | undefined {
  const path = join(dir, "narrativetrace-output", "order-service", "customer_places_order.md");
  if (!existsSync(path)) return `missing ${path}`;
  const content = readFileSync(path, "utf-8");
  const mustContain = [
    "entry_point: OrderService.placeOrder",
    "error_count: 0",
    'OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2)',
    '"ORD-C-1234-SKU-KB-2"',
  ];
  const missing = mustContain.filter((needle) => !content.includes(needle));
  return missing.length > 0 ? `${path} missing: ${missing.join(" | ")}` : undefined;
}

interface JsonEvent {
  readonly type?: "enter" | "exit";
  readonly className?: string;
  readonly methodName?: string;
  readonly returnValue?: string | null;
}
interface JsonTrace {
  readonly scenario?: { readonly name?: string; readonly result?: string };
  readonly events?: readonly JsonEvent[];
}

/** The JSON sibling of the same trace (`@narrativetrace/core`'s `exportJson` shape) — checked
 * structurally rather than by string search, since it is data, not prose. One call flattens to
 * an `enter` event and an `exit` event sharing `className`/`methodName`; only the `exit` one
 * carries `returnValue`, so that is the one this must match against. */
function assertJson(dir: string): string | undefined {
  const path = join(dir, "narrativetrace-output", "order-service", "customer_places_order.json");
  if (!existsSync(path)) return `missing ${path}`;
  const trace = JSON.parse(readFileSync(path, "utf-8")) as JsonTrace;
  if (trace.scenario?.name !== "customer places order" || trace.scenario?.result !== "success") {
    return `${path} scenario mismatch: ${JSON.stringify(trace.scenario)}`;
  }
  const call = trace.events?.find(
    (e) => e.type === "exit" && e.className === "OrderService" && e.methodName === "placeOrder",
  );
  if (!call || !call.returnValue?.includes("ORD-C-1234-SKU-KB-2")) {
    return `${path} has no matching OrderService.placeOrder exit event with the expected return value`;
  }
  return undefined;
}

function assertDiagram(dir: string): string | undefined {
  const path = join(
    dir,
    "narrativetrace-output",
    "diagrams",
    "order-service",
    "customer_places_order.mmd",
  );
  return existsSync(path) && readFileSync(path, "utf-8").trim().length > 0
    ? undefined
    : `missing or empty ${path}`;
}

function assertTraceOutput(dir: string): string | undefined {
  return assertMarkdown(dir) ?? assertJson(dir) ?? assertDiagram(dir);
}

function writeFailureLog(dir: string, log: string): void {
  writeFileSync(join(dir, "smoke-output.log"), log);
}

/**
 * The consumer smoke test: in a temp project with a fresh npm cache, installs
 * `@narrativetrace/core-node` + `@narrativetrace/proxy` (+ the `@narrativetrace/vitest` fixture)
 * from the real registry, runs the exact `sixty-seconds.md` steps 1-5 recipe, and asserts the
 * trace files it produces are what the docs promise. "Resolves and installs" is not the bar —
 * "an adopter's day one traces" is.
 */
export function runSmokeTest(
  versions: SmokeVersions,
  registry: string = DEFAULT_REGISTRY_BASE,
): SmokeResult {
  const workDir = mkdtempSync(join(tmpdir(), "nt-verify-publication-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "nt-verify-publication-cache-"));
  const env = isolatedEnv(cacheDir, registry);
  writeSmokeProject(workDir, versions, registry);

  const install = runInstall(workDir, env);
  const test = install.ok ? runVitest(workDir, env) : { ok: false, log: "" };
  const traceProblem = install.ok && test.ok ? assertTraceOutput(workDir) : undefined;

  rmSync(cacheDir, { recursive: true, force: true });

  if (install.ok && test.ok && !traceProblem) {
    rmSync(workDir, { recursive: true, force: true });
    return {
      verdict: "PASSED",
      detail: "install + vitest run passed, trace output matches the docs",
      workDir,
    };
  }
  writeFailureLog(workDir, `${install.log}\n${test.log}`);
  const reason = !install.ok
    ? `npm install failed — see ${workDir}/smoke-output.log`
    : !test.ok
      ? `vitest run failed — see ${workDir}/smoke-output.log`
      : traceProblem;
  return { verdict: "FAILED", detail: reason ?? "unknown failure", workDir };
}
