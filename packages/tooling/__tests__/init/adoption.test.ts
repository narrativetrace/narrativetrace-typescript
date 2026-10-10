// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { isAdoptable } from "../../src/init/adoption.js";
import { fakePage } from "./fixtures.js";

/**
 * The one comparison that decides whether a page nobody stamped is nevertheless ours (design D5,
 * rule 17). Every near miss is a row here and every one of them stays a refusal, because the refusal
 * is what protects somebody's edit and somebody's other release.
 *
 * Named after `AdoptionTest` in the Java reference so the two lists diff.
 */

const RENDERED = fakePage("a", "agents");

describe("a page a registry installed", () => {
  test("is adoptable when it is this carrier's rendering byte for byte", () => {
    expect(isAdoptable(RENDERED, RENDERED)).toBe(true);
  });

  test("is adoptable when only the line ending differs", () => {
    expect(isAdoptable(RENDERED.replaceAll("\n", "\r\n"), RENDERED)).toBe(true);
    expect(isAdoptable(RENDERED, RENDERED.replaceAll("\n", "\r\n"))).toBe(true);
  });

  test("reads a lone carriage return as a line ending too", () => {
    expect(isAdoptable(RENDERED.replaceAll("\n", "\r"), RENDERED)).toBe(true);
  });

  test("is not adoptable with one trailing space added", () => {
    expect(isAdoptable(RENDERED.replace("name: a", "name: a "), RENDERED)).toBe(false);
  });

  test("is not adoptable with a reordered frontmatter key", () => {
    const reordered = "---\ndescription: d-a\nname: a\n---\n\n# a (agents)\n";

    expect(isAdoptable(reordered, RENDERED)).toBe(false);
  });

  test("is not adoptable with the final newline lost", () => {
    expect(isAdoptable(RENDERED.trimEnd(), RENDERED)).toBe(false);
  });

  test("is not adoptable when it is another release's wording", () => {
    expect(isAdoptable(RENDERED.replace("# a (agents)", "# a (agents) v2"), RENDERED)).toBe(false);
  });

  test("is not adoptable when it is the other flavour's page", () => {
    expect(isAdoptable(fakePage("a", "claude"), RENDERED)).toBe(false);
  });

  test("is never adoptable when there is no page at all", () => {
    expect(isAdoptable("", "")).toBe(false);
    expect(isAdoptable("", RENDERED)).toBe(false);
  });

  test("refuses to compare something that is not a page", () => {
    expect(() => isAdoptable(undefined as never, RENDERED)).toThrow(TypeError);
    expect(() => isAdoptable(RENDERED, undefined as never)).toThrow(TypeError);
  });
});
