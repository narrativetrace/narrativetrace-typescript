// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { crc32, inflateRawSync } from "node:zlib";

// A minimal, deterministic ZIP writer and a matching reader, on `node:zlib` alone: the repository
// has no archive dependency, and the OpenAI plugin package (tools/openai-plugin-pack.ts) needs
// exactly two things from one — bytes that do not depend on the clock or the host, and a way to read
// the built archive back so its entry list can be ASSERTED rather than trusted.
//
// Writer: entries sorted by name, STORED (method 0, never deflated — deflate output can differ
// between zlib versions, which would make "reproducible" depend on the Node build), the DOS
// timestamp fixed at 1980-01-01 00:00:00, Unix mode 0644, UTF-8 names. No directory entries, no
// extra fields, no comment, no ZIP64. Reader: stored and deflated entries, every entry's CRC-32
// verified, directory entries returned like any other (the caller filters them).

/** One archive member: a `/`-separated relative `name` and its bytes. */
export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
const UTF8_FLAG = 0x0800;
const VERSION_NEEDED = 20;
const MADE_BY_UNIX = (3 << 8) | VERSION_NEEDED;
const DOS_DATE_1980_01_01 = 0x0021;
const MODE_0644 = 0o100644 << 16;
const STORED = 0;
const DEFLATED = 8;

function checkName(name: string): void {
  const unsafe =
    name === "" ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.split("/").includes("..");
  if (unsafe) throw new RangeError(`unsafe entry name: ${JSON.stringify(name)}`);
}

function localHeader(name: Buffer, data: Buffer): Buffer {
  const header = Buffer.alloc(LOCAL_HEADER_BYTES);
  header.writeUInt32LE(LOCAL_SIGNATURE, 0);
  header.writeUInt16LE(VERSION_NEEDED, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(STORED, 8);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  return header;
}

function centralHeader(name: Buffer, data: Buffer, offset: number): Buffer {
  const header = Buffer.alloc(CENTRAL_HEADER_BYTES);
  header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
  header.writeUInt16LE(MADE_BY_UNIX, 4);
  header.writeUInt16LE(VERSION_NEEDED, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
  header.writeUInt32LE(crc32(data), 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(MODE_0644 >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endRecord(count: number, centralSize: number, centralOffset: number): Buffer {
  const record = Buffer.alloc(END_RECORD_BYTES);
  record.writeUInt32LE(END_SIGNATURE, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  return record;
}

function sortedByName(entries: readonly ZipEntry[]): ZipEntry[] {
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function checkNames(entries: readonly ZipEntry[]): void {
  const seen = new Set<string>();
  for (const { name } of entries) {
    checkName(name);
    const folded = name.toLowerCase();
    if (seen.has(folded)) throw new RangeError(`duplicate entry name: ${name}`);
    seen.add(folded);
  }
}

/**
 * Writes `entries` as a reproducible ZIP: the same entries give the same bytes on any host at any
 * time. Throws `RangeError` for a duplicate (ignoring case) or unsafe entry name (empty, absolute or
 * drive-lettered, containing `..`, a backslash or NUL) — an archive that extracts outside its own root is never built.
 */
export function writeZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = sortedByName(entries);
  checkNames(sorted);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of sorted) {
    const nameBytes = Buffer.from(name, "utf-8");
    const part = Buffer.concat([localHeader(nameBytes, data), nameBytes, data]);
    local.push(part);
    central.push(Buffer.concat([centralHeader(nameBytes, data, offset), nameBytes]));
    offset += part.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = endRecord(sorted.length, centralBytes.length, offset);
  return Buffer.concat([...local, centralBytes, end]);
}

function findEndRecord(zip: Buffer): number {
  const lowest = Math.max(0, zip.length - END_RECORD_BYTES - 0xffff);
  for (let at = zip.length - END_RECORD_BYTES; at >= lowest; at--) {
    if (zip.readUInt32LE(at) === END_SIGNATURE) return at;
  }
  throw new Error("not a zip: no end of central directory record");
}

function entryBytes(zip: Buffer, method: number, localOffset: number, size: number): Buffer {
  const nameLength = zip.readUInt16LE(localOffset + 26);
  const extraLength = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + LOCAL_HEADER_BYTES + nameLength + extraLength;
  const raw = zip.subarray(start, start + size);
  if (method === STORED) return raw;
  if (method === DEFLATED) return inflateRawSync(raw);
  throw new Error(`unsupported compression method ${method}`);
}

function readCentralEntry(zip: Buffer, at: number): { entry: ZipEntry; next: number } {
  if (zip.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error("corrupt central directory");
  const nameLength = zip.readUInt16LE(at + 28);
  const trailing = nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  const nameStart = at + CENTRAL_HEADER_BYTES;
  const name = zip.toString("utf-8", nameStart, nameStart + nameLength);
  const method = zip.readUInt16LE(at + 10);
  const data = entryBytes(zip, method, zip.readUInt32LE(at + 42), zip.readUInt32LE(at + 20));
  if (crc32(data) !== zip.readUInt32LE(at + 16))
    throw new Error(`checksum mismatch for entry ${name}`);
  return { entry: { name, data }, next: nameStart + trailing };
}

/**
 * Reads every entry of a ZIP, in central-directory order, verifying each entry's CRC-32. Directory
 * entries (names ending in `/`) are returned like any other. Throws `Error` for bytes that are not a
 * ZIP, a corrupt central directory, a checksum mismatch, or a compression method other than stored
 * and deflated. ZIP64 and encryption are not supported.
 */
export function readZip(zip: Buffer): ZipEntry[] {
  const end = findEndRecord(zip);
  const count = zip.readUInt16LE(end + 10);
  const entries: ZipEntry[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const { entry, next } = readCentralEntry(zip, at);
    entries.push(entry);
    at = next;
  }
  return entries;
}
