// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { decide, isApplicable } from "../tools/contract-decision.js";
import { parseContractYaml } from "../tools/contract-lint.js";
import { checkEntryPointOnRegistry } from "./probes/entry-point.mjs";

/**
 * The standalone contract-probe orchestrator (docs-vs-published-gate-2026-09-12.md §2):
 * consumes ONLY the npm registry at `--version`, never workspace:/link:/file:. Reads
 * `documentation/contract.yaml`, decides applicability per entry (`isApplicable`), and for every
 * applicable entry either checks the registry directly (`entry-point`, no install needed — the
 * same HTTP presence check verify-publication.ts uses) or runs the entry's own probe script
 * against `--cwd` (a scratch project tools/contract-check.ts has already `npm install`ed the
 * needed packages@version into). Prints one JSON result and exits 1 if any entry FAILS.
 *
 * Usage: tsx contract-probe/run.ts --contract <path> --version <installed> --cwd <scratchDir> --out <resultJsonPath>
 */
interface Args {
  readonly contract: string;
  readonly version: string;
  readonly cwd: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const contract = get("--contract");
  const version = get("--version");
  const cwd = get("--cwd");
  const out = get("--out");
  if (!contract || !version || !cwd || !out) {
    throw new Error(
      "Usage: run.ts --contract <path> --version <installed> --cwd <scratchDir> --out <resultJsonPath>",
    );
  }
  return { contract, version, cwd, out };
}

// Node resolves a bare specifier (`import "@narrativetrace/vitest"`) from the IMPORTING module's
// own location, not the process's cwd — so a probe run in place would never see the scratch
// project's node_modules. Copying it into the scratch dir first (the same fix
// verify-publication-smoke.ts's writeSmokeProject applies to its own fixture source) makes plain
// bare-specifier imports resolve correctly with no NODE_PATH trick.
function runProbeScript(probePath: string, cwd: string): string | undefined {
  const copied = join(cwd, basename(probePath));
  copyFileSync(probePath, copied);
  try {
    return execFileSync("node", [copied], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

async function observe(
  entry: import("../tools/contract-decision.js").ContractEntry,
  args: Args,
): Promise<string | undefined> {
  if (entry.kind === "entry-point") {
    return checkEntryPointOnRegistry(entry.coordinate as string, args.version);
  }
  return runProbeScript(join(process.cwd(), entry.probe), args.cwd);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const document = parseContractYaml(readFileSync(args.contract, "utf-8"));

  const outcomes = [];
  for (const entry of document.entries) {
    const applicable = isApplicable(entry.since, args.version);
    const observed = applicable ? await observe(entry, args) : undefined;
    outcomes.push(decide(entry, args.version, observed));
  }

  const summary = {
    installedVersion: args.version,
    holds: outcomes.filter((o) => o.verdict === "holds").length,
    fails: outcomes.filter((o) => o.verdict === "fails").length,
    notApplicable: outcomes.filter((o) => o.verdict === "not-applicable-before-since").length,
    outcomes: outcomes.map((o) => ({ id: o.entry.id, verdict: o.verdict, message: o.message })),
  };
  writeFileSync(args.out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  for (const outcome of outcomes) {
    if (outcome.verdict === "fails") console.error(outcome.message);
  }
  process.exit(summary.fails > 0 ? 1 : 0);
}

main();
