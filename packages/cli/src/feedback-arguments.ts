// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type Attachments,
  type FeedbackReport,
  feedbackCategory,
  feedbackReport,
  problemNarrative,
  RUNTIME,
} from "@narrativetrace/tooling";

/**
 * What `narrativetrace feedback` was asked to do, read out of the arguments that follow the verb and
 * nothing else.
 *
 * INTENT: the same shape {@link parseInstallerArguments} has, for the same reason — every flag
 * decision stays a pure function, so the verb itself is a handful of lines over the tooling library.
 * A bad flag is DATA ({@link FeedbackArguments.error}), never an exception, and the FIRST problem is
 * the one reported.
 *
 * @llmNote The five report fields are MANDATORY and that is checked here rather than left to the
 * library's own guard clauses, so a person who forgets one is told which FLAG they forgot instead of
 * reading a message about a blank field.
 *
 * @sideEffects None. A pure function of the argument list.
 */

/** The three channels, in the order the skill offers them. */
export const FEEDBACK_CHANNELS = ["draft", "url", "gh"] as const;

const VALUE_FLAGS = new Set([
  "--category",
  "--step",
  "--did",
  "--happened",
  "--expected",
  "--language",
  "--agent-product",
  "--agent-model",
  "--trace",
]);

/** One command line, read. */
export interface FeedbackArguments {
  /** `draft`, `url` or `gh`. */
  readonly channel: string;
  readonly category: string;
  readonly step: string;
  readonly did: string;
  readonly happened: string;
  readonly expected: string;
  readonly language: string;
  readonly agentProduct: string;
  readonly agentModel: string;
  /** A path suffix naming the structural trace to attach, or `""` to let the verb choose. */
  readonly trace: string;
  readonly json: boolean;
  readonly help: boolean;
  /** Why the command line could not be read, or `undefined` when it could. */
  readonly error: string | undefined;
  /** The report these arguments and this project describe. */
  readonly report: (install: string, attachments: Attachments) => FeedbackReport;
}

interface Reading {
  channel: string;
  values: Map<string, string>;
  json: boolean;
  help: boolean;
  error: string | undefined;
}

/**
 * Every flag that carries no value, and what each turns on.
 *
 * A `Map`, not an object literal, for the reason `installer-arguments.ts` records: a table looked up
 * by an ARGUMENT must answer for the names it holds and nothing else.
 */
const SWITCHES = new Map<string, (reading: Reading) => void>([
  [
    "--json",
    (reading) => {
      reading.json = true;
    },
  ],
  [
    "--help",
    (reading) => {
      reading.help = true;
    },
  ],
  [
    "-h",
    (reading) => {
      reading.help = true;
    },
  ],
]);

/** The first problem is the one reported: a later flag names one nobody has read yet. */
function fail(reading: Reading, message: string): void {
  reading.error ??= message;
}

function splitArgument(argument: string): { name: string; spelled: string | undefined } {
  const equals = argument.indexOf("=");
  // Stryker disable next-line EqualityOperator: `<= 0` is equivalent. An argument whose `=` is at
  // index 0 (`=value`) is an unknown option either way — as `{name: "", spelled: "value"}` or as
  // `{name: "=value"}` — and the refusal quotes the whole argument, so no caller can tell.
  return equals < 0
    ? { name: argument, spelled: undefined }
    : { name: argument.slice(0, equals), spelled: argument.slice(equals + 1) };
}

/** Why the next argument cannot be this flag's value, in the words the refusal prints. */
function nextFlagMessage(name: string, value: string): string {
  return (
    `${name} needs a value, and "${value}" reads as the next flag — write ${name}=${value} if it` +
    " really is the value"
  );
}

/**
 * A flag and its value; `false` when the value is unusable, so nothing was consumed.
 *
 * A value that reads as the NEXT FLAG is refused rather than taken, with the `=` spelling as the
 * escape hatch — the same decision `installer-arguments.ts` documents.
 *
 * @llmNote The two `return false`s are not the same answer. The second is load-bearing: it leaves
 * the argument that looked like a value for the loop to read as the flag it is, and a test asserts
 * that `--step --json` still sets `json`. The first is equivalent to `true` and marked so — there
 * is no value to consume when the flag ended the command line or spelled out an empty one, so both
 * answers return the same index.
 */
function readValued(
  name: string,
  value: string | undefined,
  spelledOut: boolean,
  reading: Reading,
): boolean {
  if (value === undefined || value === "") {
    fail(reading, `${name} needs a value`);
    // Stryker disable next-line BooleanLiteral: equivalent here, not below — see the doc comment.
    return false;
  }
  if (!spelledOut && value.startsWith("--")) {
    fail(reading, nextFlagMessage(name, value));
    return false;
  }
  reading.values.set(name, value);
  return true;
}

/**
 * A switch, if this name is one: turned on, or refused for carrying a value.
 *
 * A switch given a value (`--json=false`) is refused rather than read as the switch alone — the
 * dangerous direction of the same class `installer-arguments.ts` documents, where a person spelling
 * out `=false` would be turning on exactly what they meant to leave off.
 */
