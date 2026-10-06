#!/usr/bin/env -S npx tsx
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Tier B trial runner CLI (skill-harness-design.md §4.3, §5.1) — see `runner.ts` for the whole
 * scaffold -> drive agent -> grade -> append-ledger-row flow and its injectable seams, and
 * `README.md` for the invocation and the sporadic-lanes policy. NEVER invoked by `pnpm run
 * check` — the owner runs this by hand or from the nightly job, against a subscription CLI,
 * never the metered API.
 *
 *   pnpm exec tsx evals/run.ts --skill narrativetrace-doctor --case happy-path \
 *     --platform claude --model <cheapest-available>
 */
import { runCli } from "./runner.js";

runCli(process.argv.slice(2), import.meta.dirname);
