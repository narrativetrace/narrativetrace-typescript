// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { findUnresolved } from "./template-parser.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";
import { walkPreOrder } from "./tree-walk.js";

/** A `{placeholder}` that survived template resolution in a rendered signature field. */
export interface TemplateWarning {
  readonly className: string;
  readonly methodName: string;
  readonly placeholder: string;
  readonly field: "narration" | "errorContext";
}

/**
 * Post-capture safety net: walks the trace and reports every `{token}` that survived template
 * resolution in a node's narration or errorContext (e.g. `{customer.name}` that never resolved).
 * Port of Java `output/TemplateWarningCollector`.
 */
export function collectTemplateWarnings(trace: TraceTree): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  walkPreOrder(
    trace.roots,
    (n) => n.children,
    (node) => collectFromNode(node, warnings),
  );
  return warnings;
}

/**
 * Renders warnings as the human-readable block printed by the test integrations. Returns an
 * empty string when there are no warnings, so callers can print unconditionally.
 */
export function formatTemplateWarnings(warnings: readonly TemplateWarning[]): string {
  if (warnings.length === 0) return "";
  const lines = ["WARNING: Unresolved template placeholder(s) detected:"];
  for (const w of warnings) {
    lines.push(`  - ${w.className}.${w.methodName}: {${w.placeholder}} in ${w.field}`);
  }
  return `${lines.join("\n")}\n`;
}

function collectFromNode(node: TraceNode, warnings: TemplateWarning[]): void {
  const { className, methodName, narration, errorContext } = node.signature;
  for (const placeholder of findUnresolved(narration ?? "")) {
    warnings.push({ className, methodName, placeholder, field: "narration" });
  }
  for (const placeholder of findUnresolved(errorContext ?? "")) {
    warnings.push({ className, methodName, placeholder, field: "errorContext" });
  }
}
