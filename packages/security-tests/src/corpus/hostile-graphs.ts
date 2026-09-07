// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as Members from "./hostile-members.js";
import { carriesSecret, type GraphCase } from "./types.js";

/**
 * Turns a declarative {@link GraphCase} into a live object graph.
 *
 * INTENT: the corpus stays data — `graphs.json` is copied verbatim from the shared master copy and
 * only this builder is per-runtime code.
 *
 * @llmNote `layers` is applied innermost-first, so `["optional", "map"]` is a map holding an
 * `optional`-shaped wrapper. Every shape whose case says `payload: "secret-record"` carries a
 * {@link Secret} whose `secret` component (declared `static notTraced`) holds the caller's sentinel
 * token, so the redaction oracle can look for that token in every byte of every output.
 *
 * @remarks JS has no `Optional`/`AtomicReference`/`AtomicReferenceArray`/`Map.Entry`/
 * `CompletableFuture` as distinct types the way Java does, so several Java layer *names* map to the
 * same JS *shape* here: `optional` and `atomicReference` are both a single-field {@link Holder};
 * `entryValue`/`entryKey` are both a one-entry `Map`; `future` is a resolved `Promise` (JS never
 * exposes a synchronous view of a promise's contents, so the renderer's `isThenable` check renders
 * `<pending>` uniformly regardless of settled state — the `state` field on a `future` `GraphCase`
 * is therefore inert here and deliberately ignored, unlike Java where pending/failed/cancelled are
 * three different objects). None of these carry a custom `toString`, so introspection always takes
 * the safe field-walking path — see `hostile-corpus.test.ts` for the cross-check that every shape
 * still builds and every layer name is recognized.
 */
export class Secret {
  static readonly notTraced = ["secret"];
  constructor(
    readonly label: string,
    readonly secret: string,
  ) {}
}

/** A one-field wrapper, for the `holder`/`optional`/`atomicReference` layers. */
export class Holder {
  constructor(readonly held: unknown) {}
}

/** A two-field wrapper, for the `record` layer. */
export class Wrapped {
  constructor(
    readonly label: string,
    readonly payload: unknown,
  ) {}
}

/** The sentinel-bearing record, behind `@notTraced`. */
export function secret(sentinel: string): Secret {
  return new Secret("visible-label", sentinel);
}

/** Builds the graph a case describes, planting `sentinel` wherever the case says. */
export function build(graphCase: GraphCase, sentinel: string): unknown {
  const payload = carriesSecret(graphCase) ? secret(sentinel) : "no-payload";
  if (graphCase.kind === undefined) return stack(payload, graphCase.layers);
  return byKind(graphCase, payload, sentinel);
}

type KindBuilder = (graphCase: GraphCase, payload: unknown, sentinel: string) => unknown;

const KIND_BUILDERS: Record<string, KindBuilder> = {
  repeatLayer: (c, payload) => stack(payload, repeated(c.layer as string, c.n)),
  width: (c, payload) => wide(c.container as string, c.n, payload),
  cycle: (c, _payload, sentinel) => ring(c.n, sentinel),
  selfInCollection: (c, payload) => selfReferencing(c.container as string, payload),
  diamond: (_c, payload) => diamond(payload),
  hostileMember: (c, _payload, sentinel) => hostile(c.member as string, sentinel),
  manyFields: (_c, _payload, sentinel) => new Members.ManyFields(secret(sentinel)),
  emptyContainers: () => emptyContainers(),
  future: (_c, _payload, sentinel) => future(sentinel),
  throwable: (c) => throwable(c.state, c.n),
};

function byKind(graphCase: GraphCase, payload: unknown, sentinel: string): unknown {
  const builder = KIND_BUILDERS[graphCase.kind as string];
  if (builder === undefined) throw new Error(`unknown graph kind: ${graphCase.kind}`);
  return builder(graphCase, payload, sentinel);
}

function repeated(layer: string, count: number): string[] {
  return Array.from({ length: count }, () => layer);
}

function stack(payload: unknown, layers: readonly string[]): unknown {
  return layers.reduce((current, layer) => wrap(layer, current), payload);
}

