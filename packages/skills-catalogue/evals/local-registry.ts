// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * INTENT: the `checkout-registry` case setup's registry — this checkout's packed packages, served
 * to npm under the `@narrativetrace` scope ONLY (the trial's npmrc routes that one scope here;
 * every other package still comes from the public registry). An init-prompt trial then runs the
 * PUBLISHED prompt byte for byte, and every `npm install @narrativetrace/…` or `npx
 * @narrativetrace/cli` the agent types gets this checkout's code — the reference implementation's
 * local test repository, in npm's terms. Without it, the trial measures the release calendar: the
 * last published CLI has none of the checks the case is about.
 *
 * @llmNote Read-only by construction: GET only (anything else is 405), names it does not carry are
 * 404 (never proxied), and a tarball is served only by its exact file name from the one directory.
 */

/** The subset of a packed `package.json` a packument version carries through. */
export interface PackedManifest {
  readonly name: string;
  readonly version: string;
  readonly [field: string]: unknown;
}

/** One served package: its packed manifest and its tarball's file name and bytes. */
interface Served {
  readonly manifest: PackedManifest;
  readonly file: string;
  readonly bytes: Buffer;
}

export interface LocalRegistry {
  readonly port: number;
  /** `http://127.0.0.1:<port>/`, with the trailing slash npm expects of a registry. */
  readonly url: string;
  close(): Promise<void>;
}

/** The registry document npm reads for one package: this one version, tagged latest. */
export function packumentFor(manifest: PackedManifest, tarballUrl: string, bytes: Buffer) {
  const { name, version } = manifest;
  const shasum = createHash("sha1").update(bytes).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  return {
    name,
    "dist-tags": { latest: version },
    versions: {
      [version]: {
        ...manifest,
        _id: `${name}@${version}`,
        dist: { tarball: tarballUrl, shasum, integrity },
      },
    },
  };
}

/** The npmrc line that routes the `@narrativetrace` scope, and nothing else, to `port`. */
export function npmrcFor(port: number): string {
  return `@narrativetrace:registry=http://127.0.0.1:${port}/\n`;
}

/** The manifest a pack wrote into the tarball — never the workspace's `workspace:*` original. */
function packedManifest(tarball: string): PackedManifest {
  const text = execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
    encoding: "utf-8",
  });
  return JSON.parse(text) as PackedManifest;
}

function load(tarballDir: string): Map<string, Served> {
  const served = new Map<string, Served>();
  for (const file of readdirSync(tarballDir).filter((name) => name.endsWith(".tgz"))) {
    const path = join(tarballDir, file);
    const manifest = packedManifest(path);
    if (served.has(manifest.name)) {
      throw new Error(`two tarballs of ${manifest.name} in ${tarballDir} — which one is served?`);
    }
    served.set(manifest.name, { manifest, file, bytes: readFileSync(path) });
  }
  if (served.size === 0) throw new Error(`no .tgz to serve in ${tarballDir}`);
  return served;
}

const TARBALLS = "/tarballs/";

/** The request's path, percent-decoded — or `undefined` for one that does not decode. */
function decodedPath(url: string | undefined, base: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url ?? "/", base).pathname);
  } catch {
    return undefined;
  }
}

function respond(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
): void {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

function route(
  served: Map<string, Served>,
  base: string,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "read-only", "text/plain");
    return;
  }
  const path = decodedPath(request.url, base);
  if (path === undefined) {
    respond(response, 404, "{}", "application/json");
    return;
  }
  const byFile = [...served.values()].find((entry) => path === `${TARBALLS}${entry.file}`);
  if (byFile) {
    respond(response, 200, byFile.bytes, "application/octet-stream");
    return;
  }
  const entry = served.get(path.slice(1));
  if (entry === undefined) {
    respond(response, 404, "{}", "application/json");
    return;
  }
  const packument = packumentFor(
    entry.manifest,
    `${base}${TARBALLS.slice(1)}${entry.file}`,
    entry.bytes,
  );
  respond(response, 200, JSON.stringify(packument), "application/json");
}

/**
 * Serves every `.tgz` in `tarballDir` on 127.0.0.1, on a port the system picks.
 *
 * @throws {Error} when the directory holds no tarball — a registry with nothing in it would send
 * every scoped install back to... nowhere, and the trial would fail for a harness reason
 */
export async function startLocalRegistry(tarballDir: string): Promise<LocalRegistry> {
  const served = load(tarballDir);
  let base = "";
  const server = createServer((request, response) => route(served, base, request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}/`;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { port, url: base, close };
}

/**
 * `node --import tsx local-registry.ts <tarballDir> <npmrcPath>`: starts the registry, THEN writes
 * the npmrc (its appearance is the "ready" signal the runner waits for), and serves until killed.
 */
async function main(tarballDir: string, npmrcPath: string): Promise<void> {
  const registry = await startLocalRegistry(tarballDir);
  writeFileSync(npmrcPath, npmrcFor(registry.port));
  process.on("SIGTERM", () => void registry.close().then(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv[2] as string, process.argv[3] as string);
}
