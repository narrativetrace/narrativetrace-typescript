#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Committed shim, not build output: pnpm links a workspace `bin` entry into a dependent's
// node_modules/.bin only at INSTALL time, and only if the target file already exists then — on a
// fresh clone's first `pnpm install`, `dist/approve-narratives-bin.js` does not exist yet, so
// pnpm skips the link for good; a later `pnpm run build` producing the file does not
// retroactively relink it. Pointing `bin` at this always-present file instead means the link
// succeeds at install time, every time, and the redirect to the built output happens here, at
// run time, once it exists.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "dist", "approve-narratives-bin.js");

if (!existsSync(target)) {
  process.stderr.write("narrativetrace-approve: not built yet — run `pnpm run build` first.\n");
  process.exit(1);
}

await import(pathToFileURL(target).href);
