// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TranslatedFile } from "../packages/glossary/src/index.js";
import { DEMO_USAGE, type DemoArgs } from "./demo-args.js";
import {
  colorMode,
  dimBlock,
  legend,
  type Palette,
  palette,
  RULE,
  type StreamState,
  styleLine,
} from "./demo-colors.js";
import {
  EXAMPLE_NAMES,
  type ExampleContext,
  type ExampleName,
  formatExampleList,
  isExampleName,
  type LoadedExample,
  loadExample,
  type Scenario,
} from "./demo-registry.js";
import { createLiveStreamConsumer } from "./demo-stream.js";
import {
  type CapturedTrace,
  glossaryLocales,
  SOURCE_LOCALE,
  translateCaptured,
} from "./demo-translate.js";

/**
 * The launcher's orchestration, free of `process`: everything it reads or writes goes through
 * {@link DemoIo}, so the picker, the paced walk, `--classic` and `--lang` are unit-testable.
 * `tools/demo.ts` binds it to the real terminal.
 */

/** The classic mode's sink: a timestamped logger (winston in `demo.ts`) plus its event consumer. */
export interface ClassicSink {
  readonly log: (line: string) => void;
  readonly consumer: (event: never) => void;
}

export interface DemoIo {
  readonly write: (text: string) => void;
  readonly error: (text: string) => void;
  /** Reads one line after showing `prompt`; `null` on EOF or an interrupted terminal. */
  readonly readLine: (prompt: string) => Promise<string | null>;
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readFile: (path: string) => string;
  readonly createClassic: () => ClassicSink;
}

const USAGE_EXIT = 2;

interface Chrome {
  readonly intro: readonly string[];
  readonly pause: string;
  readonly tip: (example: string) => string;
}

/** Launcher prose for translated runs — the demo speaks the chosen language, not just the traces. */
const CHROME: Readonly<Record<string, Chrome>> = {
  es: {
    intro: [
      "La misma ejecución, re-renderizada desde el glossary.json del ejemplo.",
      "Los identificadores traducidos conservan el original entre corchetes para poder seguir buscando en el log canónico;",
      "el pie 'Vacíos del glosario' lista las frases que el glosario aún no cubre — esa lista ES la cola de trabajo de curación.",
      "Los nombres genéricos (minecraft sin refactorizar, clarity legacy) quedan sin traducir a propósito:",
      "un nombre que no cuenta ninguna historia no puede traducirse en una.",
    ],
    pause: "[Intro] continúa, q sale",
    tip: (example) =>
      `Consejo: pnpm demo -- --example ${example} compara esto con la ejecución en inglés.`,
  },
  "zh-CN": {
    intro: [
      "同一次运行,已经示例的 glossary.json 重新渲染。",
      "翻译后的标识符在方括号中保留原文,规范日志仍可用 grep 检索;",
      '"术语表缺口"页脚列出术语表尚未覆盖的短语 — 那份清单就是词汇整理的工作队列。',
      "泛化的名字(minecraft 未重构版、clarity legacy)特意保持不译:",
      "讲不出故事的名字,也翻译不出故事。",
    ],
    pause: "[回车] 继续,q 退出",
    tip: (example) => `提示:pnpm demo -- --example ${example} 可与英文运行对比。`,
  },
};

interface Session {
  readonly io: DemoIo;
  readonly p: Palette;
  readonly example: LoadedExample;
  pause: boolean;
}

function line(io: DemoIo, text = ""): void {
  io.write(`${text}\n`);
}

function usageError(io: DemoIo, message: string): number {
  io.error(`${message}\n`);
  return USAGE_EXIT;
}

/** Turns a picker answer — a 1-based number or a name — into a choice, or `undefined`. */
export function parseChoice<T extends string>(
  answer: string,
  choices: readonly T[],
): T | undefined {
  const trimmed = answer.trim();
  const index = /^\d+$/.test(trimmed) ? Number(trimmed) - 1 : -1;
  const byNumber = choices[index];
  if (byNumber !== undefined) return byNumber;
  return choices.find((choice) => choice === trimmed);
}

async function pick<T extends string>(
  io: DemoIo,
  question: string,
  choices: readonly T[],
): Promise<T | undefined> {
  line(io, question);
  for (const [at, choice] of choices.entries()) line(io, `  ${at + 1}) ${choice}`);
  for (;;) {
    const answer = await io.readLine(`#? `);
    if (answer === null) return undefined;
    const choice = parseChoice(answer, choices);
    if (choice !== undefined) return choice;
  }
}

