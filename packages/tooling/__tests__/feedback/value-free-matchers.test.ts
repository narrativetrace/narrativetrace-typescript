// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { namesASecret } from "../../src/feedback/secret-vocabulary.js";
import {
  assignedKeys,
  control,
  duration,
  email,
  entropy,
  homePath,
  marker,
  REDACTION_MARKER,
  renderedCall,
  renderedOutcome,
} from "../../src/feedback/value-free-matchers.js";

/**
 * The deciding predicates on their own, over the cases the shared corpus does NOT carry: the
 * adjacency property of the deny-list scan, the boundaries of each length and density floor, and
 * the characters each rule deliberately lets through.
 *
 * INTENT: the corpus is the cross-runtime contract and asserts one verdict per row; these are the
 * port's own margins. A rule that passes every corpus row and still eats the first letter of the
 * next token is a rule whose one real-world input — an indented configuration paste — nobody
 * tested.
 */

/** A deny-listed key is only ever "found" here through the scan, never by searching the text. */
function deniedKeyIn(text: string): boolean {
  return assignedKeys(text).some(namesASecret);
}

describe("the keyed-assignment scan", () => {
  test("never consumes any part of the next token", () => {
    expect(assignedKeys("spring:\n  datasource:\n    password: hunter2")).toEqual([
      "spring",
      "datasource",
      "password",
    ]);
  });

  test("reads a key through its surrounding quotes, which is how JSON writes one", () => {
    expect(assignedKeys('{"datasource": {"password": "hunter2"}}')).toEqual([
      "datasource",
      "password",
    ]);
  });

  test("captures a decomposed key whole, marks included", () => {
    const decomposed = `contrasen${String.fromCodePoint(0x0303)}a`;

    expect(assignedKeys(`${decomposed}: ada-2026`)).toEqual([decomposed]);
    expect(deniedKeyIn(`${decomposed}: ada-2026`)).toBe(true);
  });

  test("reads a key assigned with an equals sign as well as a colon", () => {
    expect(assignedKeys("userPassword=hunter2")).toEqual(["userPassword"]);
  });

  test("ignores a key with nothing assigned to it", () => {
    expect(assignedKeys("password:")).toEqual([]);
    expect(assignedKeys("password: ")).toEqual([]);
  });

  test("leaves a deny-listed word that is prose rather than a key alone", () => {
    expect(deniedKeyIn("the authorization header: it never arrived at all")).toBe(false);
  });

  test("stops at eighty characters, so one pathological line cannot drive the scan", () => {
    expect(assignedKeys(`${"k".repeat(81)}: v`)).toEqual(["k".repeat(80)]);
  });
});

describe("the rendered-artifact rules", () => {
  test("a qualified call line carrying a bound value is a rendered call", () => {
    expect(renderedCall('OrderService.placeOrder(customerId: "C-1234")')).toBe(true);
  });

  test("a structural call line carrying only parameter names is not", () => {
    expect(renderedCall("- OrderService.placeOrder(customerId, total)")).toBe(false);
  });

  test.each([
    ["**", '- **OrderService.placeOrder**(customerId: `"C-1234"`)'],
    ["__", '- __OrderService.placeOrder__(customerId: "C-1234")'],
    ["*", '- *OrderService.placeOrder*(customerId: "C-1234")'],
    ["_", '- _OrderService.placeOrder_(customerId: "C-1234")'],
  ])("a call line whose qualified name is emphasised with %s is still a rendered call", (_marker, line) => {
    expect(renderedCall(line)).toBe(true);
  });

  test("an emphasised call line carrying only parameter names is not a rendered call", () => {
    expect(renderedCall("- **OrderService.placeOrder**(customerId, total)")).toBe(false);
  });

  test("a stray mixed pair of emphasis markers counts as one marker: the deny rule only gets stricter", () => {
    expect(renderedCall('- *_OrderService.placeOrder*_(customerId: "C-1234")')).toBe(true);
  });

  test("two emphasis markers in a row are not one: the rule allows exactly one", () => {
    expect(renderedCall('- **A.b*****(c: "x")')).toBe(false);
  });

  test("an unqualified hand-typed fragment is a known limit, not a rendered call", () => {
    expect(renderedCall('placeOrder(id: "C-1")')).toBe(false);
  });

  test("the structural outcome literal is the only thing the arrow may carry", () => {
    expect(renderedOutcome("- A.b(c) → value")).toBe(false);
    expect(renderedOutcome('- A.b(c) → "ORD-9001"')).toBe(true);
    expect(renderedOutcome("- A.b(c) → values")).toBe(true);
  });

  test("this port's own cycle marker rides behind the structural outcome without tripping it", () => {
    expect(renderedOutcome("- A.b(c) → value … (cycle)")).toBe(false);
  });

  test("a duration is a number with a time unit behind an em dash", () => {
    expect(duration("- A.b(c) — 1ms")).toBe(true);
    expect(duration("- A.b(c) — 1.5 s")).toBe(true);
    expect(duration("twelve checks — 2 findings")).toBe(false);
  });

  test("the marker rule keys on the literal the renderer writes", () => {
    expect(marker(`password: ${REDACTION_MARKER}`)).toBe(true);
    expect(marker("password: redacted")).toBe(false);
  });
});

