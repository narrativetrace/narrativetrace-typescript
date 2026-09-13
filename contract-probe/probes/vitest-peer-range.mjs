// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// reflectable-vitest-peer-range: read straight off the installed package.json, nothing executed.
// Reads node_modules directly rather than `require("@narrativetrace/vitest/package.json")` — that
// package's own "exports" map does not list "./package.json", so Node would refuse the subpath.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("node_modules/@narrativetrace/vitest/package.json", "utf-8"));
console.log(pkg.peerDependencies?.vitest ?? "<no peerDependencies.vitest>");
