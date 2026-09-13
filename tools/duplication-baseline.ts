// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import type { DuplicationCluster, DuplicationTreeResult } from "./duplication-shared.js";

// The ratchet: `config/duplication/baseline.properties` and `config/duplication/exemptions.txt`,
// read and enforced against a fresh main-tree scan — see documentation/duplication.md for why a
// ratchet, not a fixed percentage, and what an exemption is. Only the main tree gates; test-tree
// duplication is reported by `tools/duplication-report.ts` and never reaches this module.

/** The committed `config/duplication/baseline.properties` — main tree only; tests never gate. */
export interface DuplicationBaseline {
  readonly recorded: string;
  readonly mainPercent: number;
  readonly mainLargestCluster: number;
}

function parseProperties(text: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    props.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return props;
}

export function readBaseline(filePath: string): DuplicationBaseline {
  if (!existsSync(filePath)) {
    throw new Error(`${filePath}: no duplication baseline — run duplication:report and commit one`);
  }
  const props = parseProperties(readFileSync(filePath, "utf-8"));
  const required = (key: string): string => {
    const value = props.get(key);
    if (value === undefined) throw new Error(`${filePath}: missing '${key}'`);
    return value;
  };
  return {
    recorded: props.get("recorded") ?? "",
    mainPercent: Number(required("main.percent")),
    mainLargestCluster: Number(required("main.largestCluster")),
  };
}

/** One `config/duplication/exemptions.txt` entry: a deliberate pair, with the reason it exists. */
export interface DuplicationExemption {
  readonly globA: string;
  readonly globB: string;
  readonly reason: string;
}

function parseExemptionLine(
  filePath: string,
  lineNumber: number,
  line: string,
  pendingReason: string | undefined,
): DuplicationExemption {
  if (pendingReason === undefined) {
    throw new Error(
      `${filePath}:${lineNumber}: exemption pair has no '# reason' line above it: ${line}`,
    );
  }
  const [globA, globB, ...rest] = line.split("::").map((p) => p.trim());
  if (!globA || !globB || rest.length > 0) {
    throw new Error(`${filePath}:${lineNumber}: expected 'globA :: globB', got: ${line}`);
  }
  return { globA, globB, reason: pendingReason };
}

/**
 * Parses `exemptions.txt`: blank-line-separated entries, each a `# reason` line (one or more,
 * concatenated) immediately followed by one `globA :: globB` pair line. Default-deny: a pair line
 * with no reason above it is a malformed file, not a silent pass — see documentation/duplication.md.
 */
export function readExemptions(filePath: string): DuplicationExemption[] {
  if (!existsSync(filePath)) return [];
  const exemptions: DuplicationExemption[] = [];
  let pendingReason: string | undefined;
  readFileSync(filePath, "utf-8")
    .split("\n")
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (line === "") {
        pendingReason = undefined;
      } else if (line.startsWith("#")) {
        const text = line.slice(1).trim();
        pendingReason = pendingReason ? `${pendingReason} ${text}` : text;
      } else {
        exemptions.push(parseExemptionLine(filePath, index + 1, line, pendingReason));
        pendingReason = undefined;
      }
    });
  return exemptions;
}

/**
 * A minimal glob matcher covering exactly the vocabulary `exemptions.txt` uses: `*` (any run of
 * characters except `/`), `**` (any run of characters, including `/`), and `?` (one character
 * except `/`) — deliberately not a full java.nio.file-style matcher (bracket classes, `{a,b}`
 * alternation): pulling in a glob-matching dependency for that would be the tail wagging the dog,
 * the same reasoning `verify-publication-packages.ts`'s own `workspaceGlobs` gives for not parsing
 * YAML. Every other character is escaped and matched literally.
 */
function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      pattern += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") {
      pattern += "[^/]*";
    } else if (c === "?") {
      pattern += "[^/]";
    } else {
      pattern += (c as string).replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}

/** A cluster is exempt when every occurrence's path matches one of a pair's two globs. */
export function isExempt(
  cluster: DuplicationCluster,
  exemptions: readonly DuplicationExemption[],
): boolean {
  return exemptions.some((exemption) =>
    cluster.occurrences.every(
      (occurrence) =>
        matchesGlob(exemption.globA, occurrence.file) ||
        matchesGlob(exemption.globB, occurrence.file),
    ),
  );
}

/** Percentage-point slack absorbing token-count noise between runs (owner ruling 2026-09-12,
 * mirroring the Java golden repo's own tolerance). */
export const PERCENT_TOLERANCE = 0.3;

export interface DuplicationCheckResult {
  readonly passed: boolean;
  readonly message: string;
}

function passMessage(
  main: DuplicationTreeResult,
  baseline: DuplicationBaseline,
  largest: number,
): string {
  return (
    `duplication-check: main ${main.percent.toFixed(1)}% within baseline ` +
    `${baseline.mainPercent.toFixed(1)}% (+/-${PERCENT_TOLERANCE}), largest non-exempt cluster ` +
    `${largest} tokens (baseline ${baseline.mainLargestCluster})`
  );
}

function failMessage(problems: readonly string[]): string {
  return (
    "duplication-check failed:\n  " +
    problems.join("\n  ") +
    "\nLower the baseline (config/duplication/baseline.properties) with the commit that removes " +
    "the duplication, or add a reasoned 'globA :: globB' pair to config/duplication/exemptions.txt " +
    "if it is deliberate — see documentation/duplication.md."
  );
}

/**
 * The ratchet: fails when main's percentage rose past {@link PERCENT_TOLERANCE} over the baseline,
 * or when a non-exempt cluster is bigger than the baseline's recorded largest — either one, on its
 * own, is new duplication the baseline never accounted for.
 */
export function decide(
  main: DuplicationTreeResult,
  baseline: DuplicationBaseline,
  exemptions: readonly DuplicationExemption[],
): DuplicationCheckResult {
  const percentFailed = main.percent - baseline.mainPercent > PERCENT_TOLERANCE;
  const nonExempt = main.clusters.filter((c) => !isExempt(c, exemptions));
  const offending = nonExempt.filter((c) => c.tokens > baseline.mainLargestCluster);

  if (!percentFailed && offending.length === 0) {
    const largest = nonExempt.reduce((max, c) => Math.max(max, c.tokens), 0);
    return { passed: true, message: passMessage(main, baseline, largest) };
  }

  const problems: string[] = [];
  if (percentFailed) {
    problems.push(
      `main duplication rose to ${main.percent.toFixed(1)}% (baseline ${baseline.mainPercent.toFixed(1)}% + ${PERCENT_TOLERANCE} tolerance)`,
    );
  }
  for (const cluster of offending) {
    const locations = cluster.occurrences.map((o) => `${o.file}:${o.startLine}`).join(" ↔ ");
    problems.push(
      `new cluster ${cluster.tokens} tokens (baseline largest ${baseline.mainLargestCluster}): ${locations}`,
    );
  }
  return { passed: false, message: failMessage(problems) };
}
