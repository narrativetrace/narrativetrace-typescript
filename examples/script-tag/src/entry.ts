// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * `pnpm run example:script-tag` — starts the demo server on http://localhost:5176.
 *
 * Kept apart from `server.ts` so the server itself is testable on an ephemeral port.
 */
import { createDemoServer } from "./server.js";

const PORT = 5176;

createDemoServer().listen(PORT, () => {
  console.log(`NarrativeTrace script-tag example: http://localhost:${PORT}/`);
  console.log("Click the button, then check this terminal for the collector log.");
});
