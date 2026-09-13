#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { runCli } from "./cli.js";
import { buildSnapshot } from "./doctor/environment.js";

const exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  buildSnapshot,
  log: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
});

process.exit(exitCode);