const LAYER_WRAPPERS: Record<string, (inner: unknown) => unknown> = {
  optional: (inner) => new Holder(inner),
  atomicReference: (inner) => new Holder(inner),
  holder: (inner) => new Holder(inner),
  atomicReferenceArray: (inner) => ({ items: [inner] }),
  entryValue: (inner) => new Map([["key", inner]]),
  entryKey: (inner) => new Map([[inner as string, "value"]]),
  future: (inner) => Promise.resolve(inner),
  list: (inner) => [inner],
  array: (inner) => [inner],
  map: (inner) => new Map([["key", inner]]),
  record: (inner) => new Wrapped("wrapper", inner),
};

function wrap(layer: string, inner: unknown): unknown {
  const wrapper = LAYER_WRAPPERS[layer];
  if (wrapper === undefined) throw new Error(`unknown layer: ${layer}`);
  return wrapper(inner);
}

/** One container of `count` elements, the payload last so truncation cannot hide it. */
function wide(container: string, count: number, payload: unknown): unknown {
  const filler = container === "listWithNulls" ? null : undefined;
  const elements: unknown[] = Array.from({ length: count }, (_, i) => filler ?? `filler-${i}`);
  elements.push(payload);
  switch (container) {
    case "list":
    case "listWithNulls":
      return elements;
    case "array":
      return elements;
    case "map":
      return indexedMap(elements);
    default:
      throw new Error(`unknown container: ${container}`);
  }
}

function indexedMap(elements: readonly unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [i, el] of elements.entries()) map.set(`key-${i}`, el);
  return map;
}

/** A ring of `length` nodes; length 1 is an object that holds itself. */
function ring(length: number, sentinel: string): Members.Ring {
  const nodes = Array.from({ length }, () => new Members.Ring(secret(sentinel)));
  for (const [i, node] of nodes.entries()) node.linkTo(nodes[(i + 1) % length] as Members.Ring);
  return nodes[0] as Members.Ring;
}

function selfReferencing(container: string, payload: unknown): unknown {
  switch (container) {
    case "list":
      return selfHoldingList(payload);
    case "map":
      return selfHoldingMap(payload, false);
    case "mapKey":
      return selfHoldingMap(payload, true);
    case "array":
      return selfHoldingArray(payload);
    case "atomicReferenceArray":
      return selfHoldingAtomicArray(payload);
    case "entry":
      return selfHoldingEntry(payload);
    default:
      throw new Error(`unknown container: ${container}`);
  }
}

function selfHoldingList(payload: unknown): unknown[] {
  const list: unknown[] = [payload];
  list.push(list);
  return list;
}

function selfHoldingMap(payload: unknown, asKey: boolean): Map<unknown, unknown> {
  const map = new Map<unknown, unknown>();
  map.set("payload", payload);
  if (asKey) {
    map.set(map, "self-as-key");
  } else {
    map.set("self", map);
  }
  return map;
}

function selfHoldingArray(payload: unknown): unknown[] {
  const array: unknown[] = [payload, undefined];
  array[1] = array;
  return array;
}

/** No `AtomicReferenceArray` type in JS; a plain array plays the same self-referencing role. */
function selfHoldingAtomicArray(payload: unknown): unknown[] {
  return selfHoldingArray(payload);
}

/** No standalone `Map.Entry` type in JS; a one-entry self-referencing `Map` plays the same role. */
function selfHoldingEntry(payload: unknown): Map<unknown, unknown> {
  const map = new Map<unknown, unknown>();
  map.set(payload, map);
  return map;
}

/** The same object twice by different paths: shared, not cyclic — a cycle guard must allow it. */
function diamond(payload: unknown): unknown {
  const shared = new Holder(payload);
  return [new Wrapped("left", shared), new Wrapped("right", shared)];
}

