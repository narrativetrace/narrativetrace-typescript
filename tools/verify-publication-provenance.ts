// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createHash } from "node:crypto";
import { DEFAULT_REGISTRY_BASE } from "./verify-publication-registry.js";

/**
 * What this tool does NOT verify, and precisely why: the Sigstore certificate chain (Fulcio) and
 * Rekor transparency-log inclusion proof that make an attestation bundle cryptographically
 * trustworthy. Doing that for real means either depending on the `sigstore` package's trust-root
 * verification stack (a TUF-distributed root bundle, certificate-chain validation, Merkle
 * inclusion-proof checking against Rekor) or reimplementing it — the first is a real dependency
 * this tool does not otherwise need, the second duplicates a security-critical library badly.
 * What IS verified below is the part that needs no such stack and is not "it installs" theater:
 * the registry advertises both attestations `npm publish --provenance` produces, and each one's
 * subject digest matches the SHA-512 of the tarball actually served for this exact version — the
 * attestation is bound to these exact bytes, not merely present next to them.
 */
export const PROVENANCE_SCOPE_NOTE =
  "cryptographic signature / Rekor transparency-log verification is not performed (would need " +
  "the `sigstore` trust-root stack); this tool asserts attestation presence and subject-digest " +
  "content-binding against the actual published tarball instead.";

const PUBLISH_PREDICATE = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const SLSA_PREDICATE = "https://slsa.dev/provenance/v1";

export interface ProvenanceCheck {
  readonly name: string;
  readonly version: string;
  readonly attestationsAdvertised: boolean;
  readonly predicateTypesFound: readonly string[];
  readonly subjectNameMatches: boolean;
  readonly digestMatches: boolean;
  readonly ok: boolean;
  readonly detail: string;
}

interface DsseAttestation {
  readonly bundle?: {
    readonly dsseEnvelope?: { readonly payload?: string };
  };
}

interface AttestationSubject {
  readonly name?: string;
  readonly digest?: { readonly sha512?: string };
}

interface AttestationPayload {
  readonly predicateType?: string;
  readonly subject?: readonly AttestationSubject[];
}

/** The purl `subject[0].name` npm's attestations use: `pkg:npm/%40scope/name@version` for a
 * scoped package, `pkg:npm/name@version` otherwise. */
export function expectedSubjectName(name: string, version: string): string {
  if (!name.startsWith("@")) return `pkg:npm/${name}@${version}`;
  const [scope, unscoped] = name.slice(1).split("/", 2);
  return `pkg:npm/%40${scope}/${unscoped}@${version}`;
}

function decodePayload(attestation: DsseAttestation): AttestationPayload | undefined {
  const payload = attestation.bundle?.dsseEnvelope?.payload;
  if (!payload) return undefined;
  return JSON.parse(Buffer.from(payload, "base64").toString("utf-8")) as AttestationPayload;
}

interface VersionMetadata {
  readonly dist?: {
    readonly tarball?: string;
    readonly attestations?: {
      readonly url?: string;
      readonly provenance?: { readonly predicateType?: string };
    };
  };
}

export type FetchJson = (url: string) => Promise<unknown>;
export type FetchBuffer = (url: string) => Promise<Buffer>;

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function defaultFetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function notAdvertised(name: string, version: string): ProvenanceCheck {
  return {
    name,
    version,
    attestationsAdvertised: false,
    predicateTypesFound: [],
    subjectNameMatches: false,
    digestMatches: false,
    ok: false,
    detail: "registry metadata carries no dist.attestations — published without provenance",
  };
}

function evaluatePayloads(
  name: string,
  version: string,
  payloads: readonly AttestationPayload[],
  actualSha512: string,
): ProvenanceCheck {
  const expectedSubject = expectedSubjectName(name, version);
  const predicateTypesFound = payloads.map((p) => p.predicateType).filter((p): p is string => !!p);
  const subjects = payloads.map((p) => p.subject?.[0]).filter((s): s is AttestationSubject => !!s);
  const subjectNameMatches =
    subjects.length > 0 && subjects.every((s) => s.name === expectedSubject);
  const digestMatches =
    subjects.length > 0 && subjects.every((s) => s.digest?.sha512 === actualSha512);
  const hasBothPredicates =
    predicateTypesFound.includes(PUBLISH_PREDICATE) && predicateTypesFound.includes(SLSA_PREDICATE);
  const ok = subjectNameMatches && digestMatches && hasBothPredicates;
  const detail = ok
    ? `${predicateTypesFound.length} attestation(s), subject + tarball digest both match`
    : `mismatch — predicates=[${predicateTypesFound.join(", ")}] subjectNameMatches=${subjectNameMatches} digestMatches=${digestMatches}`;
  return {
    name,
    version,
    attestationsAdvertised: true,
    predicateTypesFound,
    subjectNameMatches,
    digestMatches,
    ok,
    detail,
  };
}

export interface VerifyProvenanceOptions {
  readonly registryBase?: string;
  readonly fetchJson?: FetchJson;
  readonly fetchBuffer?: FetchBuffer;
}

/**
 * Verifies one package version's npm provenance: the registry must advertise both the npm
 * publish attestation and the SLSA provenance attestation, and each attestation's subject must
 * name this exact package/version and carry a digest matching the SHA-512 of the tarball the
 * registry actually serves for it. See {@link PROVENANCE_SCOPE_NOTE} for what this deliberately
 * does not attempt.
 */
export async function verifyProvenance(
  name: string,
  version: string,
  options: VerifyProvenanceOptions = {},
): Promise<ProvenanceCheck> {
  const registryBase = options.registryBase ?? DEFAULT_REGISTRY_BASE;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const fetchBuffer = options.fetchBuffer ?? defaultFetchBuffer;

  const meta = (await fetchJson(`${registryBase}/${name}/${version}`)) as VersionMetadata;
  const attestationsUrl = meta.dist?.attestations?.url;
  const tarballUrl = meta.dist?.tarball;
  if (!attestationsUrl || !tarballUrl) return notAdvertised(name, version);

  const bundle = (await fetchJson(attestationsUrl)) as { attestations?: DsseAttestation[] };
  const payloads = (bundle.attestations ?? [])
    .map(decodePayload)
    .filter((p): p is AttestationPayload => !!p);

  const tarball = await fetchBuffer(tarballUrl);
  const actualSha512 = createHash("sha512").update(tarball).digest("hex");

  return evaluatePayloads(name, version, payloads, actualSha512);
}
