// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { createPinoEventConsumer } from "../packages/pino/src/index.js";
import { createWinstonEventConsumer } from "../packages/winston/src/index.js";
import { DEMO_USAGE, parseDemoArgs } from "./demo-args.js";
import type { LiveListener } from "./demo-registry.js";
import { type ClassicSink, type DemoIo, runDemo } from "./demo-runner.js";

/**
 * NarrativeTrace demo launcher — `pnpm demo`. Binds {@link runDemo} to the real terminal:
 * `node:readline` for the picker and the stop points, the winston bridge for `--classic`.
 * Zero dependencies beyond what the workspace already carries; run from source via tsx, from
 * the repository root (`pnpm demo` does) — the example glossaries are addressed relative to it.
 * The root package is CommonJS to tsx, hence `main()` rather than top-level `await`.
 */

type WinstonLogger = Parameters<typeof createWinstonEventConsumer>[0];

/** The slice of winston the classic mode needs; the module is resolved from the winston package. */
interface WinstonModule {
  createLogger(options: object): WinstonLogger;
  format: {
    combine(...formats: unknown[]): unknown;
    timestamp(options: object): unknown;
    printf(template: (info: Record<string, unknown>) => string): unknown;
  };
  transports: { Console: new () => unknown };
}

/** winston is a dependency of `packages/winston`, not of the root — resolve it from there. */
function loadWinston(): WinstonModule {
  const require = createRequire(resolve(process.cwd(), "packages/winston/package.json"));
  return require("winston") as WinstonModule;
}

type PinoLogger = Parameters<typeof createPinoEventConsumer>[0];

/** The slice of pino the demo logger needs; the module is resolved from `packages/pino`. */
interface PinoModule {
  (options: object, destination: unknown): PinoLogger;
  destination(path: string): unknown;
}

/** pino is a dependency of `packages/pino`, not of the root — resolve it from there. */
function loadPino(): PinoModule {
  const require = createRequire(resolve(process.cwd(), "packages/pino/package.json"));
  return require("pino") as PinoModule;
}

/** Path the always-on demo logger writes to — see documentation/examples-guide.md § Demo launcher. */
export const DEMO_LOG_PATH = resolve(process.cwd(), "demo-trace.log");

/**
 * The one real logger every `pnpm demo` run attaches, regardless of mode — see
 * documentation/framework-integration-guide.md § 9 (Winston & Pino). Written to a file, not
 * stdout: the styled walk's colors and the classic/translated views must stay readable, and a
 * demo re-run should not race the walk for the same terminal lines.
 */
function createDemoLogger(): LiveListener {
  const pino = loadPino();
  const logger = pino({ level: "info" }, pino.destination(DEMO_LOG_PATH));
  return createPinoEventConsumer(logger, {
    levels: { enter: "info", return: "info", exception: "error" },
  }) as LiveListener;
}

/** Java's classic pattern: `yyyy-MM-dd HH:mm:ss.SSS LEVEL [thread] [logger] - message`. */
function createClassic(): ClassicSink {
  const winston = loadWinston();
  const logger = winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      winston.format.printf(
        (info) =>
          `${info.timestamp} ${String(info.level).toUpperCase().padEnd(5)} [main] [narrativetrace] - ${info.message}`,
      ),
    ),
    transports: [new winston.transports.Console()],
  });
  return { log: (text) => logger.info(text), consumer: createWinstonEventConsumer(logger) };
}

let reader: Interface | undefined;

function readLine(prompt: string): Promise<string | null> {
  reader ??= createInterface({ input: process.stdin, output: process.stdout });
  const rl = reader;
  return new Promise((resolve) => {
    const onClose = (): void => resolve(null);
    rl.once("close", onClose);
    rl.question(prompt, (answer) => {
      rl.off("close", onClose);
      resolve(answer);
    });
  });
}

const io: DemoIo = {
  write: (text) => process.stdout.write(text),
  error: (text) => process.stderr.write(text),
  readLine,
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  env: process.env,
  readFile: (path) => readFileSync(path, "utf-8"),
  createClassic,
  createLogger: createDemoLogger,
};

async function main(): Promise<number> {
  const parsed = parseDemoArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${DEMO_USAGE}\n`);
    return 2;
  }
  try {
    return await runDemo(parsed.args, io);
  } finally {
    reader?.close();
  }
}

main().then((code) => {
  process.exitCode = code;
});
