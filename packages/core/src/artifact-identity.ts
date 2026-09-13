// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { toDirectorySlug, toInvocationFileSlug } from "./output-directory-resolver.js";
import { frameScenario } from "./scenario-framer.js";

/**
 * Which artifact one traced test invocation owns.
 *
 * INTENT: a test method is not the whole answer to "which file does this trace go in" the moment
 * the method runs more than once (a parameterized or repeated test) — every invocation would
 * otherwise write the same path, and the last one would win. This is the identity every per-test
 * artifact keys by: the trace, the JSON export, the diagram, the structural `.nt` artifact, and the
 * committed approved trace beside them. Port of Java `output.ArtifactIdentity` — the family's master
 * definition of the naming scheme; every runtime mirrors it byte for byte.
 *
 * - An ordinary test method keeps its bare method slug — `customerPlacesOrder` →
 *   `customer_places_order`.
 * - An invocation appends `-<index>-<label>`: the 1-based invocation index zero-padded to three
 *   digits, then the invocation's display name through the same slug rule, with runs of `_`
 *   collapsed and the ends trimmed — `equipment_can_be_found-001-find_kayak`. The label is dropped
 *   when it slugs to nothing.
 * - `-` is the separator precisely because the slug alphabet is `[a-z0-9_]` and can never produce
 *   one: an ordinary method can never collide with an invocation artifact.
 * - Two invocations of one method always differ in the index, so display names that differ only in
 *   characters a path cannot carry still land on different files. The index is what makes the scheme
 *   collision-proof; the label is what makes it readable.
 * - Nothing here varies per process or per run, so an approved trace recorded on one machine matches
 *   the artifact written on the next.
 */
export interface ArtifactIdentity {
  /** The test module (a class in Java/.NET terms; a test file in this port), qualified or bare. */
  readonly moduleName: string;
  /** The test's own name, shared by every invocation of it. */
  readonly testName: string;
  /** 1-based invocation number, or `0` for a method/test that runs once. */
  readonly invocationIndex: number;
  /** The invocation's display name, `""` when there is none. */
  readonly invocationLabel: string;
}

/** The identity of a test that runs exactly once — the artifact name it has always had. */
export function artifactIdentityOfMethod(moduleName: string, testName: string): ArtifactIdentity {
  return { moduleName, testName, invocationIndex: 0, invocationLabel: "" };
}

/**
 * The identity of one invocation of a test that runs more than once.
 *
 * @param invocationIndex 1-based, in the engine's invocation order.
 * @param invocationLabel the invocation's display name, used only for readability.
 * @throws {RangeError} if `invocationIndex` is not at least 1.
 */
export function artifactIdentityOfInvocation(
  moduleName: string,
  testName: string,
  invocationIndex: number,
  invocationLabel: string,
): ArtifactIdentity {
  if (invocationIndex < 1) {
    throw new RangeError(`invocationIndex is 1-based; got ${invocationIndex}`);
  }
  return { moduleName, testName, invocationIndex, invocationLabel };
}

/** Whether this identity names one invocation of a repeated test rather than a whole test. */
export function isInvocation(identity: ArtifactIdentity): boolean {
  return identity.invocationIndex > 0;
}

/** The artifact base name, without any format suffix: the scheme documented on {@link ArtifactIdentity}. */
export function fileSlug(identity: ArtifactIdentity): string {
  return toInvocationFileSlug(
    identity.testName,
    identity.invocationIndex,
    identity.invocationLabel,
  );
}

/** The per-module directory every artifact tree shares, under one sanitizing rule. */
export function moduleDirectorySlug(identity: ArtifactIdentity): string {
  return toDirectorySlug(identity.moduleName);
}

/**
 * The test's own name, without a label a test runner appended to it: JUnit 4's `Parameterized`
 * spells one invocation `equipmentCanBeFound[KAYAK]`, and a bracket can never appear in a bare test
 * name, so everything from the first one belongs to the runner.
 */
function bareTestName(identity: ArtifactIdentity): string {
  const bracket = identity.testName.indexOf("[");
  return bracket < 0 ? identity.testName : identity.testName.slice(0, bracket);
}

/**
 * The scenario title the value-free artifacts carry — a title no runtime value can reach.
 *
 * INTENT: the structural `.nt` artifact promises names, call hierarchy and outcome kinds and
 * nothing else, and its header used to be the display name. A parameterized test's name template
 * interpolates *arguments* into that display name, so one invocation's value-free artifact would
 * open with a runtime value — the one artifact whose whole point is carrying none. An invocation is
 * therefore titled by what the developer wrote (the test) and by which run it was (the index), never
 * by what it ran with.
 *
 * - An invocation is `<humanized test name> #<index>` — `Equipment can be found #2`.
 * - A test that runs once keeps its display name, so every committed approved trace stays
 *   byte-identical. When the caller has no display name of its own, a label a test runner appended
 *   to the bare test name (`equipmentCanBeFound[KAYAK]`) is dropped.
 *
 * The *file* name is a separate question and deliberately keeps the label: it is what tells two
 * invocations apart on disk. See {@link fileSlug}.
 *
 * @param displayName the runner's display name for this test; `undefined` means there is none.
 */
export function structuralScenario(identity: ArtifactIdentity, displayName?: string): string {
  if (isInvocation(identity)) {
    return `${frameScenario(bareTestName(identity))} #${identity.invocationIndex}`;
  }
  const title =
    displayName === undefined || displayName === identity.testName
      ? bareTestName(identity)
      : displayName;
  return frameScenario(title);
}