async function chooseExample(args: DemoArgs, io: DemoIo): Promise<ExampleName | number> {
  if (args.example !== undefined) {
    return isExampleName(args.example)
      ? args.example
      : usageError(io, `unknown example: ${args.example} (try --list)`);
  }
  if (!io.stdinIsTTY)
    return usageError(io, "stdin is not a terminal: pass --example NAME (see --list)");
  const chosen = await pick(
    io,
    "Which example? (the trace narrates as the code runs)",
    EXAMPLE_NAMES,
  );
  return chosen ?? usageError(io, "no example chosen");
}

function validateLang(io: DemoIo, lang: string, locales: readonly string[]): string | number {
  if (locales.includes(lang)) return lang;
  const supported = locales.join(" ");
  return usageError(
    io,
    `language '${lang}' is not in this example's glossary (supported: ${supported})`,
  );
}

async function chooseLang(
  args: DemoArgs,
  io: DemoIo,
  locales: readonly string[],
): Promise<string | number> {
  if (args.lang !== undefined) return validateLang(io, args.lang, locales);
  if (!io.stdinIsTTY || args.classic || locales.length < 2) return SOURCE_LOCALE;
  line(io);
  const chosen = await pick(
    io,
    "Which language? / ¿Qué idioma? / 哪种语言?(the SAME run re-rendered via the example's glossary)",
    locales,
  );
  return chosen ?? SOURCE_LOCALE;
}

interface Recorded {
  readonly scenario: Scenario;
  readonly lines: readonly string[];
  readonly captured: readonly CapturedTrace[];
}

/** Runs one scenario with every line — live stream and sections — collected in order. */
async function runScenario(
  context: ExampleContext,
  scenario: Scenario,
  sink: (text: string) => void,
): Promise<CapturedTrace[]> {
  const captured: CapturedTrace[] = [];
  await scenario.run({
    context,
    print: sink,
    capture: (title, tree) => captured.push({ title, tree }),
  });
  context.reset();
  return captured;
}

/** Records the whole run first: a reader waiting for a human must never inflate the timings. */
async function record(example: LoadedExample): Promise<Recorded[]> {
  const recorded: Recorded[] = [];
  let lines: string[] = [];
  const context = example.createDemoContext(createLiveStreamConsumer((text) => lines.push(text)));
  for (const scenario of example.scenarios) {
    lines = [];
    const captured = await runScenario(context, scenario, (text) => lines.push(text));
    recorded.push({ scenario, lines, captured });
  }
  return recorded;
}

/** A stop point; the prompt is erased afterwards so the transcript reads uninterrupted. */
async function stop(session: Session, prompt: string): Promise<"go" | "quit"> {
  if (!session.pause) return "go";
  const answer = await session.io.readLine(`${session.p.dim}   ${prompt}${session.p.reset} `);
  if (session.io.stdoutIsTTY) session.io.write("\x1b[1A\x1b[2K");
  if (answer === null) {
    session.pause = false;
    return "go";
  }
  return /^[qQ]/.test(answer) ? "quit" : "go";
}

function header(session: Session, scenario: Scenario, state: StreamState): void {
  const { io, p } = session;
  line(io, `${p.dim}${RULE}${p.reset}`);
  line(io, styleLine(`=== ${scenario.title} ===`, state, p));
  line(io, dimBlock(scenario.wiring, p));
  line(io);
}

function styledBlock(session: Session, text: string, state: StreamState): void {
  for (const raw of text.split("\n")) line(session.io, styleLine(raw, state, session.p));
}

async function walk(session: Session, recorded: readonly Recorded[]): Promise<void> {
  const state: StreamState = { depth: 0, renderersExplained: false };
  let first = true;
  for (const entry of recorded) {
    const prompt = first
      ? "[Enter] start the demo   ·   [q] quit"
      : "[Enter] next scenario   ·   [q] quit";
    first = false;
    if ((await stop(session, prompt)) === "quit") return;
    header(session, entry.scenario, state);
    for (const text of entry.lines) styledBlock(session, text, state);
  }
  await stop(session, "[Enter] finish");
}

