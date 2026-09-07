// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const GLOBAL_BUNDLE = createRequire(import.meta.url).resolve(
  "@narrativetrace/standalone/dist/narrativetrace.global.js",
);

interface StaticFile {
  path: string;
  contentType: string;
}

/** Everything the page may fetch. Anything else is a 404 — no directory listing, no traversal. */
const ROUTES: Record<string, StaticFile> = {
  "/": { path: join(PUBLIC_DIR, "index.html"), contentType: "text/html; charset=utf-8" },
  "/app.js": { path: join(PUBLIC_DIR, "app.js"), contentType: "text/javascript; charset=utf-8" },
  "/narrativetrace.global.js": {
    path: GLOBAL_BUNDLE,
    contentType: "text/javascript; charset=utf-8",
  },
};

/** Stand-in collector: reads the JSON the page POSTs, logs its size, answers 202 Accepted. */
function collectTrace(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    console.log(`[collector] received trace (${body.length} bytes)`);
    res.writeHead(202);
    res.end();
  });
}

/**
 * The demo's web server: serves the static page and stands in for a trace collector.
 *
 * INTENT: the script-tag page needs nothing but static files, so any web server would do; this one
 * exists to also answer `POST /traces`, which the page calls through `postToCollector`.
 */
export function createDemoServer(): Server {
  return createServer((req, res) => {
    if (req.url === "/traces") {
      if (req.method === "POST") collectTrace(req, res);
      else {
        res.writeHead(405, { allow: "POST" });
        res.end();
      }
      return;
    }
    const file = ROUTES[req.url ?? ""];
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": file.contentType });
    res.end(readFileSync(file.path));
  });
}
