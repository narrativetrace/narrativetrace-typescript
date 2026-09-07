// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import type { ScenarioResult } from "@narrativetrace/clarity";
import { resolveEnvConfig } from "@narrativetrace/core-node";
import {
  type SuiteArtifactSink,
  suiteClarityFooter,
  writeSuiteClarityArtifacts,
} from "./suite-clarity-accumulator.js";

// The fixture stamps the clarity scenario onto Vitest's per-task `meta`, which is serialized from
// workers to the main-process reporter — the cross-worker-safe accumulation channel.
declare module "vitest" {
  interface TaskMeta {
    narrativeClarity?: ScenarioResult;
  }
}

interface TaskLike {
  type?: string;
  meta?: { narrativeClarity?: ScenarioResult };
  tasks?: TaskLike[];
}

/**
 * Depth-first walk of Vitest's task tree collecting each test's `task.meta.narrativeClarity`, in
 * file-then-test order. Because `task.meta` is serialized from workers to the main-process reporter,
 * this is the cross-worker-safe accumulation path (a module registry would only see one worker).
 */
export function collectClarityEntries(files: readonly TaskLike[]): ScenarioResult[] {
  const entries: ScenarioResult[] = [];
  const visit = (task: TaskLike): void => {
    const entry = task.meta?.narrativeClarity;
    if (entry) entries.push(entry);
    for (const child of task.tasks ?? []) visit(child);
  };
  for (const file of files) visit(file);
  return entries;
}

export interface ClaritySuiteReporterOptions {
  outputDir?: string;
  sink?: SuiteArtifactSink;
  log?: (message: string) => void;
}

/**
 * Vitest reporter that, once every test file has run, writes ONE `clarity-results.json` +
 * `clarity-report.md` for the whole suite and prints the footer once with the high/moderate/low
 * split. An empty suite (no clarity metadata) writes nothing and prints no footer.
 */
export class ClaritySuiteReporter {
  private readonly outputDir: string;
  private readonly sink: SuiteArtifactSink;
  private readonly log: (message: string) => void;

  constructor(options: ClaritySuiteReporterOptions = {}) {
    this.outputDir = options.outputDir ?? resolveEnvConfig().outputDir ?? "narrativetrace-output";
    this.sink = options.sink ?? {
      mkdir: (dir) => mkdirSync(dir, { recursive: true }),
      writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
    };
    this.log = options.log ?? ((message) => process.stdout.write(`${message}\n`));
  }

  onFinished(files: readonly TaskLike[] = []): void {
    const entries = collectClarityEntries(files);
    const outcome = writeSuiteClarityArtifacts(entries, this.outputDir, this.sink);
    if (!outcome.written) return;
    const footer = suiteClarityFooter(entries, this.outputDir);
    if (footer) this.log(footer);
  }
}
