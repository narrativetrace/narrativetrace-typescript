// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ProListing } from "../pro-listing.js";

/**
 * Sourced verbatim from `documentation/feature-guide.md`'s Pro tier table (2026-09-12 snapshot).
 * Never "paid", never a price (agent-skills-2026-09-12.md §2) — a status plus what it does.
 */
export const PRO_LISTINGS: readonly ProListing[] = [
  {
    canonicalName: "narrativetrace-pro-aggregate",
    prompt: "summarize hotspots and error rates across a captured trace stream",
    delivers:
      "aggregated trees, hotspots, and method/error frequencies via @narrativetrace/pro-aggregate's EventAggregator",
    needs: "a NarrativeTrace Pro license and the pro-aggregate package",
    comesFrom: "the Java Pro line (mirrored per port once each port ships its own aggregation)",
    status: "shipped",
    featureGuideStatusText: "Pro",
  },
  {
    canonicalName: "narrativetrace-mcp",
    prompt: "let an agent ask for trace data as a tool call instead of reading a rendered file",
    delivers: "a stdio MCP server, connecting Claude Code / Cursor directly to captured traces",
    needs: "a NarrativeTrace Pro license and the MCP server package",
    comesFrom: "the Java Pro line (a later Enterprise-plan phase)",
    status: "in development",
    featureGuideStatusText: "In development (Pro)",
  },
];
