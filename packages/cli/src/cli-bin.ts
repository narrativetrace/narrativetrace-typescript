#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { buildSnapshot } from "@narrativetrace/tooling";
import { cliPackageDirectory, openCarrierFor } from "./carrier-locator.js";
import { runCli } from "./cli.js";
import { ghAuthenticated } from "./gh-auth-probe.js";

const cwd = process.cwd();

const exitCode = runCli(process.argv.slice(2), {
  cwd,
  env: process.env,
  buildSnapshot: (c, e) => buildSnapshot(c, e, cliPackageDirectory()),
  openCarrier: (from) => openCarrierFor(cwd, from),
  ghAuthenticated,
  log: (message) => process.stdout.write(`${message}\n`),
  print: (text) => process.stdout.write(text),
  error: (message) => process.stderr.write(`${message}\n`),
});

// Exit only once both streams have flushed: `process.exit` drops whatever a PIPED stdout has not
// drained yet, so a plan past the 64 KiB pipe buffer lost its last hunks to `| less` or a capture.
// An empty write's callback runs after every earlier write on the same stream.
process.stdout.write("", () => process.stderr.write("", () => process.exit(exitCode)));
