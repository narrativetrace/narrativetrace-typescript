// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { InstalledSkill } from "../init/installed-skill.js";

/**
 * The doctor's world-view, decoupled from the real filesystem: every check is a pure function
 * over a {@link DoctorSnapshot}, which is why every check has both a passing and a failing unit
 * test with no disk I/O at all. {@link buildSnapshot} (environment.ts) is the one impure module —
 * it walks the real project and builds this shape once per run.
 *
 * @llmNote The agent-skills half ({@link DoctorSnapshot.installedSkills},
 * {@link DoctorSnapshot.catalogueSkills}) is read by the installer's OWN reader
 * (`readProjectState`) and the installer's OWN carrier resolution (`resolveCarrier`) — one reader
 * of a project's skill directories and one resolver of its carrier, so the doctor and `init` can
 * never disagree about which page is ours or which pages should exist.
 */

/** The process environment, as `process.env` hands it over. */
export type Env = Readonly<Record<string, string | undefined>>;

/** The subset of a `package.json` a check ever needs to read. */
export interface PackageJsonLike {
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly engines?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

export interface DoctorSnapshot {
  /** Absolute path to the project being checked (informational — checks never touch disk). */
  readonly cwd: string;
  /** `process.version` with the leading `v` stripped, e.g. `"20.11.0"`. */
  readonly nodeVersion: string;
  readonly env: Env;
  readonly rootPackageJson: PackageJsonLike | undefined;
  /** Relative path → content, for source/config/test files under the project (bounded walk). */
  readonly sourceFiles: ReadonlyMap<string, string>;
  /** Relative path → content, for everything under the configured output directory. */
  readonly outputFiles: ReadonlyMap<string, string>;
  /** Relative path → content, for everything under the configured approved-trace directory. */
  readonly approvedDirFiles: ReadonlyMap<string, string>;
  /** Package name → its resolved `package.json`, for packages the checks care about. */
  readonly installedPackages: ReadonlyMap<string, PackageJsonLike>;
  /** Every agent-skill directory found under either install root, in read order. */
  readonly installedSkills: readonly InstalledSkill[];
  /** Every skill name the resolved carrier's catalogue lists, or empty when none could be resolved. */
  readonly catalogueSkills: readonly string[];
}

export type FindingStatus = "pass" | "fail";

export interface Finding {
  /** Stable, dotted id (`"toolchain.node-engine"`) — never renamed once shipped; agents and CI grep it. */
  readonly id: string;
  readonly status: FindingStatus;
  /** One line: what the check found, true on pass or fail. */
  readonly message: string;
  /** What to do about it. Empty string on a pass — there is nothing to fix. */
  readonly fix: string;
  /** Public doc URL the finding points at (a GitHub blob link into this repo's `documentation/`). */
  readonly docUrl: string;
  /**
   * The catalogue skill that fixes this class of finding, or `null` when none does. Derived from
   * {@link Finding.id} by {@link skillForCheck} — never chosen per finding — so no check can ship
   * naming the wrong skill or forgetting one.
   */
  readonly skill: string | null;
}

export type DoctorCheck = (snapshot: DoctorSnapshot) => Finding;

export interface DoctorReport {
  readonly findings: readonly Finding[];
  /** 0 — every check passed. 1 — at least one finding failed. */
  readonly exitCode: 0 | 1;
}
