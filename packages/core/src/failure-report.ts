// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Builds the console failure report a test integration prints when a traced test fails: the framed
 * scenario followed by its indented execution trace. Port of Java
 * `output/TraceTestSupport.buildFailureReport` so JUnit and vitest emit byte-identical blocks.
 *
 * @param scenario - the framed scenario label (see `frameScenario`)
 * @param renderedTrace - the IndentedText rendering of the captured trace
 */
export function buildFailureReport(scenario: string, renderedTrace: string): string {
  return `\n\n${scenario}\n\nExecution trace:\n${renderedTrace}`;
}