function readSwitch(
  name: string,
  argument: string,
  spelled: string | undefined,
  r: Reading,
): boolean {
  const turnOn = SWITCHES.get(name);
  if (turnOn === undefined) return false;
  if (spelled === undefined) turnOn(r);
  else fail(r, `${name} takes no value, got "${argument}"`);
  return true;
}

/** Reads one argument and returns the index of the last one it consumed. */
function readOne(args: readonly string[], index: number, reading: Reading): number {
  const argument = args[index] as string;
  if (!argument.startsWith("-") && reading.channel === "") {
    reading.channel = argument;
    return index;
  }
  const { name, spelled } = splitArgument(argument);
  if (readSwitch(name, argument, spelled, reading)) return index;
  if (!VALUE_FLAGS.has(name)) {
    fail(reading, `unknown option: "${argument}"`);
    return index;
  }
  const valueIndex = spelled === undefined ? index + 1 : index;
  return readValued(name, spelled ?? args[valueIndex], spelled !== undefined, reading)
    ? valueIndex
    : index;
}

function validateCategory(reading: Reading): void {
  const category = reading.values.get("--category");
  if (category === undefined) {
    fail(reading, "--category needs a value: prompt, skill, doctor or library");
    return;
  }
  try {
    feedbackCategory(category);
  } catch (cause) {
    fail(reading, (cause as Error).message);
  }
}

/** Everything a channel cannot run without, checked in the order a person types it. */
function validate(reading: Reading): void {
  if (reading.help) return;
  if (!FEEDBACK_CHANNELS.includes(reading.channel as (typeof FEEDBACK_CHANNELS)[number])) {
    fail(
      reading,
      reading.channel === ""
        ? `feedback needs a channel: ${FEEDBACK_CHANNELS.join(", ")}`
        : `unknown feedback channel: "${reading.channel}"`,
    );
    return;
  }
  validateCategory(reading);
  for (const flag of ["--step", "--did", "--happened", "--expected"]) {
    if ((reading.values.get(flag) ?? "").trim() === "") {
      fail(reading, `${flag} is required — a report without it says nothing`);
    }
  }
}

/**
 * The report these already-read fields and this project describe.
 *
 * @llmNote Takes the READ fields rather than the raw value map, so every default an absent flag
 * means — `en` for the language, `""` for the agent — is decided in one place. Reading the map
 * twice gave `parsed.language` and the report's own language two independent defaults, and mutation
 * testing is what noticed: a mutant that emptied the report's copy survived because nothing
 * compared the two.
 */
function buildReport(
  fields: FeedbackTextFields,
  install: string,
  attachments: Attachments,
): FeedbackReport {
  return feedbackReport({
    runtime: RUNTIME,
    category: feedbackCategory(fields.category),
    install,
    step: fields.step,
    narrative: problemNarrative(fields.did, fields.happened, fields.expected),
    language: fields.language,
    agent: { product: fields.agentProduct, model: fields.agentModel },
    attachments,
  });
}

/** One pass over the arguments, then everything a channel cannot run without. */
function readAll(args: readonly string[]): Reading {
  const reading: Reading = {
    channel: "",
    values: new Map(),
    json: false,
    help: false,
    error: undefined,
  };
  for (let index = 0; index < args.length; index += 1) index = readOne(args, index, reading);
  validate(reading);
  return reading;
}

/** Exactly the fields {@link textFields} answers for — so no cast stands in for the check. */
type FeedbackTextFields = Pick<
  FeedbackArguments,
  | "category"
  | "step"
  | "did"
  | "happened"
  | "expected"
  | "language"
  | "agentProduct"
  | "agentModel"
  | "trace"
>;

/**
 * Every text field, each read with the default an absent flag means — the one reader of the value
 * map, and so the one place a default is decided.
 */
function textFields(reading: Reading): FeedbackTextFields {
  const value = (flag: string, fallback = ""): string => reading.values.get(flag) ?? fallback;
  return {
    category: value("--category"),
    step: value("--step"),
    did: value("--did"),
    happened: value("--happened"),
    expected: value("--expected"),
    language: value("--language", "en"),
    agentProduct: value("--agent-product"),
    agentModel: value("--agent-model"),
    trace: value("--trace"),
  };
}

/**
 * Reads the arguments that follow `feedback`; the first of them is the channel.
 *
 * @throws {TypeError} when given no argument list at all.
 */
export function parseFeedbackArguments(args: readonly string[]): FeedbackArguments {
  if (args == null) throw new TypeError("a command line is a list of arguments, never null");
  const reading = readAll(args);
  const fields = textFields(reading);
  return Object.freeze({
    channel: reading.channel,
    ...fields,
    json: reading.json,
    help: reading.help,
    error: reading.error,
    report: (install: string, attachments: Attachments) =>
      buildReport(fields, install, attachments),
  });
}
