// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import {
  splicePlatformTable,
  USE_WITH_YOUR_AGENT,
} from "../packages/tooling/src/platforms/platform-table-docs.js";

/**
 * Every file the platform table renders into, with the text it must have: today the table block of
 * `documentation/use-with-your-agent.md`.
 *
 * INTENT: one source, one surface (Phase 8, platform pointers and evidence). Rendered from the
 * page's CURRENT text, so only the block between its markers is ever rewritten and a hand edit
 * outside it survives.
 */
export function expectedPlatformTableFiles(
  read: (path: string) => string = (path) => readFileSync(path, "utf-8"),
): ReadonlyMap<string, string> {
  return new Map([[USE_WITH_YOUR_AGENT, splicePlatformTable(read(USE_WITH_YOUR_AGENT))]]);
}
