// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildSnapshot } from "@narrativetrace/tooling";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../src/cli.js";
import { cleanSnapshot, snapshot } from "./fixture.js";

/**
 * `narrativetrace feedback`, through the launcher a person actually types.
 *
 * INTENT: the verb's whole job is that the decision stays the user's, so what is tested is what it
 * does NOT do: it opens no browser, runs no `gh`, makes no request, and writes nothing at all when a
 * value-free rule stands. The `gh` probe is injected, so all four of its outcomes are reachable
 * without a tool installed and WITHOUT STARTING A PROCESS in any test.
 */

const MANDATORY = [
  "--category",
  "doctor",
  "--step",
  "trap.redaction-proof",
  "--did",
  "ran the doctor and applied the fix it printed",
  "--happened",
  "the same check failed again with the same message",
  "--expected",
  "the check to pass once the test asserts the marker",
];

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

let project: string;

/** Everything the verb reads, with the `gh` probe and the snapshot the case cares about. */
function run(
  args: readonly string[],
  options: { gh?: boolean; snapshot?: ReturnType<typeof snapshot> } = {},
): Run {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(["feedback", ...args], {
    cwd: project,
    env: {},
    buildSnapshot: () => options.snapshot ?? cleanSnapshot({ cwd: project }),
    openCarrier: () => {
      throw new Error("the feedback verb must never open a carrier");
    },
    ghAuthenticated: () => options.gh ?? false,
    log: (message) => out.push(message),
    print: (text) => out.push(text),
    error: (message) => err.push(message),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function wrote(relative: string): boolean {
  return existsSync(join(project, relative));
}

function read(relative: string): string {
  return readFileSync(join(project, relative), "utf8");
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-feedback-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("the draft channel", () => {
  test("prints the whole draft and writes both files", () => {
    const result = run(["draft", ...MANDATORY]);

    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "# NarrativeTrace problem report (draft — nothing has been filed)",
    );
    expect(result.out).toContain("## What I did");
    expect(wrote("narrativetrace-output/feedback/feedback-draft.md")).toBe(true);
    expect(wrote("narrativetrace-output/feedback/feedback-body.md")).toBe(true);
  });

  test("says where it put them, so the user can paste the body without hunting", () => {
    const result = run(["draft", ...MANDATORY]);

    expect(result.out).toContain(
      "Written to narrativetrace-output/feedback/feedback-draft.md and" +
        " narrativetrace-output/feedback/feedback-body.md.",
    );
  });

  test("writes the draft it printed, byte for byte, and a body the draft contains", () => {
    const result = run(["draft", ...MANDATORY]);
    const draft = read("narrativetrace-output/feedback/feedback-draft.md");
    const body = read("narrativetrace-output/feedback/feedback-body.md");

    expect(result.out).toContain(draft);
    expect(draft).toContain(body);
  });

  test("attaches the doctor's report, generated here rather than read from a file", () => {
    run(["draft", ...MANDATORY]);

    expect(read("narrativetrace-output/feedback/feedback-body.md")).toContain(
      '"id": "trap.redaction-proof"',
    );
  });

  test("says why no structural trace was attached, rather than losing it silently", () => {
    const result = run(["draft", ...MANDATORY]);

    expect(result.out).toContain(
      "No structural trace attached: no structural trace was found under this project's output",
    );
  });

  test("attaches a structural trace the project has, and says nothing about one", () => {
    const traced = cleanSnapshot({
      cwd: project,
      outputFiles: new Map([
        [
          "narrativetrace-output/structural/order.nt",
          "scenario: Order is placed\n\n- OrderService.placeOrder(customerId, total) → value\n",
        ],
      ]),
    });

    const result = run(["draft", ...MANDATORY], { snapshot: traced });

    expect(result.out).not.toContain("No structural trace attached");
    expect(read("narrativetrace-output/feedback/feedback-body.md")).toContain(
      "- OrderService.placeOrder(customerId, total) → value",
    );
  });

  test("answers --json with the two file paths and the exit code in the envelope", () => {
    const result = run(["draft", "--json", ...MANDATORY]);
    const envelope = JSON.parse(result.out) as Record<string, unknown>;

    expect(envelope.verb).toBe("draft");
    expect(envelope.status).toBe("drafted");
    expect(envelope.runtime).toBe("typescript");
    expect(envelope.bodyFile).toBe("narrativetrace-output/feedback/feedback-body.md");
    expect(envelope.exitCode).toBe(0);
  });

  test("follows the project's own output directory when it moved", () => {
    const out: string[] = [];
    const code = runCli(["feedback", "draft", ...MANDATORY], {
      cwd: project,
      env: { NARRATIVETRACE_OUTPUT_DIR: "traces" },
      buildSnapshot: () => cleanSnapshot({ cwd: project }),
      openCarrier: () => {
        throw new Error("unreachable");
      },
      ghAuthenticated: () => false,
      log: (message) => out.push(message),
      print: (text) => out.push(text),
      error: () => undefined,
    });

    expect(code).toBe(0);
    expect(wrote("traces/feedback/feedback-draft.md")).toBe(true);
    expect(wrote("narrativetrace-output/feedback/feedback-draft.md")).toBe(false);
  });
});

describe("the url channel", () => {
  test("prints the pre-filled URL and how to use it, and opens nothing", () => {
    const result = run(["url", ...MANDATORY]);

    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "https://github.com/narrativetrace/narrativetrace-typescript/issues/new?",
    );
    expect(result.out).toContain("Open that in your own browser");
    expect(result.out).toContain("Filing on GitHub is public");
  });

  test("still writes the body file, because the user has to paste it", () => {
    run(["url", ...MANDATORY]);

    expect(wrote("narrativetrace-output/feedback/feedback-body.md")).toBe(true);
  });

  test("answers --json with the URL and the file to paste", () => {
    const envelope = JSON.parse(run(["url", "--json", ...MANDATORY]).out) as Record<
      string,
      unknown
    >;

    expect(envelope.verb).toBe("url");
    expect(envelope.status).toBe("ready");
    expect(String(envelope.url)).toContain("template=narrativetrace-report.yml");
  });
});

/**
 * All four outcomes of the probe, and not one of them starts a process: the seam is a function in
 * `CliDeps`, and these cases are the reason it is one.
 */
describe("the gh channel", () => {
  test("prints the exact line when gh is signed in, and never runs it", () => {
    const result = run(["gh", ...MANDATORY], { gh: true });

    expect(result.code).toBe(0);
    expect(result.out).toContain("gh issue create --repo narrativetrace/narrativetrace-typescript");
    expect(result.out).toContain("--body-file narrativetrace-output/feedback/feedback-body.md");
    expect(result.out).toContain("That line is printed, not run.");
    expect(result.out).toContain("Filing on GitHub is public");
  });

  test("offers the URL instead when gh is absent, and exits 1 rather than failing", () => {
    const result = run(["gh", ...MANDATORY], { gh: false });

    expect(result.code).toBe(1);
    expect(result.err).toBe(
      "gh is not installed or not signed in. Use `narrativetrace feedback url` instead: it needs" +
        " no tool and no credential beyond the browser you are already signed in to.",
    );
    expect(result.out).not.toContain("gh issue create");
  });

  test("answers --json on both outcomes, with the exit code in the envelope", () => {
    const ready = JSON.parse(run(["gh", "--json", ...MANDATORY], { gh: true }).out) as Record<
      string,
      unknown
    >;
    const unavailable = JSON.parse(
      run(["gh", "--json", ...MANDATORY], { gh: false }).err,
    ) as Record<string, unknown>;

    expect(ready).toMatchObject({ verb: "gh", status: "ready", exitCode: 0 });
    expect(unavailable).toMatchObject({ verb: "gh", status: "unavailable", exitCode: 1 });
  });

  /**
   * An envelope printed through `error`/`log` must not bring its own trailing newline: the process
   * binding adds one, and two in a row is a blank line in the middle of an agent's output.
   */
  test("an envelope on stderr brings no trailing newline of its own", () => {
    const unavailable = run(["gh", "--json", ...MANDATORY], { gh: false });

    expect(unavailable.err.endsWith("}")).toBe(true);
  });

  test("asks the probe only on the channel that needs it", () => {
    let asked = 0;
    const deps = {
      cwd: project,
      env: {},
      buildSnapshot: () => cleanSnapshot({ cwd: project }),
      openCarrier: () => {
        throw new Error("unreachable");
      },
      ghAuthenticated: () => {
        asked += 1;
        return true;
      },
      log: () => undefined,
      print: () => undefined,
      error: () => undefined,
    };

    runCli(["feedback", "draft", ...MANDATORY], deps);
    runCli(["feedback", "url", ...MANDATORY], deps);
    expect(asked).toBe(0);

    runCli(["feedback", "gh", ...MANDATORY], deps);
    expect(asked).toBe(1);
  });
});

describe("the gate, as the verb applies it", () => {
  test("refuses, names the rule, and writes nothing at all", () => {
    const result = run([
      "draft",
      ...MANDATORY.slice(0, 4),
      "--did",
      'OrderService.placeOrder(customerId: "C-1234")',
      "--happened",
      "it failed",
      "--expected",
      "it to pass",
    ]);

    expect(result.code).toBe(2);
    expect(result.err).toContain("This report cannot be filed.");
    expect(result.err).toContain("did: vf.rendered-call");
    expect(result.err.endsWith("value")).toBe(true);
    expect(wrote("narrativetrace-output/feedback")).toBe(false);
  });

  test("answers --json on a refusal with every field, rule and reason", () => {
    const envelope = JSON.parse(
      run([
        "url",
        "--json",
        ...MANDATORY.slice(0, 4),
        "--did",
        "ada@example.com hit it",
        "--happened",
        "it failed",
        "--expected",
        "it to pass",
      ]).err,
    ) as { verb: string; violations: { field: string; rule: string }[]; exitCode: number };

    expect(envelope.verb).toBe("url");
    expect(envelope.exitCode).toBe(2);
    expect(envelope.violations).toEqual([
      { field: "did", rule: "vf.email", reason: expect.any(String) },
    ]);
  });

  test("a refusal envelope brings no trailing newline of its own either", () => {
    const refused = run([
      "url",
      "--json",
      ...MANDATORY.slice(0, 4),
      "--did",
      "ada@example.com hit it",
      "--happened",
      "it failed",
      "--expected",
      "it to pass",
    ]);

    expect(refused.err.endsWith("}")).toBe(true);
  });

  test("refuses a doctor report from a project whose doctor cannot run, and says what to do", () => {
    const unreadable = snapshot({ cwd: project, rootPackageJson: undefined });

    const result = run(["draft", ...MANDATORY], { snapshot: unreadable });

    expect(result.code).toBe(2);
    expect(result.err).toContain("needs the doctor's JSON report");
    expect(result.err).toContain("file this under prompt or library instead");
  });

  /**
   * Exit 1 is "the command was typed correctly and could not do the work", and the filesystem is
   * the only thing that can refuse once the gate has cleared. A plain FILE where the output
   * directory belongs is the one way to produce that without a permission trick that varies by
   * platform.
   */
  test("exits 1 when the filesystem refuses, having cleared the gate", () => {
    mkdirSync(join(project, "narrativetrace-output"), { recursive: true });
    writeFileSync(join(project, "narrativetrace-output/feedback"), "not a directory", "utf8");

    const result = run(["draft", ...MANDATORY]);

    expect(result.code).toBe(1);
    expect(result.err).not.toBe("");
  });

  test("lets a library report be filed from that same project", () => {
    const unreadable = snapshot({ cwd: project, rootPackageJson: undefined });

    const result = run(["draft", "--category", "library", ...MANDATORY.slice(2)], {
      snapshot: unreadable,
    });

    expect(result.code).toBe(0);
    expect(read("narrativetrace-output/feedback/feedback-body.md")).toContain(
      "No doctor report: the doctor could not run here",
    );
  });
});

describe("the command line", () => {
  test("prints the verb's usage for --help and exits 0", () => {
    const result = run(["--help"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("narrativetrace feedback <draft|url|gh> [options]");
    expect(result.out).toContain("Nothing is sent anywhere.");
  });

  test("names the missing flag and prints the usage, and exits 2", () => {
    const result = run(["draft"]);

    expect(result.code).toBe(2);
    expect(result.err).toContain("--category needs a value");
    expect(result.err).toContain("narrativetrace feedback <draft|url|gh> [options]");
  });

  test("is reachable from the top-level usage, so nobody has to know it exists", () => {
    const out: string[] = [];
    runCli(["--help"], {
      cwd: project,
      env: {},
      buildSnapshot: () => cleanSnapshot(),
      openCarrier: () => {
        throw new Error("unreachable");
      },
      ghAuthenticated: () => false,
      log: (message) => out.push(message),
      print: () => undefined,
      error: () => undefined,
    });

    expect(out.join("\n")).toContain("feedback   Drafts a problem report");
  });
});

/**
 * The real verb against a real project — the one proof the Java reference says no test suite found
 * for it: an unscoped marker rule refuses EVERY report from every project that has NarrativeTrace
 * installed, because the doctor's own check vocabulary quotes `[REDACTED]`.
 *
 * INTENT: a real `buildSnapshot` over a real directory on disk, not the hand-built snapshot every
 * case above uses. The project is scaffolded here rather than pointed at this repository, so the
 * test carries its own input and cannot go green because of something somebody else installed.
 */
describe("the real verb against a real project on disk", () => {
  function scaffold(): void {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ name: "consumer", version: "1.0.0", type: "module" }),
      "src/order.test.ts": 'expect(rendered).toContain("[REDACTED]");\n',
      "narrativetrace-output/structural/order.nt":
        "scenario: Order is placed\n\n- OrderService.placeOrder(customerId, total) → value\n",
    };
    for (const [relative, content] of Object.entries(files)) {
      const path = join(project, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
    }
  }

  test("drafts a doctor report whose doctor JSON quotes the redaction marker", () => {
    scaffold();
    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(["feedback", "draft", ...MANDATORY], {
      cwd: project,
      env: {},
      buildSnapshot: (cwd, env) => buildSnapshot(cwd, env),
      openCarrier: () => {
        throw new Error("unreachable");
      },
      ghAuthenticated: () => false,
      log: (message) => out.push(message),
      print: (text) => out.push(text),
      error: (message) => err.push(message),
    });

    expect(err.join("\n")).toBe("");
    expect(code).toBe(0);
    const body = read("narrativetrace-output/feedback/feedback-body.md");
    expect(body, "the exemption is only needed because the real report quotes it").toContain(
      "[REDACTED]",
    );
    expect(body).toContain("- OrderService.placeOrder(customerId, total) → value");
  });

  test("builds the URL and the gh line from that same real report", () => {
    scaffold();
    const out: string[] = [];
    const deps = {
      cwd: project,
      env: {},
      buildSnapshot: (cwd: string, env: Record<string, string | undefined>) =>
        buildSnapshot(cwd, env),
      openCarrier: () => {
        throw new Error("unreachable");
      },
      ghAuthenticated: () => true,
      log: (message: string) => out.push(message),
      print: (text: string) => out.push(text),
      error: (message: string) => out.push(`ERROR: ${message}`),
    };

    expect(runCli(["feedback", "url", ...MANDATORY], deps)).toBe(0);
    expect(runCli(["feedback", "gh", ...MANDATORY], deps)).toBe(0);
    expect(out.join("\n")).not.toContain("ERROR:");
    expect(out.join("\n")).toContain("issues/new?template=narrativetrace-report.yml");
  });
});