// No JS analog of a HashMap-backed cycle guard calling a value's own hashCode/equals — see
// hostile-members.ts's module doc. `hashCodeThrows`/`equalsThrows` fold onto the same shape as a
// throwing toString so the corpus id still resolves to a build-able, exercised graph.
const HOSTILE_MEMBERS: Record<string, (held: Secret) => unknown> = {
  toStringThrows: (held) => new Members.Throwing(held),
  toStringThrowsWithPayload: (held) => new Members.ThrowingWithPayload(held),
  toStringRecurses: (held) => new Members.Recursing(held),
  toStringBlocks: (held) => new Members.Blocking(held),
  toStringHuge: (held) => new Members.Huge(held),
  toStringNull: (held) => new Members.NullReturning(held),
  numberHostileToString: (held) => new Members.NumberHostileToString(held),
  hashCodeThrows: (held) => new Members.Throwing(held),
  equalsThrows: (held) => new Members.Throwing(held),
  getterThrows: (held) => new Members.GetterThrowing(held),
  accessorThrows: (held) => new Members.AccessorThrowing(held),
  hostileKeyNames: (held) => Members.hostileKeyNames(held),
};

function hostile(member: string, sentinel: string): unknown {
  const held = secret(sentinel);
  const build = HOSTILE_MEMBERS[member];
  if (build === undefined) throw new Error(`unknown hostile member: ${member}`);
  return build(held);
}

function emptyContainers(): Record<string, unknown> {
  return {
    list: [],
    array: [],
    map: new Map(),
    optional: new Holder(undefined),
    atomicReferenceArray: [],
    string: "",
  };
}

/** See the module doc: settlement state is inert here, so every `future` graph is a resolved promise. */
function future(sentinel: string): Promise<unknown> {
  return Promise.resolve(secret(sentinel));
}

/**
 * An exception carrying prose. Deliberately not the sentinel: an exception message is text the
 * application wrote, and showing it is the renderer's job, so containment does not apply here —
 * the corpus marks this shape `payload: "plain-text"`, so {@link carriesSecret} is false and the
 * redaction assertions never run against it.
 */
function throwable(state: string | undefined, depth: number): Error {
  if (state === "suppressed") {
    // JS Error has `cause` (ES2022) but no distinct "suppressed exceptions" list; `cause` is the
    // closest analog and is exercised by the `exception-cause-chain` case already.
    return new Error("payment declined", { cause: new Error("payment declined for card 4111") });
  }
  let current = new Error("payment declined for card 4111");
  for (let i = 0; i < depth; i++) {
    current = new Error(`layer ${i}`, { cause: current });
  }
  return current;
}

/**
 * JavaBean-shaped card whose verification code is annotated out of every output.
 *
 * @remarks Defines `toString()` the way a Java record always effectively does (a record's default
 * representation lists every component, annotated or not) — a plain TS class has no such built-in
 * hazard (`Object.prototype.toString` is inert), so this fixture recreates it deliberately. Without
 * it, the `whole-object-placeholder` corpus case couldn't exercise the bug class that motivated it:
 * a bare `{card}` placeholder calling the object's own stringification directly.
 */
export class Card {
  static readonly notTraced = ["cvv"];
  constructor(
    readonly number: string,
    readonly cvv: string,
  ) {}

  toString(): string {
    return `Card[number=${this.number}, cvv=${this.cvv}]`;
  }
}

/** A card one level down, so a template can name a redacted segment mid-path. */
export class Order {
  constructor(
    readonly id: string,
    readonly card: Card,
  ) {}
}

/** A bean whose property names the deny-list knows, with no annotation involved. */
export class Credentials {
  constructor(
    readonly name: string,
    readonly password: string,
  ) {}

  /** The deny-list matches `secret` by name, exactly as it matches `password`. */
  get secret(): string {
    return this.password;
  }
}

/** The redacted leaf of the `deep` template fixture, four records down. */
export class DepthFour {
  static readonly notTraced = ["secret"];
  constructor(readonly secret: string) {}
}
export class DepthThree {
  constructor(readonly d: DepthFour) {}
}
export class DepthTwo {
  constructor(readonly c: DepthThree) {}
}
export class DepthOne {
  constructor(readonly b: DepthTwo) {}
}

/** Identifier segments outside ASCII, so a path grammar cannot assume `[A-Za-z_]`. */
export class Unicode {
  static readonly notTraced = ["secret"];
  constructor(
    readonly naïve: string,
    readonly secret: string,
  ) {}
}

/**
 * A record-shaped class whose own `toString()` prints every component, past `value-renderer`'s
 * default five-key field cap — mirrors Java's `Wide` record (`HostileGraphs.java`), which relies
 * on a record's auto-generated `toString()` doing the same. Found the security-fuzz-suite way
 * (Java `fuzzTemplate`, 2026-09-02, minimized): the safe rendering of this shape truncates the
 * redacted 6th field away entirely and so never carries the marker; template resolution reading
 * "no marker" as "nothing hidden" printed `six` in full.
 */
