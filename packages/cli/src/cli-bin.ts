#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { buildSnapshot } from "@narrativetrace/tooling";
import { cliPackageDirectory, openCarrierFor } from "./carrier-locator.js";
import { runCli } from "./cli.js";

const cwd = process.cwd();

const exitCode = runCli(process.argv.slice(2), {
  cwd,
  env: process.env,
  buildSnapshot: (c, e) => buildSnapshot(c, e, cliPackageDirectory()),
  openCarrier: (from) => openCarrierFor(cwd, from),
  log: (message) => process.stdout.write(`${message}\n`),
  print: (text) => process.stdout.write(text),
  error: (message) => process.stderr.write(`${message}\n`),
});

process.exit(exitCode);
