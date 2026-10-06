// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { compareVersions, parseVersion, satisfiesRange } from "../src/semver-lite.js";

const versionArb = fc
  .tuple(fc.nat(50), fc.nat(50), fc.nat(50))
  .map(([major, minor, patch]) => ({ major, minor, patch }));

describe("semver-lite properties", () => {
  test("every version satisfies >= itself", () => {
    fc.assert(
      fc.property(versionArb, (v) => {
        const raw = `${v.major}.${v.minor}.${v.patch}`;
        expect(satisfiesRange(raw, `>=${raw}`)).toBe(true);
      }),
    );
  });

  test("compareVersions is antisymmetric", () => {
    fc.assert(
      fc.property(versionArb, versionArb, (a, b) => {
        const cmp = compareVersions(a, b);
        const reverse = compareVersions(b, a);
        expect(Math.sign(cmp)).toBe(-Math.sign(reverse));
      }),
    );
  });

  test("a caret range never matches a different major", () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(50), (baseMajor, offset) => {
        fc.pre(offset > 0);
        const version = `${baseMajor + offset}.0.0`;
        expect(satisfiesRange(version, `^${baseMajor}.0.0`)).toBe(false);
      }),
    );
  });

  test("round-tripping a version through parseVersion and back never throws", () => {
    fc.assert(
      fc.property(versionArb, (v) => {
        const raw = `${v.major}.${v.minor}.${v.patch}`;
        expect(parseVersion(raw)).toEqual(v);
      }),
    );
  });
});
