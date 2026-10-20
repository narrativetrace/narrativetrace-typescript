// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Instrumentation exclusions — which targets NarrativeTrace never wraps, in two lists with two owners.
 *
 * INTENT: attaching tracing is explicit in this runtime (`traceObject`, a NestJS provider the
 * auto-proxy discovers), so "what is never a business boundary" is decided per target, at the
 * moment it would be wrapped. List 1 ({@link structuralSkipReason}) is built in, structural and not
 * configurable. List 2 ({@link SHIPPED_EXCLUDE}) is a shipped default a user replaces through the
 * `exclude` option or `NARRATIVETRACE_EXCLUDE`.
 *
 * @llmNote A JavaScript object carries no package, so list 2 is matched against the class name a
 * span records (`constructor.name`, or the `className` override). A prefix matches that name and
 * what is under it at a `.`, `/` or `:` — `acme.billing` matches `acme.billing.Invoice`, never
 * `acme.billingExtra`. A team that namespaces its class names gets package-style exclusion for free.
 */

// The package compiles without DOM or Node typings; `console` exists in every runtime it runs in.
declare const console: { warn(message: string): void };

/**
 * List 2, the shipped default of `exclude`: framework internals the NestJS auto-proxy discovers as
 * providers in every application and would otherwise wrap. Each member's reason and source live in
 * `SHIPPED_EXCLUDE` (exclusion-catalogue.ts), kept out of this module so a browser bundle that
 * only needs the prefixes does not carry the prose; a test holds the two equal.
 *
 * @llmNote Giving `exclude` (option or `NARRATIVETRACE_EXCLUDE`) REPLACES this list; to extend it,
 * copy these prefixes into your own list.
 */
export const DEFAULT_EXCLUDE: readonly string[] = [
  "ModuleRef",
  "Reflector",
  "MetadataScanner",
  "DiscoveryService",
];

const SEPARATORS = /[;,]/;
const DELIMITERS = [".", "/", ":"];
const TRAILING_WILDCARD = /(?:[./]\*{0,2})$/;

function normalise(entry: unknown): string {
  if (typeof entry !== "string") {
    throw new TypeError(`exclude entries must be strings (got ${typeof entry})`);
  }
  const prefix = entry.trim().replace(TRAILING_WILDCARD, "");
  if (prefix === "") {
    throw new RangeError(
      `exclude has a blank entry (${JSON.stringify(entry)}), which would match every target`,
    );
  }
  return prefix;
}

/**
 * Parses an `exclude` list: a `;`/`,` separated string (the environment form) or an array of
 * entries. Each entry is trimmed and its trailing `.`, `.*`, `.**`, `/` or `/*` dropped — all mean
 * "this name and what is under it".
 *
 * @returns the normalised prefixes; an empty string or array is an explicitly empty list.
 * @throws {TypeError} when an entry is not a string.
 * @throws {RangeError} on a blank entry (it would match every target) or a duplicate entry.
 */
export function parseExclude(raw: string | readonly string[]): readonly string[] {
  const entries = typeof raw === "string" ? (raw === "" ? [] : raw.split(SEPARATORS)) : raw;
  const prefixes = entries.map(normalise);
  const duplicate = prefixes.find((prefix, i) => prefixes.indexOf(prefix) !== i);
  if (duplicate !== undefined) throw new RangeError(`exclude has a duplicate entry "${duplicate}"`);
  return prefixes;
}

function matches(prefix: string, name: string): boolean {
  if (name === prefix) return true;
  return DELIMITERS.some((delimiter) => name.startsWith(prefix + delimiter));
}

const reported = new Set<string>();

function reportOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`[narrativetrace] ${message}`);
}

/** Forgets which exclusions were already reported — a test hook; production reports once per process. */
export function resetExclusionReports(): void {
  reported.clear();
}

/**
 * The prefix of `list` that excludes `className`, or `undefined` when none does. The first time a
 * prefix excludes anything it says so on `console.warn` — once per matched prefix, never per
 * target, and never for a prefix that matched nothing.
 */
export function excludedPrefixOf(className: string, list: readonly string[]): string | undefined {
  const prefix = list.find((candidate) => matches(candidate, className));
  if (prefix === undefined) return undefined;
  reportOnce(
    `exclude:${prefix}`,
    `not tracing ${className}: excluded by "${prefix}" (exclude option or NARRATIVETRACE_EXCLUDE; an explicit include does not override an exclude)`,
  );
  return prefix;
}

let fromEnvironment: readonly string[] | undefined;

