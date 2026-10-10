// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * This port's licence-category source — the one place that decides which published package ships
 * Apache-2.0 instead of the BUSL-1.1 runtime licence. Mirrors the Java reference repository's
 * `licensing.properties` (`module.narrativetrace-skills=open`, `module.narrativetrace-cli=open`,
 * `module.narrativetrace-tooling=open`), minus the file: this port has three packages, not
 * dozens, so one shared module is the whole registry rather than a parsed properties file.
 * `__tests__/package-metadata.test.ts` and `__tests__/notice.test.ts` both gate against THIS set —
 * neither defines its own copy, so the two can never silently disagree about which packages are
 * Apache (the exact class of bug Q2 found in the Java reference's own NOTICE, which named one
 * `open` module while `licensing.properties` had marked four).
 */
export const RUNTIME_LICENSE = "BUSL-1.1";
export const OPEN_LICENSE = "Apache-2.0";

// The "open" tier (README § License; the Java reference's `licensing.properties` precedent): the
// standards surface third-party code compiles against ships Apache 2.0, distinct from the
// BUSL-1.1 runtime. `cli` is the first such package — the format CLI over the open artifact
// formats (Pro TODO §4.5, ruled free/Open). Adding a package here is a licensing decision, not a
// default: it belongs on this list only when that decision has actually been made and recorded
// (commit message + this comment), same discipline as every other named exception here.
//
// `skills` joined it 2026-09-26: the published skills carrier (resources only — no code). An
// early design draft assumed this package would ship BUSL-1.1 with a per-file header and a
// NOTICE line inside the Apache CLI that bundles a copy; checking the Java reference repository's
// own `licensing.properties` and its actual built jars — no per-file header on any
// SKILL.md/catalogue.json page, licence recorded once at the jar's own META-INF — found that
// premise false: Java's carrier is Apache-2.0 end to end, in both homes, with no BUSL content and
// so no mixed-licence artifact at all. This package mirrors what Java actually ships, the same
// `open`-tier classification, rather than the draft's mistaken premise.
//
// `tooling` joined it 2026-09-26: the library the Apache CLI is a launcher over (Phase 3 design
// D3 as ruled — the doctor's checks and the skills installer, zero dependencies). Same
// classification as the CLI it serves and as Java's own `module.narrativetrace-tooling=open`;
// a package cannot be more restrictively licensed than the artifact that exists only to call it.
export const OPEN_TIER_PACKAGES: ReadonlySet<string> = new Set(["cli", "skills", "tooling"]);

/** The licence `dir` (a `packages/<dir>` coordinate) must declare. */
export function expectedLicense(dir: string): string {
  return OPEN_TIER_PACKAGES.has(dir) ? OPEN_LICENSE : RUNTIME_LICENSE;
}
