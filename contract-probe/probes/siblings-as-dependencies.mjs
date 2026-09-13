// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// reflectable-siblings-as-dependencies: the four siblings the docs name are regular
// "dependencies" (not peerDependencies) in the published @narrativetrace/vitest package.json.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("node_modules/@narrativetrace/vitest/package.json", "utf-8"));
const siblings = [
  "@narrativetrace/core-node",
  "@narrativetrace/clarity",
  "@narrativetrace/diagrams",
  "@narrativetrace/glossary",
];
const deps = pkg.dependencies ?? {};
const peers = pkg.peerDependencies ?? {};
const allAsDependencies = siblings.every((name) => name in deps && !(name in peers));
console.log(allAsDependencies ? "dependencies" : "not-all-as-dependencies");
