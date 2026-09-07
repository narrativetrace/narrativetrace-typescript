// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Vite configuration for the browser example.
//
// Vite does two things here: (1) in `pnpm run example:browser` it serves index.html and
// transpiles /src/*.ts on request; (2) in `vite build` it bundles the page into dist/.
// The one custom piece is a dev-only "collector": the page POSTs each captured trace to /traces
// (see src/demo.ts → postToCollector), and in a real deployment that URL would be your own
// trace-ingestion endpoint. For the demo, the middleware below stands in for it so the network
// export can be seen working without running a second server.
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev-only collector: accepts the JSON the page POSTs to /traces and echoes its size to the
 * terminal that runs Vite. Only POST is accepted (anything else → 405); it always answers 202,
 * which the page shows as "Trace posted to collector (HTTP 202)". It does not exist in
 * `vite build` output — a deployed page needs a real collector or a different `collectorUrl`.
 */
function traceCollector(): Plugin {
  return {
    name: "narrativetrace-dev-collector",
    configureServer(server) {
      server.middlewares.use("/traces", (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          console.log(`[collector] received trace (${body.length} bytes)`);
          res.statusCode = 202;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [traceCollector()],
  server: { port: 5175 },
});
