// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolves the shared hostile-corpus master copy these fixtures must stay byte-identical to (the
 * canonical Java repo's `narrativetrace-security-tests/src/test/resources/hostile-corpus/`, §6.7).
 * Never assumed present — a checkout without that repo as a sibling, or a dev container without
 * the mount, must stay green with a loud skip rather than fail or silently pass nothing.
 *
 * Candidates, in order: `JAVA_REPO` (an explicit override, same env var the dev-container tooling
 * already uses for the read-only mount), `/workspace-java` (that mount's path inside the dev
 * container), then the canonical repo checked out as a host sibling (this file's location plus four
 * `..`: `__tests__` -> `security-tests` -> `packages` -> repo root -> its parent).
 *
 * @remarks The comparison reads the master's content at its COMMITTED `HEAD`
 * (`git -C <repo> show HEAD:<relative path>`), never the working tree: a candidate repo mounted
 * read-only can still have an in-progress edit to `graphs.json` sitting uncommitted in its working
 * tree (the master repo is being worked on live, same host, same day) — reading that file's bytes
 * off disk would turn this port red for a change that was never committed there, and never reached
 * `HEAD` at all. Falling back to the working-tree file is done ONLY when the candidate directory is
 * not a git checkout at all (a plain export/mount with no `.git`) — never as a fallback for a git
 * checkout whose `HEAD` read merely failed, which stays a hard error rather than a silent
 * downgrade. Either way the caller is told which source won, so a byte-diff test's own name or a
 * printed log line always says what was actually compared against.
 */
const JAVA_REPO_ENV = "JAVA_REPO";
const WORKSPACE_MOUNT = "/workspace-java";
// The canonical repo's directory name, checked out as a host sibling — see the module doc above.
// A reviewed .publishallow exception covers this line for the publish tooling's own trace gate
// (dev-tooling config, not a development trace — same class as legal.properties'
// legal.canonicalRepo entry there).
const CANONICAL_REPO_DIR_NAME = "narrative-trace-java";

function javaRepoCandidates(): string[] {
  const envOverride = process.env[JAVA_REPO_ENV];
  const hostSibling = join(import.meta.dirname, "..", "..", "..", "..", CANONICAL_REPO_DIR_NAME);
  return [envOverride, WORKSPACE_MOUNT, hostSibling].filter((c): c is string => Boolean(c));
}

const HOSTILE_CORPUS_RELATIVE_DIR =
  "narrativetrace-security-tests/src/test/resources/hostile-corpus";

/** A candidate repo directory that has the named file on disk, whether or not it is a git checkout. */
interface CandidateFile {
  readonly repoDir: string;
  readonly absolutePath: string;
}

function findCandidateFile(fileName: string): CandidateFile | undefined {
  for (const repoDir of javaRepoCandidates()) {
    const absolutePath = join(repoDir, HOSTILE_CORPUS_RELATIVE_DIR, fileName);
    if (existsSync(absolutePath)) return { repoDir, absolutePath };
  }
  return undefined;
}

function isGitCheckout(repoDir: string): boolean {
  try {
    execFileSync("git", ["-C", repoDir, "rev-parse", "--is-inside-work-tree"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/** `HEAD`'s short hash for `repoDir` — only ever called once {@link isGitCheckout} said yes. */
function headShortHash(repoDir: string): string {
  return execFileSync("git", ["-C", repoDir, "rev-parse", "--short", "HEAD"], {
    encoding: "utf-8",
  }).trim();
}

/**
 * `relativePath`'s content at `repoDir`'s committed `HEAD` — never the working tree. Left to throw
 * on failure (a git checkout whose `HEAD` cannot supply the path is a hard error, not a silent
 * fallback to working-tree bytes — see the module doc's `@remarks`).
 */
function readAtHead(repoDir: string, relativePath: string): string {
  return execFileSync("git", ["-C", repoDir, "show", `HEAD:${relativePath}`], {
    encoding: "utf-8",
  });
}

/**
 * The resolved master file's content, plus a human-readable description of what it was actually
 * compared against — a git ref (the common case) or an explicit "not a git checkout" fallback
 * notice, for a byte-diff test to print or fold into its own name.
 */
export interface MasterCorpusFile {
  readonly content: string;
  readonly source: string;
}

function resolveMasterCorpusFile(fileName: string): MasterCorpusFile | undefined {
  const found = findCandidateFile(fileName);
  if (found === undefined) return undefined;
  if (isGitCheckout(found.repoDir)) {
    const relativePath = `${HOSTILE_CORPUS_RELATIVE_DIR}/${fileName}`;
    return {
      content: readAtHead(found.repoDir, relativePath),
      source: `HEAD (${headShortHash(found.repoDir)})`,
    };
  }
  return {
    content: readFileSync(found.absolutePath, "utf-8"),
    source: "working tree (not a git checkout — no HEAD to compare against)",
  };
}

/** The master `graphs.json`'s content and source, or `undefined` when no candidate repo has it. */
export function resolveMasterGraphs(): MasterCorpusFile | undefined {
  return resolveMasterCorpusFile("graphs.json");
}

/** The master `redaction.json`'s content and source, or `undefined` when no candidate repo has it. */
export function resolveMasterRedaction(): MasterCorpusFile | undefined {
  return resolveMasterCorpusFile("redaction.json");
}
