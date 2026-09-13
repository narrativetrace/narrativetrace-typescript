// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// reflectable-engines: the published @narrativetrace/core package.json's engines.node.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("node_modules/@narrativetrace/core/package.json", "utf-8"));
console.log(pkg.engines?.node ?? "<no engines.node>");
