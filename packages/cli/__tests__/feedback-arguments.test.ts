// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { FEEDBACK_CHANNELS, parseFeedbackArguments } from "../src/feedback-arguments.js";

const COMPLETE = [
  "draft",
  "--category",
  "doctor",
  "--step",
  "trap.redaction-proof",
  "--did",
  "ran the doctor",
  "--happened",
  "the check failed again",
  "--expected",
  "the check to pass",
];

/**
 * What `narrativetrace feedback` was asked to do, read out of the arguments that follow the verb
 * and nothing else — the same shape `parseInstallerArguments` has, for the same reason: every flag
 * decision stays a pure function, so the verb itself is a handful of lines over the library.
 */
describe("reading the feedback command line", () => {
  test("offers exactly the three channels the skill offers", () => {
    expect(FEEDBACK_CHANNELS).toEqual(["draft", "url", "gh"]);
  });

  test("reads the channel and the five mandatory fields", () => {
    const parsed = parseFeedbackArguments(COMPLETE);

    expect(parsed.error).toBeUndefined();
    expect(parsed.channel).toBe("draft");
    expect(parsed.category).toBe("doctor");
    expect(parsed.step).toBe("trap.redaction-proof");
    expect(parsed.did).toBe("ran the doctor");
    expect(parsed.happened).toBe("the check failed again");
    expect(parsed.expected).toBe("the check to pass");
  });

  test("defaults the language to English and the agent to unnamed", () => {
    const parsed = parseFeedbackArguments(COMPLETE);

    expect(parsed.language).toBe("en");
    expect(parsed.agentProduct).toBe("");
    expect(parsed.agentModel).toBe("");
    expect(parsed.trace).toBe("");
  });

  test("reads the optional fields when they are given", () => {
    const parsed = parseFeedbackArguments([
      ...COMPLETE,
      "--language=es",
      "--agent-product=example-cli",
      "--agent-model=example-model",
      "--trace=order.nt",
      "--json",
    ]);

    expect(parsed.language).toBe("es");
    expect(parsed.agentProduct).toBe("example-cli");
    expect(parsed.agentModel).toBe("example-model");
    expect(parsed.trace).toBe("order.nt");
    expect(parsed.json).toBe(true);
  });

  test("asks for a channel when none was named", () => {
    expect(parseFeedbackArguments([]).error).toMatch(/needs a channel: draft, url, gh/);
  });

  test("names an unknown channel rather than guessing one", () => {
    expect(parseFeedbackArguments(["send"]).error).toMatch(/unknown feedback channel: "send"/);
  });

  test("names each missing mandatory field, the first one first", () => {
    expect(parseFeedbackArguments(["draft"]).error).toMatch(/--category/);
    expect(parseFeedbackArguments(["draft", "--category=doctor"]).error).toMatch(/--step/);
    expect(parseFeedbackArguments(["draft", "--category=doctor", "--step=s"]).error).toMatch(
      /--did/,
    );
  });

  test("names an unknown category, since a silent fallback files into the wrong queue", () => {
    expect(parseFeedbackArguments(["draft", "--category=runtime"]).error).toMatch(
      /prompt, skill, doctor or library/,
    );
  });

  test("refuses an unknown option", () => {
    expect(parseFeedbackArguments([...COMPLETE, "--send"]).error).toMatch(
      /unknown option: "--send"/,
    );
  });

  test("refuses a value that reads as the next flag, and names the escape hatch", () => {
    expect(parseFeedbackArguments(["draft", "--step", "--json"]).error).toBe(
      '--step needs a value, and "--json" reads as the next flag — write --step=--json if it' +
        " really is the value",
    );
    expect(parseFeedbackArguments([...COMPLETE, "--step=--json"]).step).toBe("--json");
  });

  /** The refusal must not swallow the flag it refused to read: it is still that flag. */
  test("leaves the flag that looked like a value to be read as the flag it is", () => {
    const parsed = parseFeedbackArguments(["draft", "--step", "--json"]);

    expect(parsed.json).toBe(true);
  });

  /** A second bare word is not a replacement channel — the channel is the first argument only. */
  test("refuses a second bare word rather than letting it replace the channel", () => {
    const parsed = parseFeedbackArguments(["draft", "url"]);

    expect(parsed.channel).toBe("draft");
    expect(parsed.error).toBe('unknown option: "url"');
  });

  test("refuses a mandatory field that is only whitespace", () => {
    for (const flag of ["--step", "--did", "--happened", "--expected"]) {
      const parsed = parseFeedbackArguments([...COMPLETE, `${flag}=   `]);
      expect(parsed.error, flag).toBe(`${flag} is required — a report without it says nothing`);
    }
  });

  test("asks for the value of a flag that ends the command line", () => {
    expect(parseFeedbackArguments(["draft", "--step"]).error).toBe("--step needs a value");
    expect(parseFeedbackArguments(["draft", "--step="]).error).toBe("--step needs a value");
  });

  test("refuses a switch given a value", () => {
    expect(parseFeedbackArguments([...COMPLETE, "--json=false"]).error).toMatch(/takes no value/);
  });

  test("answers --help without asking for any field", () => {
    for (const flag of ["--help", "-h"]) {
      const parsed = parseFeedbackArguments([flag]);
      expect(parsed.help).toBe(true);
      expect(parsed.error).toBeUndefined();
    }
  });

  test("keeps every `=` after the first, so a value may contain one", () => {
    expect(parseFeedbackArguments([...COMPLETE, "--step=value=with=equals"]).step).toBe(
      "value=with=equals",
    );
  });

  /** A repeated flag is a plausible mistake, and "the last one wins" is the decision, not an accident. */
  test("the last occurrence of a repeated flag is the one that counts", () => {
    const parsed = parseFeedbackArguments([...COMPLETE, "--category=skill", "--category=prompt"]);

    expect(parsed.category).toBe("prompt");
    expect(parsed.error).toBeUndefined();
  });

  test("does not trim a whitespace-only category into a valid one", () => {
    expect(parseFeedbackArguments([...COMPLETE, "--category=   "]).error).toMatch(
      /unknown category/,
    );
  });

  test("reads an argument list, never null, and says so in its own words", () => {
    for (const absent of [null, undefined]) {
      expect(() => parseFeedbackArguments(absent as unknown as string[])).toThrow(
        "a command line is a list of arguments, never null",
      );
    }
  });

  test("builds the report these arguments and this project describe", () => {
    const parsed = parseFeedbackArguments([...COMPLETE, "--agent-product=example-cli"]);

    const report = parsed.report("@narrativetrace/core@0.2.0", {
      doctorReport: '{"findings":[]}',
      doctorUnavailable: "",
      structuralTrace: "",
    });

    expect(report.runtime).toBe("typescript");
    expect(report.category.id).toBe("doctor");
    expect(report.install).toBe("@narrativetrace/core@0.2.0");
    expect(report.agent).toEqual({ product: "example-cli", model: "" });
  });

  /**
   * The report's own defaults are the parsed ones, not a second set: reading the value map twice
   * gave `parsed.language` and the report's language independent defaults, and a mutant that
   * emptied one of them survived because nothing compared the two.
   */
  test("the report's fields are the parsed fields, defaults included", () => {
    const parsed = parseFeedbackArguments(COMPLETE);

    const report = parsed.report("coordinate", {
      doctorReport: '{"findings":[]}',
      doctorUnavailable: "",
      structuralTrace: "",
    });

    expect(report.language).toBe(parsed.language);
    expect(report.language).toBe("en");
    expect(report.step).toBe(parsed.step);
    expect(report.agent).toEqual({ product: parsed.agentProduct, model: parsed.agentModel });
    expect(report.narrative).toEqual({
      did: parsed.did,
      happened: parsed.happened,
      expected: parsed.expected,
    });
  });
});
