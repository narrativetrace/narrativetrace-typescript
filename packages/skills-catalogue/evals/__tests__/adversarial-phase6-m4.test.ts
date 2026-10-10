// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type CheckoutPackage,
  checkoutPackages,
  isCaseSetup,
  packCommands,
  publishablePackages,
  setupCommands,
  tarballName,
} from "../case-setup.js";
import { type LocalRegistry, startLocalRegistry } from "../local-registry.js";

let root: string;
let tarballs: string;
let registry: LocalRegistry | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "adv-phase6-m4-skills-"));
  tarballs = join(root, "tarballs");
  mkdirSync(tarballs);
});

afterEach(async () => {
  await registry?.close();
  registry = undefined;
  rmSync(root, { recursive: true, force: true });
});

/** A `.tgz` in `tarballs` holding the given members, paths relative to the archive root. */
function packTgz(file: string, members: Record<string, string>): void {
  const stage = mkdtempSync(join(root, "stage-"));
  for (const [rel, content] of Object.entries(members)) {
    mkdirSync(join(stage, rel, ".."), { recursive: true });
    writeFileSync(join(stage, rel), content);
  }
  execFileSync("tar", ["-czf", join(tarballs, file), "-C", stage, ...Object.keys(members)]);
}

function manifestTgz(file: string, name: string, version: string): void {
  packTgz(file, { "package/package.json": JSON.stringify({ name, version }) });
}

/** A raw HTTP request, so the path reaches the server exactly as written (no client normalisation). */
function send(
  port: number,
  method: string,
  path: string,
): Promise<{ status: number; body: string; raw: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          raw: Buffer.concat(chunks),
        }),
      );
    });
    req.setTimeout(5000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

describe("local registry (adversarial)", () => {
  test("a malformed percent-encoded path is answered 404 without crashing the registry", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    const port = registry.port;
    const response = await send(port, "GET", "/%E0%A4%A");
    expect(response.status).toBe(404);
    expect((await send(port, "GET", "/@narrativetrace/cli")).status).toBe(200);
  }, 15000);

  test("a HEAD request for a packument returns 200 with no body", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    const response = await send(registry.port, "HEAD", "/@narrativetrace/cli");
    expect(response.status).toBe(200);
    expect(response.body).toBe("");
  }, 15000);

  test("PUT and DELETE are refused with 405 and never change what is served", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    expect((await send(registry.port, "PUT", "/@narrativetrace/cli")).status).toBe(405);
    expect((await send(registry.port, "DELETE", "/@narrativetrace/cli")).status).toBe(405);
  }, 15000);

  test("a query string does not change which package is served", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    expect((await send(registry.port, "GET", "/@narrativetrace/cli?write=true")).status).toBe(200);
  }, 15000);

  test("an encoded scope separator serves the same packument as the plain path", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    const encoded = await send(registry.port, "GET", "/@narrativetrace%2fcli");
    expect(encoded.status).toBe(200);
    expect(JSON.parse(encoded.body).name).toBe("@narrativetrace/cli");
  }, 15000);

  test("a package the registry does not carry is 404 and never proxied", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    expect((await send(registry.port, "GET", "/left-pad")).status).toBe(404);
  }, 15000);

  test("a tarball is served only by its exact file name", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    const port = registry.port;
    expect((await send(port, "GET", "/tarballs/narrativetrace-cli-1.0.0.tgz")).status).toBe(200);
    expect((await send(port, "GET", "/tarballs/narrativetrace-cli-1.0.0.tgz.bak")).status).toBe(
      404,
    );
    expect((await send(port, "GET", "/tarballs/narrativetrace-cli-9.9.9.tgz")).status).toBe(404);
  }, 15000);

  test("the packument's tarball URL points back at this registry and its integrity matches the bytes", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    registry = await startLocalRegistry(tarballs);
    const packument = JSON.parse(
      (await send(registry.port, "GET", "/@narrativetrace/cli")).body,
    ) as { versions: Record<string, { dist: { tarball: string; integrity: string } }> };
    const dist = packument.versions["1.0.0"]?.dist as { tarball: string; integrity: string };
    expect(dist.tarball).toBe(`${registry.url}tarballs/narrativetrace-cli-1.0.0.tgz`);
    const tgz = await send(registry.port, "GET", "/tarballs/narrativetrace-cli-1.0.0.tgz");
    const digest = createHash("sha512").update(tgz.raw).digest("base64");
    expect(dist.integrity).toBe(`sha512-${digest}`);
  }, 15000);

  test("two tarballs of the same package name are refused at startup", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    manifestTgz("narrativetrace-cli-1.0.1.tgz", "@narrativetrace/cli", "1.0.1");
    await expect(startLocalRegistry(tarballs)).rejects.toThrow(/@narrativetrace\/cli/);
  }, 15000);

  test("a tarball without a package.json is refused at startup, naming the tarball", async () => {
    packTgz("narrativetrace-cli-1.0.0.tgz", { "package/readme.md": "no manifest" });
    await expect(startLocalRegistry(tarballs)).rejects.toThrow(/narrativetrace-cli-1\.0\.0\.tgz/);
  }, 15000);

  test("a non-tgz file in the tarball directory is ignored", async () => {
    manifestTgz("narrativetrace-cli-1.0.0.tgz", "@narrativetrace/cli", "1.0.0");
    writeFileSync(join(tarballs, "notes.txt"), "not a package");
    registry = await startLocalRegistry(tarballs);
    expect((await send(registry.port, "GET", "/notes.txt")).status).toBe(404);
  }, 15000);

  test("an empty tarball directory is refused at startup", async () => {
    await expect(startLocalRegistry(tarballs)).rejects.toThrow(/no \.tgz to serve/);
  }, 15000);
});

