// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type InitOptions, initOptions } from "@narrativetrace/tooling";

/**
 * What `narrativetrace init` and `narrativetrace uninstall` were asked to do, read out of the
 * arguments that follow the verb and nothing else.
 *
 * INTENT: keeps every flag decision in one pure function, so the verbs themselves stay a handful of
 * lines over the installer library — the shape the `doctor` verb already has.
 *
 * @sideEffects None. A pure function of the argument list.
 */

/** The flags that carry a value, written either `--flag value` or `--flag=value`. */
const VALUE_FLAGS = new Set(["--only", "--vendor", "--from"]);

/** One command line, read. */
export interface InstallerArguments {
  /** What the installer library was asked for. */
  readonly options: InitOptions;
  /** The carrier a person named, or `undefined` for the usual search order. */
  readonly from: string | undefined;
  /** Whether to print the machine-readable envelope instead of human text. */
  readonly json: boolean;
  /** Whether the verb's usage was asked for. */
  readonly help: boolean;
  /** Why the command line could not be read, or `undefined` when it could. */
  readonly error: string | undefined;
}

/** One pass over the arguments; mutable so each flag stays one readable line. */
interface Reading {
  draft: Partial<InitOptions>;
  from: string | undefined;
  json: boolean;
  help: boolean;
  error: string | undefined;
}

/**
 * Every flag that carries no value, and what each turns on.
 *
 * @llmNote A `Map`, not an object literal: a table looked up by an ARGUMENT must answer for the names
 * it holds and nothing else. With an object here, `init toString` read as a known switch — accepted,
 * and the install applied — and `init __proto__` crashed with "turnOn is not a function", because
 * `Object.prototype` answered both lookups. A `Map` has no prototype chain to inherit from.
 */
const SWITCHES = new Map<string, (reading: Reading) => void>([
  [
    "--dry-run",
    (reading) => {
      reading.draft.dryRun = true;
    },
  ],
  [
    "--write-existing",
    (reading) => {
      reading.draft.writeExisting = true;
    },
  ],
  [
    "--force",
    (reading) => {
      reading.draft.force = true;
    },
  ],
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

function readScope(value: string, reading: Reading): void {
  if (value === "skills" || value === "agents-md") reading.draft.scope = value;
  else fail(reading, `--only takes skills or agents-md, got "${value}"`);
}

function readVendor(value: string, reading: Reading): void {
  if (value === "claude") reading.draft.vendorClaude = "on";
  else if (value === "none") reading.draft.vendorClaude = "off";
  else fail(reading, `--vendor takes claude or none, got "${value}"`);
}

/**
 * Why the next argument cannot be this flag's value, or `undefined` when it can.
 *
 * @llmNote A value that reads as the NEXT FLAG is refused rather than taken, which Java's parser does
 * not do. `init --from --dry-run` there means "install for real, from a carrier called `--dry-run`" —
 * a misread that APPLIES where the person asked to preview. The escape hatch is the `=` spelling,
 * which says the value out loud.
 */
function nextFlagMessage(name: string, value: string): string {
  return (
    `${name} needs a value, and "${value}" reads as the next flag — write ${name}=${value} if it` +
    " really is the value"
  );
}

/**
 * A flag and its value; `false` when the value is unusable, so nothing was consumed and the argument
 * is left for the loop to read as whatever it is.
 *
 * @param spelledOut whether the value came from the `--flag=value` spelling, which says it out loud
 * @llmNote A value that reads as the NEXT FLAG is refused rather than taken, which Java's parser does
 * not do. `init --from --dry-run` there means "install for real, from a carrier called `--dry-run`" —
 * a misread that APPLIES where the person asked to preview. The `=` spelling is the escape hatch.
 */
function readValued(
  name: string,
  value: string | undefined,
  spelledOut: boolean,
  reading: Reading,
): boolean {
  if (value === undefined || value === "") {
    fail(reading, `${name} needs a value`);
    return false;
  }
  if (!spelledOut && value.startsWith("--")) {
    fail(reading, nextFlagMessage(name, value));
    return false;
  }
  if (name === "--only") readScope(value, reading);
  else if (name === "--vendor") readVendor(value, reading);
  else reading.from = value;
  return true;
}

/** One argument, split at its first `=`: the flag's name, and the value it spelled out, if any. */
interface SplitArgument {
  /** Everything before the first `=`, or the whole argument when it carries none. */
  readonly name: string;
  /** Everything after the first `=`, or `undefined` when the argument carries none. */
  readonly spelled: string | undefined;
}

/**
 * Splits one argument.
 *
 * @llmNote The one place that decides where a name ends, so `--from=/carriers/a=b` keeps every `=`
 * after the first, and the four readings that used to repeat this arithmetic cannot disagree about it.
 */
function splitArgument(argument: string): SplitArgument {
  const equals = argument.indexOf("=");
  return equals < 0
    ? { name: argument, spelled: undefined }
    : { name: argument.slice(0, equals), spelled: argument.slice(equals + 1) };
}

/**
 * Reads one argument and returns the index of the last one it consumed.
 *
 * @llmNote A switch given a value (`--force=false`) is refused, not read as the switch alone — the
 * other deviation from Java's parser, and the dangerous direction of the same class: there, a person
 * spelling out `--force=false` would be granting exactly the permission they meant to withhold.
 */
function readOne(args: readonly string[], index: number, reading: Reading): number {
  const argument = args[index] as string;
  const { name, spelled } = splitArgument(argument);
  const turnOn = SWITCHES.get(name);
  if (turnOn !== undefined) {
    if (spelled === undefined) turnOn(reading);
    else fail(reading, `${name} takes no value, got "${argument}"`);
    return index;
  }
  if (!VALUE_FLAGS.has(name)) {
    fail(reading, `unknown option: "${argument}"`);
    return index;
  }
  const valueIndex = spelled === undefined ? index + 1 : index;
  const value = spelled ?? args[valueIndex];
  return readValued(name, value, spelled !== undefined, reading) ? valueIndex : index;
}

/**
 * Reads the arguments that follow `init` or `uninstall`.
 *
 * @throws {TypeError} when given no argument list at all.
 */
export function parseInstallerArguments(args: readonly string[]): InstallerArguments {
  if (args == null) throw new TypeError("a command line is a list of arguments, never null");
  const reading: Reading = {
    draft: {},
    from: undefined,
    json: false,
    help: false,
    error: undefined,
  };
  for (let index = 0; index < args.length; index += 1) index = readOne(args, index, reading);
  return Object.freeze({
    options: initOptions(reading.draft),
    from: reading.from,
    json: reading.json,
    help: reading.help,
    error: reading.error,
  });
}