/**
 * Registers the operator's `NARRATIVETRACE_EXCLUDE` value; `undefined` clears it. Key presence
 * decides: any string, even `""`, states the whole list and replaces the shipped default. An
 * invalid value degrades to the default and says so once — configuration must not crash the host.
 *
 * @llmNote `@narrativetrace/core-node` calls this at import; a browser app calls it itself.
 */
export function registerExcludeFromEnv(raw: string | undefined): void {
  fromEnvironment = undefined;
  if (raw === undefined) return;
  try {
    fromEnvironment = parseExclude(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    reportOnce(
      "exclude:invalid-env",
      `NARRATIVETRACE_EXCLUDE ignored, the shipped default applies: ${reason}`,
    );
  }
}

/**
 * The exclude list in force: the explicit option, else the registered environment value, else
 * {@link DEFAULT_EXCLUDE}. Replace, never merge: the first one stated is the whole list.
 */
export function effectiveExclude(option?: readonly string[]): readonly string[] {
  return option ?? fromEnvironment ?? DEFAULT_EXCLUDE;
}

/** Why a member is never wrapped, whatever `exclude` says. */
export type StructuralSkipReason = "protocol-hook" | "class-constructor" | "bound-wrapper";

const PROTOCOL_NAMES: ReadonlySet<string> = new Set(["toString", "valueOf", "toJSON", "then"]);

const PROTOCOL_SYMBOLS: ReadonlySet<symbol> = new Set([
  ...Object.getOwnPropertyNames(Symbol)
    .map((name) => (Symbol as unknown as Record<string, unknown>)[name])
    .filter((value): value is symbol => typeof value === "symbol"),
  Symbol.for("nodejs.util.inspect.custom"),
]);

function isProtocolHook(key: string | symbol): boolean {
  return typeof key === "symbol" ? PROTOCOL_SYMBOLS.has(key) : PROTOCOL_NAMES.has(key);
}

function isClassConstructor(fn: unknown): boolean {
  try {
    return /^class[\s{]/.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

function inheritsMethod(owner: object, key: string | symbol): boolean {
  for (let p = Object.getPrototypeOf(owner) as object | null; p !== null; ) {
    const value = Object.getOwnPropertyDescriptor(p, key)?.value;
    if (typeof value === "function") return true;
    p = Object.getPrototypeOf(p) as object | null;
  }
  return false;
}

function isBoundWrapper(fn: { name?: unknown }, key: string | symbol, owner: object): boolean {
  const bound = typeof fn.name === "string" && fn.name.startsWith("bound ");
  return bound && !Object.hasOwn(fn, "prototype") && !inheritsMethod(owner, key);
}

/**
 * List 1, built in and not configurable: why `fn`, reached as `owner[key]`, is structurally never a
 * business boundary — or `undefined` when it may be traced. No switch re-enables a member.
 *
 * - `protocol-hook` — `toString`, `valueOf`, `toJSON`, `then`, every well-known symbol and the Node
 *   inspect hook: the runtime calls them on its own behalf (coercion, JSON, `await`, `for…of`).
 * - `class-constructor` — a `class` cannot be called without `new`, so a wrapper would break the host.
 * - `bound-wrapper` — a `bind()` copy of a function that is not this object's own method
 *   (`log: console.log.bind(console)`). A bound copy that shadows an inherited method — the
 *   `this.handle = this.handle.bind(this)` idiom — IS the method, and stays traced.
 *
 * @remarks Class detection reads the function's source, so a class downlevelled to a plain
 * function is indistinguishable from a function and is not recognised.
 */
export function structuralSkipReason(
  fn: unknown,
  key: string | symbol,
  owner: object,
): StructuralSkipReason | undefined {
  if (isProtocolHook(key)) return "protocol-hook";
  if (isClassConstructor(fn)) return "class-constructor";
  if (isBoundWrapper(fn as { name?: unknown }, key, owner)) return "bound-wrapper";
  return undefined;
}

/**
 * Says so, once per process, when a member was skipped because wrapping it would break the host —
 * a `class-constructor` (a wrapper cannot be `new`ed). The other reasons are silent by design: they
 * are never business boundaries, not targets the instrumentation failed to reach. Skip, say so once,
 * never throw into the host's call.
 */
export function reportStructuralSkip(
  reason: StructuralSkipReason,
  className: string,
  member: string,
): void {
  if (reason !== "class-constructor") return;
  reportOnce(
    "skip:class-constructor",
    `${className}.${member} is a class, which cannot be traced without breaking \`new\`, so it is returned as-is (and so is every other class held as a property)`,
  );
}
