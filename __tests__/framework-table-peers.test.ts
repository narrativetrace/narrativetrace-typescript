// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FRAMEWORK_ROWS } from "../packages/tooling/src/frameworks/framework-table.js";

interface Manifest {
  readonly name: string;
  readonly peerDependencies?: Record<string, string>;
}

function workspaceManifest(packageName: string): Manifest {
  const dir = packageName.slice("@narrativetrace/".length);
  return JSON.parse(readFileSync(`packages/${dir}/package.json`, "utf-8")) as Manifest;
}

/**
 * The doctor's install line must leave a project able to load the integration it adds: yarn and
 * older npm never install peers on their own, so every `@narrativetrace/*` peer the integration
 * declares is on the row's line. Read from the workspace's own manifests, so a peer added to an
 * integration later fails here until the row adds it too.
 */
describe("framework table install lines", () => {
  for (const row of FRAMEWORK_ROWS) {
    if (row.module === null) continue;
    const [integration, ...rest] = row.module.packages;
    test(`${row.id}: ${integration} is a workspace package and every NarrativeTrace peer is installed with it`, () => {
      const manifest = workspaceManifest(integration as string);
      expect(manifest.name).toBe(integration);
      const peers = Object.keys(manifest.peerDependencies ?? {}).filter((name) =>
        name.startsWith("@narrativetrace/"),
      );
      expect(peers.filter((peer) => !rest.includes(peer))).toEqual([]);
    });
  }
});