export class Wide {
  static readonly notTraced = ["six"];
  constructor(
    readonly one: string,
    readonly two: string,
    readonly three: string,
    readonly four: string,
    readonly five: string,
    readonly six: string,
  ) {}

  toString(): string {
    return `Wide[one=${this.one}, two=${this.two}, three=${this.three}, four=${this.four}, five=${this.five}, six=${this.six}]`;
  }
}

/**
 * One link of a chain longer than `value-renderer`'s 32-level depth cap — mirrors Java's `Link`
 * record. Deliberately carries no `toString()` of its own: unlike a Java record, a plain TS
 * object's default `toString()` is inert (it does not echo fields), so this shape has no route to
 * leak on this platform, before or after the fix — see `templates.json`'s
 * `whole-object-redacted-below-the-depth-cap` case and the corpus README for why it is still
 * carried, for corpus parity with the shared master copy.
 */
export class Link {
  constructor(readonly next: unknown) {}
}

/** A chain nested deeper than the renderer's depth cap, with a redacted leaf at the bottom. */
function chain(sentinel: string): Link {
  let link: unknown = new Card("4111", sentinel);
  for (let i = 0; i < 40; i++) {
    link = new Link(link);
  }
  return link as Link;
}

/**
 * A JWT whose payload segment is the sentinel, so the value axis has a shape to recognise and the
 * containment oracle still knows which bytes must not appear.
 *
 * @llmNote The key holding it (`jwt-scalar` below) is `value`, deliberately a name no deny-list
 * knows. Under `token` the name axis would answer first and the case would prove nothing about
 * the shape — which is the entire reason the second axis exists.
 */
function jwt(sentinel: string): string {
  return `eyJhbGciOiJIUzI1NiJ9.${sentinel}.c2lnbmF0dXJl`;
}

type TemplateFixtureBuilder = (sentinel: string) => Record<string, unknown>;

/**
 * The last three fixtures are *scalars*, not graphs, and they exist because every fixture above
 * them is an object: each one makes a template name a property path, which is the placeholder
 * production that was already correct. The production that leaked — a bare key naming a value
 * directly — had no fixture to be exercised with at all, which is how `{password}` printing a
 * password survived a suite pointed straight at it (2026-09-04, family security fix).
 *
 * `newline-scalar` is the one fixture here carrying no sentinel: its value is not secret and is
 * meant to be shown; what must not survive is its raw line break, and a containment oracle cannot
 * say that. The escaping is pinned by the template-parser's own tests.
 */
const TEMPLATE_FIXTURES: Record<string, TemplateFixtureBuilder> = {
  card: (sentinel) => ({ card: new Card("4111", sentinel) }),
  user: (sentinel) => ({ user: new Credentials("ada", sentinel) }),
  order: (sentinel) => ({ order: new Order("order-42", new Card("4000", sentinel)) }),
  deep: (sentinel) => ({ a: new DepthOne(new DepthTwo(new DepthThree(new DepthFour(sentinel)))) }),
  unicode: (sentinel) => ({ café: new Unicode("plain", sentinel) }),
  wide: (sentinel) => ({ wide: new Wide("1", "2", "3", "4", "5", sentinel) }),
  chain: (sentinel) => ({ chain: chain(sentinel) }),
  "password-scalar": (sentinel) => ({ password: sentinel }),
  "jwt-scalar": (sentinel) => ({ value: jwt(sentinel) }),
  "newline-scalar": () => ({ comment: `note${String.fromCodePoint(0x000a)}## forged` }),
};

/**
 * The fixture graphs `templates.json` resolves against, by the name its `values` field carries.
 * Every one plants the caller's sentinel behind either `@notTraced` or a deny-listed property
 * name, so a template that names the path must render the marker instead.
 */
export function templateValues(
  name: string | undefined,
  sentinel: string,
): Record<string, unknown> {
  const build = TEMPLATE_FIXTURES[name ?? "card"];
  if (build === undefined) throw new Error(`unknown template fixture: ${name}`);
  return build(sentinel);
}
