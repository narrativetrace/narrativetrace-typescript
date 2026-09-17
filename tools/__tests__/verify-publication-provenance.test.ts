// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  expectedSubjectName,
  isProvenanceExempt,
  verifyProvenance,
} from "../verify-publication-provenance.js";

describe("expectedSubjectName", () => {
  it("percent-encodes the @ before a scope, keeps the slash literal", () => {
    expect(expectedSubjectName("@narrativetrace/core", "0.1.1")).toBe(
      "pkg:npm/%40narrativetrace/core@0.1.1",
    );
  });

  it("names an unscoped package without any encoding", () => {
    expect(expectedSubjectName("left-pad", "1.0.0")).toBe("pkg:npm/left-pad@1.0.0");
  });
});

function dsseAttestation(predicateType: string, subject: unknown): unknown {
  const payload = Buffer.from(JSON.stringify({ predicateType, subject: [subject] })).toString(
    "base64",
  );
  return { bundle: { dsseEnvelope: { payload } } };
}

describe("verifyProvenance", () => {
  const name = "@narrativetrace/core";
  const version = "0.1.1";
  const tarball = Buffer.from("pretend-tarball-bytes");
  const sha512 = createHash("sha512").update(tarball).digest("hex");
  const subject = { name: expectedSubjectName(name, version), digest: { sha512 } };

  it("reports not advertised when the registry has no dist.attestations", async () => {
    const result = await verifyProvenance(name, version, {
      fetchJson: async () => ({ dist: { tarball: "https://example/t.tgz" } }),
      fetchBuffer: async () => tarball,
    });
    expect(result).toMatchObject({ attestationsAdvertised: false, ok: false });
  });

  it("passes when both predicates are present and the digest matches the real tarball", async () => {
    const result = await verifyProvenance(name, version, {
      fetchJson: async (url) =>
        url.includes("/-/npm/v1/attestations/")
          ? {
              attestations: [
                dsseAttestation(
                  "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
                  subject,
                ),
                dsseAttestation("https://slsa.dev/provenance/v1", subject),
              ],
            }
          : {
              dist: {
                tarball: "https://example/t.tgz",
                attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/x" },
              },
            },
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(true);
    expect(result.subjectNameMatches).toBe(true);
    expect(result.digestMatches).toBe(true);
  });

  it("fails when the tarball digest does not match the attestation's subject", async () => {
    const result = await verifyProvenance(name, version, {
      fetchJson: async (url) =>
        url.includes("/-/npm/v1/attestations/")
          ? {
              attestations: [
                dsseAttestation(
                  "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
                  subject,
                ),
                dsseAttestation("https://slsa.dev/provenance/v1", subject),
              ],
            }
          : {
              dist: {
                tarball: "https://example/t.tgz",
                attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/x" },
              },
            },
      fetchBuffer: async () => Buffer.from("a different tarball entirely"),
    });
    expect(result.ok).toBe(false);
    expect(result.digestMatches).toBe(false);
  });

  it("fails when the subject names a different package", async () => {
    const wrongSubject = {
      name: expectedSubjectName("@narrativetrace/proxy", version),
      digest: { sha512 },
    };
    const result = await verifyProvenance(name, version, {
      fetchJson: async (url) =>
        url.includes("/-/npm/v1/attestations/")
          ? {
              attestations: [
                dsseAttestation(
                  "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
                  wrongSubject,
                ),
                dsseAttestation("https://slsa.dev/provenance/v1", wrongSubject),
              ],
            }
          : {
              dist: {
                tarball: "https://example/t.tgz",
                attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/x" },
              },
            },
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(false);
    expect(result.subjectNameMatches).toBe(false);
  });
});

describe("isProvenanceExempt", () => {
  it("is true for exactly the reviewed, version-pinned bootstrap publish", () => {
    expect(isProvenanceExempt("@narrativetrace/cli", "0.1.3")).toBe(true);
  });

  it("is false for a later version of the same package — the exemption is never open-ended", () => {
    expect(isProvenanceExempt("@narrativetrace/cli", "0.1.4")).toBe(false);
  });

  it("is false for a different package at the exempt version", () => {
    expect(isProvenanceExempt("@narrativetrace/core", "0.1.3")).toBe(false);
  });

  it("is false for an unrelated package/version pair", () => {
    expect(isProvenanceExempt("left-pad", "1.0.0")).toBe(false);
  });
});

describe("verifyProvenance — PROVENANCE_EXEMPT", () => {
  const noAttestations = async () => ({ dist: { tarball: "https://example/t.tgz" } });
  const tarball = Buffer.from("pretend-tarball-bytes");

  it("lets the reviewed, version-pinned bootstrap publish through as ok + exempt when no attestations are advertised", async () => {
    const result = await verifyProvenance("@narrativetrace/cli", "0.1.3", {
      fetchJson: noAttestations,
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(true);
    expect(result.exempt).toBe(true);
    expect(result.detail).toContain("EXEMPT");
  });

  it("still fails a LATER version of the exempt package with no attestations — the exemption is never open-ended", async () => {
    const result = await verifyProvenance("@narrativetrace/cli", "0.1.4", {
      fetchJson: noAttestations,
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(false);
    expect(result.exempt).toBe(false);
  });

  it("still fails every OTHER package at the exempt version with no attestations", async () => {
    const result = await verifyProvenance("@narrativetrace/core", "0.1.3", {
      fetchJson: noAttestations,
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(false);
    expect(result.exempt).toBe(false);
  });

  it("does NOT exempt the bootstrap publish from a real integrity mismatch when attestations ARE advertised but wrong", async () => {
    const name = "@narrativetrace/cli";
    const version = "0.1.3";
    const wrongSubject = {
      name: expectedSubjectName("@narrativetrace/proxy", version),
      digest: { sha512: createHash("sha512").update(tarball).digest("hex") },
    };
    const result = await verifyProvenance(name, version, {
      fetchJson: async (url) =>
        url.includes("/-/npm/v1/attestations/")
          ? {
              attestations: [
                dsseAttestation(
                  "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
                  wrongSubject,
                ),
                dsseAttestation("https://slsa.dev/provenance/v1", wrongSubject),
              ],
            }
          : {
              dist: {
                tarball: "https://example/t.tgz",
                attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/x" },
              },
            },
      fetchBuffer: async () => tarball,
    });
    expect(result.ok).toBe(false);
    expect(result.exempt).toBe(false);
  });
});
