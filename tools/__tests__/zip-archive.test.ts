// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readZip, writeZip, type ZipEntry } from "../zip-archive.js";

function entry(name: string, text: string): ZipEntry {
  return { name, data: Buffer.from(text) };
}

describe("zip-archive", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zip-archive-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads back what it wrote, names and bytes", () => {
    const written = [entry("a/b.txt", "hello"), entry("c.bin", "")];
    const read = readZip(writeZip(written));
    expect(read.map((e) => e.name)).toEqual(["a/b.txt", "c.bin"]);
    expect(read.map((e) => e.data.toString())).toEqual(["hello", ""]);
  });

  it("is byte-identical for the same entries however often it runs", () => {
    const entries = [entry("x", "1"), entry("y", "2")];
    expect(writeZip(entries).equals(writeZip(entries))).toBe(true);
  });

  it("writes entries sorted by name regardless of input order", () => {
    const zip = writeZip([entry("b", "2"), entry("a", "1")]);
    expect(readZip(zip).map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("carries no clock: the archive does not change with the wall time", () => {
    const first = writeZip([entry("a", "1")]);
    const later = (() => {
      const original = Date.now;
      Date.now = () => original() + 86_400_000;
      try {
        return writeZip([entry("a", "1")]);
      } finally {
        Date.now = original;
      }
    })();
    expect(later.equals(first)).toBe(true);
  });

  it("round-trips multi-byte names", () => {
    expect(readZip(writeZip([entry("skills/é–✓/SKILL.md", "x")]))[0]?.name).toBe(
      "skills/é–✓/SKILL.md",
    );
  });

  it("produces an archive the system unzip accepts and extracts identically", () => {
    const path = join(dir, "out.zip");
    writeFileSync(path, writeZip([entry("d/e.txt", "payload")]));
    const test = spawnSync("unzip", ["-tq", path], { encoding: "utf-8" });
    if (test.error) return; // no unzip on this host: the round-trip tests still pin the format
    expect(test.status).toBe(0);
    const out = spawnSync("unzip", ["-p", path, "d/e.txt"], { encoding: "utf-8" });
    expect(out.stdout).toBe("payload");
  });

  it("reads a deflated entry written by another tool", () => {
    const path = join(dir, "other.zip");
    writeFileSync(join(dir, "f.txt"), "deflate me ".repeat(50));
    const made = spawnSync("zip", ["-q", "-j", path, join(dir, "f.txt")], { encoding: "utf-8" });
    if (made.error || made.status !== 0) return; // no zip on this host
    const read = readZip(readFileSync(path));
    expect(read[0]?.data.toString()).toBe("deflate me ".repeat(50));
  });

  it("refuses duplicate entry names", () => {
    expect(() => writeZip([entry("a", "1"), entry("a", "2")])).toThrow(/duplicate/);
  });

  it.each(["", "/abs", "../up", "a/../b", "a\\b"])("refuses the unsafe entry name %j", (name) => {
    expect(() => writeZip([entry(name, "x")])).toThrow(/entry name/);
  });

  it("refuses bytes that are not a zip", () => {
    expect(() => readZip(Buffer.from("not a zip at all, just text"))).toThrow(/end of central/);
  });

  it("refuses an entry whose stored bytes no longer match its checksum", () => {
    const zip = Buffer.from(writeZip([entry("a", "payload")]));
    const at = zip.indexOf("payload");
    zip.writeUInt8(zip.readUInt8(at) ^ 0xff, at);
    expect(() => readZip(zip)).toThrow(/checksum/);
  });

  it("round-trips arbitrary entries (property)", () => {
    const name = fc.stringMatching(/^[a-z0-9][a-z0-9/._-]{0,20}$/).filter((n) => !n.includes(".."));
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ name, data: fc.uint8Array({ maxLength: 200 }) }), {
          selector: (e) => e.name,
          maxLength: 6,
        }),
        (entries) => {
          const input = entries.map((e) => ({ name: e.name, data: Buffer.from(e.data) }));
          const output = readZip(writeZip(input));
          const byName = (list: readonly ZipEntry[]) =>
            [...list].sort((a, b) => a.name.localeCompare(b.name));
          expect(byName(output).map((e) => [e.name, [...e.data]])).toEqual(
            byName(input).map((e) => [e.name, [...e.data]]),
          );
        },
      ),
    );
  });
});
