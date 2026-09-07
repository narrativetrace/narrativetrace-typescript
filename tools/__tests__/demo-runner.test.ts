// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEMO_USAGE, type DemoArgs, parseDemoArgs } from "../demo-args.js";
import { EXAMPLE_NAMES } from "../demo-registry.js";
import { type DemoIo, parseChoice, runDemo } from "../demo-runner.js";

interface Fake {
  readonly io: DemoIo;
  readonly out: string[];
  readonly err: string[];
  readonly prompts: string[];
  readonly classic: string[];
  readonly events: number[];
}

interface FakeOptions {
  readonly answers?: readonly (string | null)[];
  readonly stdinIsTTY?: boolean;
  readonly stdoutIsTTY?: boolean;
  readonly env?: Record<string, string | undefined>;
}

type Bins = Omit<Fake, "io">;

function fakeIo(bins: Bins, answers: (string | null)[], options: FakeOptions): DemoIo {
  return {
    write: (text) => bins.out.push(text),
    error: (text) => bins.err.push(text),
    readLine: async (prompt) => {
      bins.prompts.push(prompt);
      return answers.length > 0 ? (answers.shift() ?? null) : null;
    },
    stdinIsTTY: options.stdinIsTTY ?? false,
    stdoutIsTTY: options.stdoutIsTTY ?? false,
    env: options.env ?? {},
    readFile: (path) => readFileSync(path, "utf-8"),
    createClassic: () => ({
      log: (text) => bins.classic.push(text),
      consumer: () => bins.events.push(1),
    }),
  };
}

function fake(options: FakeOptions = {}): Fake {
  const bins: Bins = { out: [], err: [], prompts: [], classic: [], events: [] };
  return { ...bins, io: fakeIo(bins, [...(options.answers ?? [])], options) };
}

function args(argv: string[]): DemoArgs {
  const parsed = parseDemoArgs(argv);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.args;
}

