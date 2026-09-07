// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** The launcher's command line, parsed. Absent optional fields mean "ask, or default". */
export interface DemoArgs {
  readonly example?: string;
  readonly lang?: string;
  readonly list: boolean;
  readonly classic: boolean;
  readonly noPause: boolean;
  readonly help: boolean;
}

export type ParsedDemoArgs =
  | { readonly ok: true; readonly args: DemoArgs }
  | { readonly ok: false; readonly error: string };

export const DEMO_USAGE = `NarrativeTrace demo launcher — one command, the trace story front and center.
  pnpm demo                                 interactive example picker
  pnpm demo -- --example ecommerce          non-interactive
  pnpm demo -- --example ecommerce --classic    the same run as timestamped logs (winston)
  pnpm demo -- --example ecommerce --no-pause   play straight through, no stop points
  pnpm demo -- --example ecommerce --lang es    re-render through the example's glossary.json
  pnpm demo -- --list                       list the available examples
  pnpm demo -- --help                       this text
On a terminal the demo stops after each scenario — [Enter] continues, q quits — and every
scenario opens with a note on how its trace is wired. NO_COLOR drops the colors; FORCE_COLOR
keeps them in a pipe.`;

const VALUE_FLAGS: Record<string, "example" | "lang"> = {
  "-e": "example",
  "--example": "example",
  "--lang": "lang",
};

const SWITCHES: Record<string, "list" | "classic" | "noPause" | "help"> = {
  "--list": "list",
  "--classic": "classic",
  "--no-pause": "noPause",
  "-h": "help",
  "--help": "help",
};

type Mutable = { -readonly [K in keyof DemoArgs]: DemoArgs[K] };

/** Splits `--flag=value` into its parts; a flag without `=` has no inline value. */
function splitInline(token: string): { flag: string; inline: string | undefined } {
  const at = token.indexOf("=");
  if (!token.startsWith("--") || at < 0) return { flag: token, inline: undefined };
  return { flag: token.slice(0, at), inline: token.slice(at + 1) };
}

/** Takes the flag's value from `=value` or the next token; a flag-shaped next token is not a value. */
function takeValue(
  argv: readonly string[],
  at: number,
  inline: string | undefined,
): string | undefined {
  if (inline !== undefined) return inline === "" ? undefined : inline;
  const next = argv[at + 1];
  return next === undefined || next.startsWith("-") ? undefined : next;
}

/**
 * Parses the launcher's arguments. Later occurrences win; a bare `--` (what `pnpm demo -- …`
 * forwards) is skipped; anything that is not a known flag is an error, not a positional.
 */
export function parseDemoArgs(argv: readonly string[]): ParsedDemoArgs {
  const args: Mutable = { list: false, classic: false, noPause: false, help: false };
  for (let at = 0; at < argv.length; at++) {
    const token = argv[at] ?? "";
    const { flag, inline } = splitInline(token);
    if (token === "--") continue;
    const key = VALUE_FLAGS[flag];
    if (key !== undefined) {
      const value = takeValue(argv, at, inline);
      if (value === undefined) return { ok: false, error: `${flag} needs a value` };
      args[key] = value;
      if (inline === undefined) at++;
    } else if (SWITCHES[token] !== undefined) args[SWITCHES[token]] = true;
    else return { ok: false, error: `unknown option: ${token}` };
  }
  return { ok: true, args };
}
