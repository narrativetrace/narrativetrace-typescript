// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ClarityIssue } from "@narrativetrace/clarity";
import { resolveEnvConfig } from "@narrativetrace/core-node";
import type { SourcePathLookup } from "@narrativetrace/glossary";
import {
  collectGlossarySites,
  type GlossaryArtifactSink,
  type TraceSite,
  writeSuiteGlossary,
} from "./glossary-suite-accumulator.js";

// The fixture stamps each test's sites onto Vitest's per-task `meta`, which is serialized from
// workers to the main-process reporter — the cross-worker-safe accumulation channel.
declare module "vitest" {
  interface TaskMeta {
    narrativeGlossary?: TraceSite[];
  }
}

interface TaskLike {
  meta?: { narrativeGlossary?: TraceSite[] };
  tasks?: TaskLike[];
}

/**
 * Whether glossary harvesting was switched on for this run.
 *
 * INTENT: harvesting is off by default, exactly as in the Java runtime, because it writes
 * `glossary.json` and `glossary.md` **outside** the build directory — into files a repository
 * commits. Nothing that rewrites tracked files may happen because someone ran the tests.
 *
 * @param env the environment to read; defaults to the process environment.
 * @returns `true` only for the explicit opt-in `NARRATIVETRACE_GLOSSARY=true` (Java:
 * `narrativetrace.glossary=true`); any other value, including `1` or `yes`, leaves it off.
 */
export function glossaryHarvestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["NARRATIVETRACE_GLOSSARY"]?.trim().toLowerCase() === "true";
}

export interface GlossarySuiteReporterOptions {
  /** Overrides the `NARRATIVETRACE_GLOSSARY` opt-in; harvesting is off unless one of them says so. */
  enabled?: boolean;
  /** Directory holding the committed glossary pair; defaults to the working directory. */
  glossaryDir?: string;
  /** Directory receiving `glossary-usage.json`; defaults to the configured artifact directory. */
  outputDir?: string;
  /**
   * Resolves a class name to its source path, which is what maps a term to a bounded context.
   * Without one every harvested term lands in `_unassigned` — run `glossary-scan`, the mode that
   * knows the repository's file layout, to resolve contexts.
   */
  sourcePathOf?: SourcePathLookup;
  /** ISO `YYYY-MM-DD` date stamped on new terms; defaults to today in UTC. */
  today?: string;
  sink?: GlossaryArtifactSink;
  log?: (message: string) => void;
}

/**
 * Vitest reporter that harvests the suite's vocabulary into the repository glossary.
 *
 * INTENT: the suite-end glossary harvest, beside the clarity
 * report, kept out of the fixture so glossary mechanics stay in one place. Opt-in only, and an
 * empty suite writes nothing.
 *
 * @example
 * ```ts
 * // vitest.config.ts — with NARRATIVETRACE_GLOSSARY=true in the environment
 * reporters: ["default", new GlossarySuiteReporter()];
 * ```
 */
export class GlossarySuiteReporter {
  private readonly options: GlossarySuiteReporterOptions;
  private readonly sink: GlossaryArtifactSink;
  private readonly log: (message: string) => void;
  /** The run's vocabulary issues, for a caller folding them into the clarity report. */
  issues: readonly ClarityIssue[] = [];

  constructor(options: GlossarySuiteReporterOptions = {}) {
    this.options = options;
    this.sink = options.sink ?? {
      mkdir: (dir) => mkdirSync(dir, { recursive: true }),
      writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
      fileExists: existsSync,
      readFile: (path) => readFileSync(path, "utf-8"),
    };
    this.log = options.log ?? ((message) => process.stdout.write(`${message}\n`));
  }

  onFinished(files: readonly TaskLike[] = []): void {
    if (!(this.options.enabled ?? glossaryHarvestEnabled())) return;
    const outcome = writeSuiteGlossary(collectGlossarySites(files), this.config(), this.sink);
    this.issues = outcome.issues;
    if (outcome.summary !== undefined) this.log(outcome.summary);
  }

  private config() {
    return {
      glossaryDir: this.options.glossaryDir ?? ".",
      outputDir: this.options.outputDir ?? resolveEnvConfig().outputDir ?? "narrativetrace-output",
      today: this.options.today ?? new Date().toISOString().slice(0, 10),
      ...(this.options.sourcePathOf !== undefined
        ? { sourcePathOf: this.options.sourcePathOf }
        : {}),
    };
  }
}