const text = (chunks: string[]): string => chunks.join("");
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`);

describe("runDemo — usage", () => {
  test("--list prints the registry names and --help the usage, both exit 0", async () => {
    const list = fake();
    expect(await runDemo(args(["--list"]), list.io)).toBe(0);
    expect(text(list.out)).toBe(`${EXAMPLE_NAMES.join("\n")}\n`);
    const help = fake();
    expect(await runDemo(args(["--help"]), help.io)).toBe(0);
    expect(text(help.out)).toBe(`${DEMO_USAGE}\n`);
  });

  test("without an example on a pipe it refuses with exit 2 and points at --list", async () => {
    const f = fake();
    expect(await runDemo(args([]), f.io)).toBe(2);
    expect(text(f.err)).toContain("stdin is not a terminal: pass --example NAME (see --list)");
    expect(f.out).toStrictEqual([]);
  });

  test("an unknown example, an unsupported language, and --lang with --classic are usage errors", async () => {
    const unknown = fake();
    expect(await runDemo(args(["--example", "nope"]), unknown.io)).toBe(2);
    expect(text(unknown.err)).toContain("unknown example: nope (try --list)");
    const lang = fake();
    expect(await runDemo(args(["--example", "plain-js", "--lang", "ja"]), lang.io)).toBe(2);
    expect(text(lang.err)).toContain("supported: en es zh-CN");
    const both = fake();
    expect(
      await runDemo(args(["--example", "plain-js", "--lang", "es", "--classic"]), both.io),
    ).toBe(2);
    expect(text(both.err)).toContain("Drop one of the flags");
  });
});

describe("runDemo — styled run", () => {
  test("a non-TTY --no-pause run streams live: header, wiring note, → ← lines and Java's sections, no colour", async () => {
    const f = fake({ env: { NO_COLOR: "1" } });
    expect(await runDemo(args(["--example", "plain-js", "--no-pause"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toContain("=== Scenario 1: Successful Book Borrow ===");
    expect(output).toContain("    Wiring: plain JavaScript, no decorators");
    expect(output).toContain(
      '→ LendingService.borrowBook(memberId: "M-001", isbn: "978-0-13-468599-1")',
    );
    expect(output).toContain('  → CatalogService.findBook(isbn: "978-0-13-468599-1")');
    expect(output).toContain("--- Trace tree — renderIndentedText over the SAME trace");
    expect(output).toContain("--- Prose — renderProse");
    expect(output).toContain("--- Mermaid — renderMermaidSequence");
    expect(output).toContain("!! LendingService.borrowBook ✖ BookUnavailableError");
    expect(output).toContain("Tip: pnpm demo -- --example plain-js --classic");
    expect(output).not.toMatch(ANSI);
    expect(f.prompts).toStrictEqual([]);
  });

  test("a pipe never pauses even on a TTY stdin, and FORCE_COLOR keeps the colours and the legend", async () => {
    const f = fake({ stdinIsTTY: true, env: { FORCE_COLOR: "1" } });
    expect(await runDemo(args(["--example", "plain-js", "--lang", "en"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toMatch(ANSI);
    expect(output).toContain("One recording, many views");
    expect(f.prompts).toStrictEqual([]);
  });

  test("on a terminal the run is recorded then walked with a stop point per scenario; q quits", async () => {
    const f = fake({
      stdinIsTTY: true,
      stdoutIsTTY: true,
      answers: ["", "q"],
      env: { NO_COLOR: "1" },
    });
    expect(await runDemo(args(["--example", "plain-js", "--lang", "en"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toContain("recorded in full");
    expect(output).toContain("=== Scenario 1: Successful Book Borrow ===");
    expect(output).not.toContain("=== Scenario 2: Book Unavailable ===");
    expect(f.prompts.map((p) => p.trim())).toStrictEqual([
      "[Enter] start the demo   ·   [q] quit",
      "[Enter] next scenario   ·   [q] quit",
    ]);
    expect(output).toContain("--no-pause plays it straight through");
  });

  test("EOF at a stop point switches pacing off and the walk runs to the end", async () => {
    const f = fake({
      stdinIsTTY: true,
      stdoutIsTTY: true,
      answers: [null],
      env: { NO_COLOR: "1" },
    });
    expect(await runDemo(args(["--example", "plain-js", "--lang", "en"]), f.io)).toBe(0);
    expect(text(f.out)).toContain("=== Scenario 2: Book Unavailable ===");
    expect(f.prompts).toHaveLength(1);
  });

  test("the renderers note is printed once per run, at the first rendering section", async () => {
    const f = fake({ env: { NO_COLOR: "1" } });
    await runDemo(args(["--example", "plain-js", "--no-pause"]), f.io);
    const output = text(f.out);
    expect(output.split("Renderers are not configured").length - 1).toBe(1);
  });
});

describe("runDemo — pickers", () => {
  test("on a terminal with no example the picker accepts a number or a name and retries on nonsense", async () => {
    const f = fake({ stdinIsTTY: true, answers: ["zzz", "plain-js", "1"], env: { NO_COLOR: "1" } });
    expect(await runDemo(args(["--no-pause"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toContain("Which example?");
    expect(output).toContain("  4) plain-js");
    expect(output).toContain("Which language?");
    expect(output).toContain("=== Scenario 1: Successful Book Borrow ===");
  });

  test("EOF in the example picker exits 2; --classic and an explicit --lang skip the language picker", async () => {
    const eof = fake({ stdinIsTTY: true, answers: [] });
    expect(await runDemo(args([]), eof.io)).toBe(2);
    expect(text(eof.err)).toContain("no example chosen");
    const classic = fake({ stdinIsTTY: true, answers: ["4"] });
    expect(await runDemo(args(["--classic"]), classic.io)).toBe(0);
    expect(text(classic.out)).not.toContain("Which language?");
    const explicit = fake({ stdinIsTTY: true, answers: ["4"], env: { NO_COLOR: "1" } });
    expect(await runDemo(args(["--lang", "en", "--no-pause"]), explicit.io)).toBe(0);
    expect(text(explicit.out)).not.toContain("Which language?");
  });

  test("parseChoice accepts 1-based numbers or exact names, nothing else", () => {
    const choices = ["a", "b"] as const;
    expect(parseChoice("2", choices)).toBe("b");
    expect(parseChoice(" a ", choices)).toBe("a");
    expect(parseChoice("0", choices)).toBeUndefined();
    expect(parseChoice("3", choices)).toBeUndefined();
    expect(parseChoice("A", choices)).toBeUndefined();
    expect(parseChoice("", choices)).toBeUndefined();
  });
});

describe("runDemo — classic and translated", () => {
  test("--classic sends titles, sections and every event through the classic sink, nothing styled", async () => {
    const f = fake({ stdinIsTTY: true, stdoutIsTTY: true, env: { FORCE_COLOR: "1" } });
    expect(await runDemo(args(["--example", "plain-js", "--classic"]), f.io)).toBe(0);
    expect(text(f.out)).toContain("Classic log format");
    expect(f.classic[0]).toBe("=== Scenario 1: Successful Book Borrow ===");
    expect(f.classic).toContain("--- Trace tree ---");
    expect(f.events.length).toBe(10);
    expect(f.prompts).toStrictEqual([]);
    expect(text(f.out)).not.toContain("→ ");
  });

  test("--lang es walks the translated views with the wiring note, in Spanish chrome", async () => {
    const f = fake({ env: { NO_COLOR: "1" } });
    expect(await runDemo(args(["--example", "plain-js", "--lang", "es"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toContain("La misma ejecución");
    expect(output).toContain("=== Scenario 1: Successful Book Borrow ===");
    expect(output).toContain("    Wiring: plain JavaScript");
    expect(output).toContain("Flujo de llamadas");
    expect(output).toContain("prestar libro [borrowBook]");
    expect(output).toContain("Consejo: pnpm demo -- --example plain-js");
  });

  test("--lang zh-CN uses the Chinese chrome and headings; q at the first stop point ends the walk", async () => {
    const f = fake({ stdinIsTTY: true, stdoutIsTTY: true, answers: ["q"], env: { NO_COLOR: "1" } });
    expect(await runDemo(args(["--example", "plain-js", "--lang", "zh-CN"]), f.io)).toBe(0);
    const output = text(f.out);
    expect(output).toContain("讲不出故事的名字");
    expect(output).toContain("调用流程");
    expect(output).toContain("=== Scenario 1: Successful Book Borrow ===");
    expect(output).not.toContain("=== Scenario 2: Book Unavailable ===");
    expect(f.prompts[0]).toContain("[回车] 继续,q 退出");
  });
});
