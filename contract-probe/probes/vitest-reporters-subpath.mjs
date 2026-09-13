// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-vitest-reporters-subpath: "@narrativetrace/vitest/reporters" must be an importable
// subpath export.
try {
  await import("@narrativetrace/vitest/reporters");
  console.log("resolves");
} catch {
  console.log("missing");
}
