// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// A dedicated entry point (`@narrativetrace/vitest/global-setup`) so `vitest.config.ts` can wire
// `globalSetup: ["@narrativetrace/vitest/global-setup"]` without importing the main entry point,
// which pulls in "vitest" at module scope for the `narrativeTest` fixture — the same separation
// `reporters.ts` keeps for the suite reporters (see that file's own comment).
export { default } from "./run-identity-accumulator.js";
