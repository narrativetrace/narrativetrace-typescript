// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { toTilde } from "../../src/feedback/home-paths.js";
import { looksStructural } from "../../src/feedback/structural-trace.js";
import { STRUCTURAL_TRACE } from "./reports.js";

describe("rewriting a home directory", () => {
  test("replaces the account segment and keeps everything after it", () => {
    expect(toTilde("/Users/ada/work/orders")).toBe("~/work/orders");
    expect(toTilde("/home/ada/work/orders")).toBe("~/work/orders");
    expect(toTilde("C:\\Users\\ada\\work")).toBe("~\\work");
  });

  test("rewrites every occurrence, because a report names a path in every sentence", () => {
    expect(toTilde("/home/ada/a and /Users/bo/b")).toBe("~/a and ~/b");
  });

  test("leaves a path that is not a home directory exactly as it is", () => {
    expect(toTilde("/home")).toBe("/home");
    expect(toTilde("/usr/share/ada")).toBe("/usr/share/ada");
    expect(toTilde("narrativetrace-output/structural")).toBe("narrativetrace-output/structural");
  });

  /**
   * Found by the adversarial pass: without a boundary the global flag rewrote a root INSIDE a path
   * it had already rewritten, so `/home/ada/home/bob/file` became `~~/file` and lost the two
   * directory names between the roots. Safe (it named nobody) and wrong.
   */
  test("rewrites only the outermost root, not one nested inside a path it already rewrote", () => {
    expect(toTilde("/home/ada/home/bob/file")).toBe("~/home/bob/file");
    expect(toTilde("/Users/ada/Users/bob/file")).toBe("~/Users/bob/file");
  });

  test("leaves a directory that merely happens to be called home or Users", () => {
    expect(toTilde("build/home/ada/x")).toBe("build/home/ada/x");
    expect(toTilde("~/home/ada/x")).toBe("~/home/ada/x");
  });

  test("still rewrites a root inside a URL, where the separator really is a separator", () => {
    expect(toTilde("file:///home/ada/x")).toBe("file://~/x");
  });

  test("is idempotent: rewriting already-rewritten text changes nothing", () => {
    for (const text of ["/home/ada/home/bob/file", "/Users/ada/a and /home/bo/b", "~/work"]) {
      expect(toTilde(toTilde(text)), text).toBe(toTilde(text));
    }
  });

  test("answers the same way twice, so the global pattern carries no state between calls", () => {
    expect(toTilde("/home/ada/work")).toBe("~/work");
    expect(toTilde("/home/ada/work")).toBe("~/work");
  });

  test("produces text the home-path rule then accepts, or the draft would refuse itself", () => {
    expect(toTilde("/Users/ada/work")).toBe("~/work");
  });

  test("reads text, never null, and says so in its own words", () => {
    for (const absent of [null, undefined, 7]) {
      expect(() => toTilde(absent as unknown as string)).toThrow(
        'the rewriter reads text, never null — an absent field is ""',
      );
    }
  });
});

/**
 * The grammar of the one artifact a report may attach. Defence in depth over the value-free rules,
 * not a substitute: the rules decide about TEXT, this decides about a FILE's claim to be a `.nt`.
 */
