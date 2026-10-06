// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { parseInstallerArguments } from "../src/installer-arguments.js";

describe("parseInstallerArguments", () => {
  // The MESSAGE, not just the type: without the guard, `args.length` throws a TypeError of its own,
  // so a type-only assertion passes whether the guard is there or not (found by the mutation run).
  test("refuses no argument list at all — the guard a caller trips, never a command line", () => {
    expect(() => parseInstallerArguments(undefined as unknown as string[])).toThrow(
      "a command line is a list of arguments, never null",
    );
  });

  test("no arguments is the installer library's own defaults", () => {
    const parsed = parseInstallerArguments([]);

    expect(parsed.options).toEqual({
      dryRun: false,
      writeExisting: false,
      force: false,
      scope: "both",
      vendorClaude: "auto",
    });
    expect(parsed.from).toBeUndefined();
    expect(parsed.json).toBe(false);
    expect(parsed.help).toBe(false);
    expect(parsed.error).toBeUndefined();
  });

  test("each switch turns on exactly its own option", () => {
    const parsed = parseInstallerArguments(["--dry-run", "--write-existing", "--force", "--json"]);

    expect(parsed.options.dryRun).toBe(true);
    expect(parsed.options.writeExisting).toBe(true);
    expect(parsed.options.force).toBe(true);
    expect(parsed.json).toBe(true);
    expect(parsed.error).toBeUndefined();
  });

  test.each(["--help", "-h"])("%s asks for the verb's usage", (flag) => {
    expect(parseInstallerArguments([flag]).help).toBe(true);
  });

  test("a value flag written `--flag value` consumes the argument after it", () => {
    const parsed = parseInstallerArguments([
      "--only",
      "skills",
      "--vendor",
      "claude",
      "--from",
      "/carriers/skills",
    ]);

    expect(parsed.options.scope).toBe("skills");
    expect(parsed.options.vendorClaude).toBe("on");
    expect(parsed.from).toBe("/carriers/skills");
    expect(parsed.error).toBeUndefined();
  });

  test("a value flag written `--flag=value` carries its own value", () => {
    const parsed = parseInstallerArguments([
      "--only=agents-md",
      "--vendor=none",
      "--from=/carriers/skills",
    ]);

    expect(parsed.options.scope).toBe("agents-md");
    expect(parsed.options.vendorClaude).toBe("off");
    expect(parsed.from).toBe("/carriers/skills");
    expect(parsed.error).toBeUndefined();
  });

  test("a `--from=` value keeps every `=` after the first — a path may carry one", () => {
    expect(parseInstallerArguments(["--from=/carriers/a=b"]).from).toBe("/carriers/a=b");
  });

  test("an unknown option is reported verbatim, as typed", () => {
    expect(parseInstallerArguments(["--nope"]).error).toBe('unknown option: "--nope"');
    expect(parseInstallerArguments(["--nope=1"]).error).toBe('unknown option: "--nope=1"');
  });

  test("a bare word that is not a flag is an unknown option too", () => {
    expect(parseInstallerArguments(["skills"]).error).toBe('unknown option: "skills"');
  });

  // A flag table looked up by name must not answer for a name it does not hold. With a plain object
  // there, `init toString` read as a KNOWN switch (accepted, and the install applied) and
  // `init __proto__` crashed with "turnOn is not a function" — both reproduced against the built bin
  // before this test existed.
  test.each([
    "toString",
    "__proto__",
    "constructor",
    "valueOf",
    "hasOwnProperty",
  ])("%s is an unknown option, not something Object.prototype answers for", (argument) => {
    const parsed = parseInstallerArguments([argument]);

    expect(parsed.error).toBe(`unknown option: "${argument}"`);
    expect(parsed.help).toBe(false);
    expect(parsed.options.force).toBe(false);
  });

  test("--__proto__=x is an unknown option as well, whichever half is inherited", () => {
    expect(parseInstallerArguments(["--__proto__=x"]).error).toBe(
      'unknown option: "--__proto__=x"',
    );
  });

  test.each(["--only", "--vendor", "--from"])("%s at the end of the line needs a value", (flag) => {
    expect(parseInstallerArguments([flag]).error).toBe(`${flag} needs a value`);
  });

  test.each([
    "--only=",
    "--vendor=",
    "--from=",
  ])("%s gives an empty value, which is none", (arg) => {
    expect(parseInstallerArguments([arg]).error).toBe(`${arg.slice(0, -1)} needs a value`);
  });

  test("a value outside the two each flag takes is named with what was typed", () => {
    expect(parseInstallerArguments(["--only", "everything"]).error).toBe(
      '--only takes skills or agents-md, got "everything"',
    );
    expect(parseInstallerArguments(["--vendor", "cursor"]).error).toBe(
      '--vendor takes claude or none, got "cursor"',
    );
  });

  test("`--only both` is not a spelling: the default needs no flag", () => {
    expect(parseInstallerArguments(["--only", "both"]).error).toBe(
      '--only takes skills or agents-md, got "both"',
    );
  });

  test("the FIRST problem is the one reported — a later flag names one nobody has read yet", () => {
    expect(parseInstallerArguments(["--nope", "--only", "everything"]).error).toBe(
      'unknown option: "--nope"',
    );
  });

  test("a flag read before a bad one still took effect, so the error is all a caller may use", () => {
    const parsed = parseInstallerArguments(["--dry-run", "--nope"]);

    expect(parsed.options.dryRun).toBe(true);
    expect(parsed.error).toBe('unknown option: "--nope"');
  });

  // Two refusals the Java parser does not make, both about a misread that would APPLY where the
  // person asked to preview. Deviations, recorded in TODO §38 with the reason.

  test.each([
    "--force=false",
    "--dry-run=no",
    "--write-existing=0",
    "--json=off",
  ])("%s is refused rather than read as the switch alone", (argument) => {
    const parsed = parseInstallerArguments([argument]);

    expect(parsed.error).toBe(`${argument.split("=")[0]} takes no value, got "${argument}"`);
    expect(parsed.options.force).toBe(false);
    expect(parsed.options.dryRun).toBe(false);
  });

  test("a value flag never swallows the flag after it", () => {
    const parsed = parseInstallerArguments(["--from", "--dry-run"]);

    expect(parsed.error).toBe(
      '--from needs a value, and "--dry-run" reads as the next flag — write --from=--dry-run if it' +
        " really is the value",
    );
    expect(parsed.from).toBeUndefined();
    // Refusing means not CONSUMING: the argument is left to be read as the flag it is, so nothing is
    // silently dropped. The verb exits 2 on the error either way, so no plan is made from it.
    expect(parsed.options.dryRun).toBe(true);
  });

  test("a value that merely starts with one dash is a value", () => {
    expect(parseInstallerArguments(["--from", "-carriers"]).from).toBe("-carriers");
  });

  test("`--from=--dry-run` takes it as the value it was spelled out to be", () => {
    const parsed = parseInstallerArguments(["--from=--dry-run"]);

    expect(parsed.from).toBe("--dry-run");
    expect(parsed.options.dryRun).toBe(false);
    expect(parsed.error).toBeUndefined();
  });
});
