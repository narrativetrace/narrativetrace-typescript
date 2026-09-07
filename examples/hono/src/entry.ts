// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { serve } from "@hono/node-server";
import { createHonoApp } from "./app.js";
import { checkPort } from "./check-port.js";

const port = Number(process.env.PORT ?? 3001);
await checkPort(port);
const app = createHonoApp();
serve({ fetch: app.fetch, port }, () =>
  console.log(`Hono example listening on http://localhost:${port}`),
);