const PKG = (name: string, version = "1.2.3"): CheckoutPackage => ({
  name,
  version,
  dir: `/repo/packages/${name.slice("@narrativetrace/".length)}`,
});

// Decided, not tested (2026-10-09 adversarial pass): two packages/ directories claiming one name
// cannot happen — pnpm refuses such a workspace before anything here runs; and a dependency name
// holding `..` cannot be an npm package name, while the names read here come from committed
// fixtures.
describe("case setup (adversarial)", () => {
  test("publishablePackages skips a manifest whose name is not a string", () => {
    const manifests: Record<string, unknown> = {
      a: { name: 42, version: "1.0.0" },
      b: { name: "@narrativetrace/b", version: "1.0.0" },
    };
    const found = publishablePackages(
      "/repo",
      () => ["a", "b"],
      (p) => manifests[p.split("/")[3] as string],
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/b"]);
  });

  test("publishablePackages skips a directory whose package.json is unreadable", () => {
    const found = publishablePackages(
      "/repo",
      () => ["broken", "ok"],
      (p) => {
        if (p.includes("broken")) throw new Error("ENOENT");
        return { name: "@narrativetrace/ok", version: "1.0.0" };
      },
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/ok"]);
  });

  test("publishablePackages skips a private package even when it is scoped", () => {
    const manifests: Record<string, unknown> = {
      priv: { name: "@narrativetrace/priv", version: "1.0.0", private: true },
      pub: { name: "@narrativetrace/pub", version: "1.0.0" },
    };
    const found = publishablePackages(
      "/repo",
      () => ["priv", "pub"],
      (p) => manifests[p.split("/")[3] as string],
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/pub"]);
  });

  test("publishablePackages refuses a publishable package that has no version", () => {
    expect(() =>
      publishablePackages(
        "/repo",
        () => ["x"],
        () => ({ name: "@narrativetrace/x", version: "" }),
      ),
    ).toThrow(/no version/);
  });

  test("checkoutPackages follows an optionalDependency to its workspace package", () => {
    const readJson = (path: string) =>
      path.includes("/optional/")
        ? { name: "@narrativetrace/optional", version: "1.0.0" }
        : { name: "@narrativetrace/fixture", version: "1.0.0" };
    const found = checkoutPackages(
      { name: "fixture", optionalDependencies: { "@narrativetrace/optional": "1.0.0" } } as never,
      "/repo",
      readJson,
    );
    expect(found.map((p) => p.name)).toContain("@narrativetrace/optional");
  });

  test("checkoutPackages stops at a dependency cycle instead of looping", () => {
    const readJson = (path: string) =>
      path.includes("/a/")
        ? {
            name: "@narrativetrace/a",
            version: "1.0.0",
            dependencies: { "@narrativetrace/b": "1" },
          }
        : {
            name: "@narrativetrace/b",
            version: "1.0.0",
            dependencies: { "@narrativetrace/a": "1" },
          };
    const found = checkoutPackages(
      { dependencies: { "@narrativetrace/a": "1" } } as never,
      "/repo",
      readJson,
    );
    expect(found.map((p) => p.name)).toEqual(["@narrativetrace/a", "@narrativetrace/b"]);
  });

  test("checkoutPackages refuses a workspace directory whose manifest names another package", () => {
    const readJson = () => ({ name: "@narrativetrace/other", version: "1.0.0" });
    expect(() =>
      checkoutPackages(
        { dependencies: { "@narrativetrace/wanted": "1" } } as never,
        "/repo",
        readJson,
      ),
    ).toThrow(/names @narrativetrace\/other, not @narrativetrace\/wanted/);
  });

  test("tarballName matches the file pnpm pack writes for a scoped package", () => {
    expect(tarballName(PKG("@narrativetrace/core-node", "0.2.0-rc.1"))).toBe(
      "narrativetrace-core-node-0.2.0-rc.1.tgz",
    );
  });

  test("packCommands with no packages yields no commands", () => {
    expect(packCommands([], "/work")).toEqual([]);
  });

  test("setupCommands packs every package, then installs all tarballs in one npm call, then inits", () => {
    const packages = [PKG("@narrativetrace/cli"), PKG("@narrativetrace/core")];
    const commands = setupCommands(packages, "/work", "/work/project", "claude");
    const install = commands.find((c) => c.argv[0] === "npm");
    expect(commands.filter((c) => c.argv[0] === "pnpm")).toHaveLength(2);
    expect(install?.argv.filter((a) => a.endsWith(".tgz"))).toHaveLength(2);
    expect(commands[commands.length - 1]?.argv).toContain("init");
  });

  test("setupCommands maps the codex and gemini platforms to vendor none, not claude", () => {
    const init = (platform: "codex" | "gemini") =>
      setupCommands([PKG("@narrativetrace/cli")], "/work", "/p", platform).at(-1)?.argv;
    expect(init("codex")).toEqual(expect.arrayContaining(["--vendor", "none"]));
    expect(init("gemini")).toEqual(expect.arrayContaining(["--vendor", "none"]));
  });

  test("isCaseSetup rejects a near-miss spelling and an inherited object key", () => {
    expect(isCaseSetup("checkout-install ")).toBe(false);
    expect(isCaseSetup("Checkout-Install")).toBe(false);
    expect(isCaseSetup("constructor")).toBe(false);
  });
});