describe("the entropy rule", () => {
  test("refuses a hex run at the length floor and accepts the word below it", () => {
    expect(entropy("a3f5c8e9d2b14706a3f5c8e9d2b14706")).toBe(true);
    expect(entropy("a3f5c8e9d2b14706a3f5c8e9d2b1470")).toBe(false);
  });

  test("lets this project's own structural artifact path through", () => {
    expect(entropy("narrativetrace-output/structural/OrderServiceTest/order_is_placed.nt")).toBe(
      false,
    );
  });

  /**
   * Every doc URL this port's doctor emits, which is why the slash is not a run character: joined,
   * their path segments measure 3.99 to 4.03 bits per character — across the ceiling — while no
   * segment of one exceeds 3.4. Found by generating a real doctor report rather than paraphrasing
   * one, and the first four of these were FILABLE while the last four were not.
   */
  test.each([
    "installation-guide.md#prerequisites",
    "configuration-guide.md#2-vitest-configuration",
    "troubleshooting.md#no-trace-files-are-written",
    "privacy-and-redaction.md#redaction-surface-by-surface",
    "structural-trace-format.md#approval-traces-end-to-end",
    "sixty-seconds.md#1-new-project-add-the-packages",
    "agent-skills.md#installing-them",
  ])("lets a finding's own doc URL through: %s", (tail) => {
    const url = `https://github.com/narrativetrace/narrativetrace-typescript/blob/main/documentation/${tail}`;

    expect(entropy(url), url).toBe(false);
  });

  test("still refuses a dense run that merely happens to sit inside a path", () => {
    expect(entropy("narrativetrace-output/Zm9vYmFyYmF6cXV1eHdhbGRvZnJlZG1pbmU9/x")).toBe(true);
  });

  test("lets a hyphenated sentence through, because the hyphen is not a run character", () => {
    expect(entropy("the-quick-brown-fox-jumps-over-the-lazy-dog")).toBe(false);
  });

  test("answers the same way twice, so no pattern carries state between calls", () => {
    const dense = "Zm9vYmFyYmF6cXV1eHdhbGRvZnJlZG1pbmU9";

    expect(entropy(dense)).toBe(true);
    expect(entropy(dense)).toBe(true);
  });
});

describe("the personal-data and transport rules", () => {
  test("an address in prose is an address; a scoped package name is not", () => {
    expect(email("ada@example.com saw it first")).toBe(true);
    expect(email("@narrativetrace/core@0.2.0 is installed")).toBe(false);
  });

  test("a home directory needs a platform root and an account segment", () => {
    expect(homePath("/Users/ada/work/orders")).toBe(true);
    expect(homePath("/home/ada/work/orders")).toBe(true);
    expect(homePath("C:\\Users\\ada\\work")).toBe(true);
    expect(homePath("/home")).toBe(false);
    expect(homePath("~/work/orders")).toBe(false);
    expect(homePath("narrativetrace-output/structural")).toBe(false);
  });

  test("the two whitespace characters a report legitimately carries pass", () => {
    expect(control("did:\n\tran the doctor twice")).toBe(false);
  });

  test("a bidi override is a control character even though it is not a C0 one", () => {
    expect(control(`trap.${String.fromCodePoint(0x202e)}redaction-proof`)).toBe(true);
  });

  test("a zero-width joiner is NOT, because it is a letter in several scripts", () => {
    expect(control(`hindi ${String.fromCodePoint(0x200d)} text`)).toBe(false);
  });
});
