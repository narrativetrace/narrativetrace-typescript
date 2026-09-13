// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { CanonicalEntry } from "./canonical-entry.js";
import { canonicalEntries } from "./canonical-trace-export.js";
import type { TraceTree } from "./trace-tree.js";

const ELIDED = "[ELIDED]";

/**
 * Projects a {@link CanonicalEntry} to its AI-safe structural form: Level 1 ("Structure Only") of
 * the AI output ladder (ADR-002). Backs the optional `.structural.json` artifact — the flat,
 * per-event sibling of the `.nt` call-tree artifact ({@link renderStructural}).
 *
 * INTENT: the structural artifact is the value-free projection of the same capture the canonical
 * export serializes — developer-authored structure (names, call shape, outcomes) with every
 * runtime-value field elided. Safety is architectural: value fields do not exist in the output, so
 * neither prompt-injection payloads nor private data can reach an AI consumer.
 *
 * @remarks This projection is deliberately the LAST step before serialization: it consumes a fully-
 * valued canonical entry. Parameter entries keep their names (names are source code, not data) and
 * carry the self-describing `[ELIDED]` value, mirroring the `[REDACTED]` convention, because the
 * schema requires a string value per parameter.
 *
 * **Stance for new schema fields**: fields flow through this projection BY DEFAULT. That is correct
 * for identity-shaped fields (namespaces, span/trace ids, service/environment identity, duration,
 * timestamps — all source or environment identity, never *runtime content*). Any new VALUE-shaped
 * field must be explicitly elided here — classify every schema addition against this rule. Port of
 * Java `export.StructuralProjection`.
 */
export function projectStructural(entry: CanonicalEntry): CanonicalEntry {
  const projected: CanonicalEntry = {
    ...entry,
    message: structuralMessage(entry),
    ...(entry["nt.parameters"] !== undefined && {
      "nt.parameters": entry["nt.parameters"].map((p) => ({ name: p.name, value: ELIDED })),
    }),
  };
  // `nt.returnValue` and `exception.message` are the two value-shaped fields on this entry shape;
  // deleting rather than nulling keeps the projected entry's own JSON free of the key entirely,
  // matching how every other absent-optional field on this interface is represented.
  const {
    "nt.returnValue": _returnValue,
    "exception.message": _exceptionMessage,
    ...rest
  } = projected;
  return rest as CanonicalEntry;
}

function structuralMessage(entry: CanonicalEntry): string {
  if (entry["nt.eventType"] === "method_enter") {
    const names = (entry["nt.parameters"] ?? []).map((p) => p.name).join(", ");
    return `→ ${entry["code.namespace"]}.${entry["code.function"]}(${names})`;
  }
  if (entry["nt.eventType"] === "method_exit") {
    return structuralExitMessage(entry);
  }
  return entry.message;
}

function structuralExitMessage(entry: CanonicalEntry): string {
  const exceptionType = entry["exception.type"];
  if (exceptionType !== undefined) {
    return `!! ${exceptionType}`;
  }
  const name = `${entry["code.namespace"]}.${entry["code.function"]}`;
  if (entry["nt.outcome"] === "incomplete") {
    return `← ${name} incomplete`;
  }
  return `← ${name} returned`;
}

/** Every entry of the tree's canonical export, projected to its value-free structural form. */
export function structuralEntries(tree: TraceTree): CanonicalEntry[] {
  return canonicalEntries(tree).map(projectStructural);
}

/**
 * Serializes a captured trace as the `.structural.json` artifact: a flat JSON array of value-free
 * entries, the same shape `.canonical.json` uses. Opt-in sibling of the `.nt` call-tree artifact —
 * same safety guarantee, flat per-event shape instead of a nested tree.
 *
 * @returns pretty-printed (2-space) JSON ending without a trailing newline, matching every other
 * artifact this package writes. An empty tree yields `[]`.
 */
export function exportStructuralJson(tree: TraceTree): string {
  return JSON.stringify(structuralEntries(tree), null, 2);
}