describe("the structural-trace grammar", () => {
  test("accepts what this port's own renderer writes, markers and all", () => {
    expect(looksStructural(STRUCTURAL_TRACE)).toBe(true);
  });

  test("accepts each outcome the format defines", () => {
    expect(looksStructural("scenario: S\n\n- A.b(c)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) → value")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) !! RangeError")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) ?? incomplete")).toBe(true);
  });

  test("accepts this port's own concurrency and walk markers", () => {
    expect(looksStructural("scenario: S\n\n~ fork [2]\n- A.b(c)")).toBe(true);
    expect(looksStructural("scenario: S\n\n~ async [2]\n- A.b(c)")).toBe(true);
    expect(looksStructural("scenario: S\n\n~ fire-and-forget\n- A.b(c)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) … (cycle)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) → value … (depth limit)")).toBe(true);
  });

  test("refuses a file with no scenario header, whatever else it contains", () => {
    expect(looksStructural("- A.b(c)")).toBe(false);
    expect(looksStructural("scenario: \n\n- A.b(c)")).toBe(false);
    expect(looksStructural("")).toBe(false);
  });

  test("refuses a rendered narrative wearing the .nt name", () => {
    expect(looksStructural('scenario: S\n\n- A.b(c: "C-1") → "ORD-9001" — 1ms')).toBe(false);
  });

  test("refuses a line that is not a call, a marker or blank", () => {
    expect(looksStructural("scenario: S\n\nsome prose about the run")).toBe(false);
    expect(looksStructural("scenario: S\n\n- b(c)")).toBe(false);
    expect(looksStructural("scenario: S\n\n- A.b(c; d)")).toBe(false);
    expect(looksStructural("scenario: S\n\n- A.b(c) !! not a type name")).toBe(false);
    expect(looksStructural("scenario: S\n\n- A.b")).toBe(false);
  });

  /** A parameter name may carry digits — `arg0` is what this runtime writes when names are lost. */
  test("accepts a parameter name with digits in it", () => {
    expect(looksStructural("scenario: S\n\n- A.b(arg0, arg1)")).toBe(true);
  });

  test("accepts the dollar sign a transpiled or generated identifier carries", () => {
    expect(looksStructural("scenario: S\n\n- A.$method(c$1)")).toBe(true);
  });

  /**
   * A project may be written in any language — the deny-list reads five of them and reports may be
   * in any. An ASCII-only identifier class made the whole file "not a structural trace", so such a
   * project could never attach a trace at all.
   */
  test("accepts identifiers in a non-Latin script, which a real project may be written in", () => {
    expect(looksStructural("scenario: S\n\n- 注文Service.注文する(顧客id, 合計)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- Pedido.processar(número, señor)")).toBe(true);
  });

  test("still refuses a value beside a non-Latin parameter name", () => {
    expect(looksStructural('scenario: S\n\n- 注文Service.注文する(顧客id: "C-1")')).toBe(false);
  });

  /** An empty parameter list may carry spaces: the format writes `()`, and neither is a value. */
  test("accepts a parameter list that is empty or only spaces", () => {
    expect(looksStructural("scenario: S\n\n- A.b()")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(   )")).toBe(true);
  });

  test("accepts an outcome and a walk marker together, which is what a stopped leaf writes", () => {
    expect(looksStructural("scenario: S\n\n- A.b(c) ?? incomplete … (depth limit)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c) !! RangeError … (cycle)")).toBe(true);
  });

  /**
   * A REVERSED decision (Phase 7, Java cross-port item 2). This used to be pinned as a refusal on
   * the premise that a `.nt` whose line endings a checkout rewrote was a corrupted artifact whose
   * approval diff was already failing. The structural delta now compares LINES, terminators set
   * aside, so that premise is gone: a CRLF checkout is the same trace, and the grammar is per line.
   * The value-free rules still decide about the bytes (`vf.control` refuses a carriage return).
   */
  test("reads a trace whose line endings a checkout rewrote", () => {
    expect(looksStructural("scenario: S\r\n\r\n- A.b(c)")).toBe(true);
    expect(looksStructural("scenario: S\n\n- A.b(c)")).toBe(true);
  });

  test("refuses a second header, because a trace is one scenario", () => {
    expect(looksStructural("scenario: First\nscenario: Second\n\n- A.b(c)")).toBe(false);
  });

  test("reads content, never null, and says so in its own words", () => {
    for (const absent of [null, undefined, 7]) {
      expect(() => looksStructural(absent as unknown as string)).toThrow(
        'the grammar check reads content, never null — an absent file is ""',
      );
    }
  });

  /** Both halves of the parenthesis guard: no open paren at all, and a close before the open. */
  test("refuses a call line whose parentheses are missing or inverted", () => {
    expect(looksStructural("scenario: S\n\n- A.b")).toBe(false);
    expect(looksStructural("scenario: S\n\n- A.b)c(")).toBe(false);
    expect(looksStructural("scenario: S\n\n- (A.b)")).toBe(false);
  });

  test("accepts call and marker lines cited by span ids", () => {
    expect(
      looksStructural(
        "scenario: Weekend trip settles with three transfers\n\n" +
          "#1 - TripSettlementService.settleTrip(tripName) → value\n" +
          "  #1.1 - TripLedger.expensesOf(tripName) !! IllegalStateException\n" +
          "  ~ fork [2]\n" +
          "    #1.2 - BalanceCalculator.computeBalances(expenses) ?? incomplete\n" +
          "  #1.4 ~ fire-and-forget\n" +
          "    #1.4.1 - Notifier.send(event)\n",
      ),
    ).toBe(true);
  });

  test("accepts span ids made of every digit, zero and nine included", () => {
    const trace =
      "scenario: s\n\n#10 - OrderService.placeOrder(customerId)\n  #10.9 - Stock.check(sku)\n";
    expect(looksStructural(trace)).toBe(true);
  });

  test.each([
    "#",
    "#1.",
    "#.1",
    "#1..2",
    "#a",
    "#1:value",
    "1.1",
  ])("refuses %s, which is not a dotted number path", (id) => {
    expect(looksStructural(`scenario: s\n\n${id} - OrderService.placeOrder(customerId)\n`)).toBe(
      false,
    );
  });

  test("refuses a line that is only an id", () => {
    expect(looksStructural("scenario: s\n\n#1\n  #1.2\n")).toBe(false);
  });

  test("refuses a line whose first token only looks like an id after its first character", () => {
    expect(looksStructural("scenario: s\n\nx1 - OrderService.placeOrder(customerId)\n")).toBe(
      false,
    );
  });

  test("reads a CRLF-terminated trace — a checkout's line ending is not a different file", () => {
    expect(looksStructural("scenario: s\r\n\r\n#1 - OrderService.placeOrder(customerId)\r\n")).toBe(
      true,
    );
  });
});
