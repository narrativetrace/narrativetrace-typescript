// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Rendered form of an own-enumerable member that IS an accessor (a getter, defined via
 * `Object.defineProperty`/`class { get x() {} }` promoted to an own property) rather than a data
 * property holding a value directly. Introspection reads a value's own STATE, so an accessor is
 * never invoked, not even as a fallback when nothing else can supply the value — this is the
 * honest answer for a member that was never actually unreadable, only deliberately not read, and
 * is deliberately distinct from the error marker, which is reserved for a member that a *read*
 * (not an invocation) genuinely failed on.
 */
export const INACCESSIBLE = "<inaccessible>";

/** The outcome of {@link readOwnField}: the stored value of a data property, or an accessor. */
export type FieldRead =
  | { readonly accessible: true; readonly value: unknown }
  | { readonly accessible: false };

/**
 * Reads one own field's STATE through its property descriptor, never through `value[key]`.
 *
 * @remarks The single field-read decision shared by the flat (`renderValue`) and structured
 * (`renderStructured`) paths, so the two cannot drift: a data property yields its stored value, an
 * accessor yields `{ accessible: false }` and its getter is never invoked, not even once. A key
 * with no own descriptor (unreachable from `Object.keys`) reads as an accessible `undefined`.
 */
export function readOwnField(value: object, key: string): FieldRead {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return { accessible: true, value: undefined };
  if (!("value" in descriptor)) return { accessible: false };
  return { accessible: true, value: descriptor.value };
}
