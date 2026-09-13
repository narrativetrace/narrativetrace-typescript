// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { collectTaskMeta, type WalkableTask } from "../src/task-meta-walk.js";

interface Shape {
  value?: string;
}

function task(value?: string, tasks?: WalkableTask<Shape>[]): WalkableTask<Shape> {
  return { meta: value !== undefined ? { value } : undefined, tasks };
}

describe("collectTaskMeta", () => {
  test("gathers meta from nested tasks across files in traversal order", () => {
    const files = [{ tasks: [task("A"), task("B")] }, { tasks: [{ tasks: [task("C")] }] }];
    expect(collectTaskMeta(files, (m) => m?.value)).toStrictEqual(["A", "B", "C"]);
  });

  test("tasks without the read value are skipped", () => {
    const files = [{ tasks: [task(undefined), task("x")] }];
    expect(collectTaskMeta(files, (m) => m?.value)).toStrictEqual(["x"]);
  });

  test("an empty file list yields an empty result", () => {
    expect(collectTaskMeta<Shape, string>([], (m) => m?.value)).toStrictEqual([]);
  });

  test("a task with no children is a leaf, not an error", () => {
    expect(collectTaskMeta([task("A")], (m) => m?.value)).toStrictEqual(["A"]);
  });
});
