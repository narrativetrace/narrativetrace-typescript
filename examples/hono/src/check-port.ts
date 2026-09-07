// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createServer } from "node:net";

export function checkPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      console.error(
        `Port ${port} is already in use. Stop the other process or use PORT=<number> to pick a different port.`,
      );
      process.exit(1);
    });
    server.listen(port, () => server.close(() => resolve()));
  });
}
