// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { generateRunIdentity } from "../src/run-identity.js";
import { isValidTraceId } from "../src/span-id-generator.js";
import { humanName } from "../src/trace-namer.js";

describe("generateRunIdentity", () => {
  test("id is a well-formed, W3C-shaped trace id (borrowed shape, not a trace)", () => {
    const run = generateRunIdentity();
    expect(isValidTraceId(run.id)).toBe(true);
  });

  test("name is the same three-word phrase humanName derives from the id", () => {
    const run = generateRunIdentity();
    expect(run.name).toBe(humanName(run.id as Parameters<typeof humanName>[0]));
  });

  test("two calls generate two distinct identities, not one reused", () => {
    const first = generateRunIdentity();
    const second = generateRunIdentity();
    expect(first.id).not.toBe(second.id);
  });
});