async function streamLive(session: Session): Promise<void> {
  const state: StreamState = { depth: 0, renderersExplained: false };
  const { example } = session;
  const context = example.createDemoContext(
    createLiveStreamConsumer((text) => styledBlock(session, text, state)),
  );
  for (const scenario of example.scenarios) {
    header(session, scenario, state);
    await runScenario(context, scenario, (text) => styledBlock(session, text, state));
  }
}

async function runStyled(session: Session): Promise<number> {
  const { io, example } = session;
  io.write(legend(session.p));
  if (session.pause) {
    line(io, `Running ${example.name} (recorded in full, so the timings stay honest)...`);
    await walk(session, await record(example));
  } else await streamLive(session);
  line(io);
  line(
    io,
    `Tip: pnpm demo -- --example ${example.name} --classic replays this as traditional timestamped logs.`,
  );
  if (session.pause)
    line(io, `     pnpm demo -- --example ${example.name} --no-pause plays it straight through.`);
  return 0;
}

async function runClassic(io: DemoIo, example: LoadedExample): Promise<number> {
  line(
    io,
    "Classic log format: same run through the winston bridge — timestamp, level, logger, message.",
  );
  line(io);
  const classic = io.createClassic();
  const context = example.createDemoContext(classic.consumer);
  for (const scenario of example.scenarios) {
    classic.log(`=== ${scenario.title} ===`);
    await runScenario(context, scenario, (text) => {
      for (const raw of text.split("\n")) classic.log(raw);
    });
  }
  return 0;
}

function printTranslated(session: Session, file: TranslatedFile): void {
  const { io, p, example } = session;
  const scenario = example.scenarios.find((s) => s.title === file.path);
  line(io);
  line(io, `${p.yellow}=== ${file.path} ===${p.reset}`);
  if (scenario !== undefined) line(io, dimBlock(scenario.wiring, p));
  line(io);
  line(io, file.markdown);
}

async function runTranslated(
  session: Session,
  lang: string,
  glossaryJson: string,
): Promise<number> {
  const { io, p, example } = session;
  const chrome = CHROME[lang] ?? CHROME.es;
  if (chrome === undefined) return usageError(io, `no launcher prose for ${lang}`);
  const captured = (await record(example)).flatMap((entry) => entry.captured);
  const files = translateCaptured(glossaryJson, example.sourcePrefix, lang, captured);
  line(io);
  for (const text of chrome.intro) line(io, `${p.dim}${text}${p.reset}`);
  for (const file of files) {
    printTranslated(session, file);
    if ((await stop(session, chrome.pause)) === "quit") break;
  }
  line(io);
  line(io, chrome.tip(example.name));
  return 0;
}

function resolvePause(args: DemoArgs, io: DemoIo): boolean {
  return !args.noPause && !args.classic && io.stdinIsTTY && io.stdoutIsTTY;
}

interface Selection {
  readonly example: LoadedExample;
  readonly lang: string;
  readonly glossaryJson: string;
}

/** Example and language, from flags or the pickers; a usage-error exit code when either fails. */
async function select(
  args: DemoArgs,
  io: DemoIo,
  load: (name: ExampleName) => Promise<LoadedExample>,
): Promise<Selection | number> {
  const name = await chooseExample(args, io);
  if (typeof name === "number") return name;
  const example = await load(name);
  const glossaryJson = io.readFile(example.glossaryPath);
  const lang = await chooseLang(args, io, glossaryLocales(glossaryJson));
  if (typeof lang === "number") return lang;
  if (lang !== SOURCE_LOCALE && args.classic) {
    return usageError(
      io,
      "--classic replays raw log output; it has no translated variant. Drop one of the flags.",
    );
  }
  return { example, lang, glossaryJson };
}

/** Runs the launcher and returns the process exit code. */
export async function runDemo(
  args: DemoArgs,
  io: DemoIo,
  load: (name: ExampleName) => Promise<LoadedExample> = loadExample,
): Promise<number> {
  if (args.help || args.list) {
    line(io, args.help ? DEMO_USAGE : formatExampleList());
    return 0;
  }
  const selection = await select(args, io, load);
  if (typeof selection === "number") return selection;
  const { example, lang, glossaryJson } = selection;
  const p = palette(colorMode(io.env, io.stdoutIsTTY));
  const session: Session = { io, p, example, pause: resolvePause(args, io) };
  if (args.classic) return runClassic(io, example);
  if (lang !== SOURCE_LOCALE) return runTranslated(session, lang, glossaryJson);
  return runStyled(session);
}
