// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-narrativetrace-approve-bin: the published package's own "bin" field names a file
// that actually exists in the installed tarball.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("node_modules/@narrativetrace/vitest/package.json", "utf-8"));
const binPath = pkg.bin?.["narrativetrace-approve"];
const resolves =
  typeof binPath === "string" && existsSync(join("node_modules/@narrativetrace/vitest", binPath));
console.log(resolves ? "resolves" : "missing");
