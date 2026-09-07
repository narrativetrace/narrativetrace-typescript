#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runClarityCli } from "./clarity-cli.js";

const exitCode = runClarityCli(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => writeFileSync(path, content),
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  log: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
});

process.exit(exitCode);
