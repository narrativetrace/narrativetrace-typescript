// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { DoctorSnapshot, PackageJsonLike } from "../src/doctor/types.js";

/** A minimal, all-pass baseline snapshot; tests override just the field(s) they care about. */
export function snapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
  return {
    cwd: "/project",
    nodeVersion: "20.11.0",
    env: {},
    rootPackageJson: { name: "consumer", version: "1.0.0" },
    sourceFiles: new Map(),
    outputFiles: new Map(),
    approvedDirFiles: new Map(),
    installedPackages: new Map(),
    ...overrides,
  };
}

export function pkg(overrides: Partial<PackageJsonLike> = {}): PackageJsonLike {
  return { name: "pkg", version: "1.0.0", ...overrides };
}

export function withPackages(
  entries: Record<string, PackageJsonLike>,
): ReadonlyMap<string, PackageJsonLike> {
  return new Map(Object.entries(entries));
}

export function withFiles(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

/**
 * A snapshot with every check satisfied: a passing redaction-proof test present, and no
 * traceObject/sink usage to trip the silent-sink trap. Used by tests that assert "clean project,
 * every check passes" — the bare {@link snapshot} default deliberately has no test files, so
 * `trap.redaction-proof` fails on it (unproven, not merely absent).
 */
export function cleanSnapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
  return snapshot({
    sourceFiles: withFiles({
      "src/order.test.ts": 'expect(rendered).toContain("[REDACTED]");',
    }),
    ...overrides,
  });
}

/** The real @narrativetrace/vitest package.json shape, for tests that exercise the sibling check. */
export const NT_VITEST_PACKAGE: PackageJsonLike = {
  name: "@narrativetrace/vitest",
  version: "0.1.3",
  engines: { node: ">=20" },
  dependencies: {
    "@narrativetrace/clarity": "0.1.3",
    "@narrativetrace/core-node": "0.1.3",
    "@narrativetrace/diagrams": "0.1.3",
    "@narrativetrace/glossary": "0.1.3",
    "@narrativetrace/proxy": "0.1.3",
  },
  peerDependencies: { vitest: "^1.0.0 || ^2.0.0 || ^3.0.0" },
};
