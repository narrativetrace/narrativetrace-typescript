// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type DomainVocabulary,
  emptyVocabulary,
  isAcceptedAbbreviation,
} from "./domain-vocabulary.js";

export type AbbreviationTier = "universal" | "wellKnown" | "ambiguous";

const UNIVERSAL = new Set([
  "id",
  "url",
  "uri",
  "api",
  "html",
  "xml",
  "json",
  "http",
  "https",
  "db",
  "io",
  "ui",
  "sql",
  "css",
  "tcp",
  "udp",
  "ip",
  "dns",
  "ssh",
  "ssl",
  "tls",
  "jwt",
  "cpu",
  "gpu",
  "ram",
  "os",
  "jvm",
  "gc",
  "uuid",
  "sdk",
  "grpc",
  "sso",
  "mfa",
  "pii",
  "kpi",
]);

const WELL_KNOWN = new Set([
  "ctx",
  "cfg",
  "config",
  "mgr",
  "util",
  "impl",
  "src",
  "dest",
  "dst",
  "buf",
  "idx",
  "tmp",
  "temp",
  "auth",
  "repo",
  "env",
  "async",
  "sync",
  "param",
  "params",
  "attr",
  "attrs",
  "ref",
  "conn",
  "stmt",
  "msg",
  "req",
  "res",
  "resp",
  "err",
  "exc",
  "ex",
  "cmd",
  "arg",
  "args",
  "val",
  "var",
  "vars",
  "str",
  "num",
  "len",
  "pos",
  "prev",
  "cur",
  "curr",
  "iter",
  "obj",
  "fn",
  "func",
  "cb",
  "evt",
  "elem",
  "elems",
  "prop",
  "props",
  "dir",
  "lib",
  "pkg",
  "ver",
  "doc",
  "docs",
  "spec",
  "opt",
  "fmt",
  "seq",
  "init",
  "dyn",
  "alloc",
  "dealloc",
  "chan",
  "ack",
  "nack",
  "coll",
  "desc",
  "info",
  "stat",
  "stats",
  "cnt",
  "avg",
  "pct",
  "delim",
  "sep",
  "hdr",
  "svc",
  "txn",
  "tx",
  "ttl",
  "qps",
  "rps",
  "mtls",
  "oidc",
  "sli",
  "slo",
  "sla",
  "etl",
  "elt",
  "cdc",
  "oltp",
  "olap",
  "p99",
  "llm",
  "asr",
  "tts",
  "ner",
  "ocr",
  "totp",
  "siem",
  "soc2",
  "gdpr",
  "hipaa",
]);

const AMBIGUOUS = new Set([
  "cust",
  "proc",
  "mod",
  "del",
  "acc",
  "op",
  "rec",
  "sec",
  "gen",
  "app",
  "ord",
  "calc",
  "cat",
  "comp",
  "loc",
  "perm",
  "reg",
  "srv",
  "tgt",
  "hdl",
  "blk",
  "chk",
  "clr",
  "cmp",
  "cpy",
  "dup",
  "flt",
  "grp",
  "lbl",
  "lvl",
  "mgmt",
  "neg",
  "orig",
  "pfx",
  "sfx",
  "sig",
  "sym",
  "tbl",
  "tok",
  "usr",
  "wgt",
  "rag",
]);

const TIER_SCORES: Record<AbbreviationTier, number> = {
  universal: 1.0,
  wellKnown: 0.8,
  ambiguous: 0.5,
};

/**
 * Looks one token up as an abbreviation.
 *
 * @remarks A token listed in the project's glossary `abbreviations` section returns `undefined` —
 * the same answer as a word the dictionary never knew. Callers already treat `undefined` as "not an
 * abbreviation", so accepted shorthand is neither scored down nor asked to be spelled out, which is
 * exactly what listing `fx` or `acc` means. Being a token of some committed *term* does not accept
 * it: that made acceptance a side effect of harvesting rather than a decision.
 */
export function classifyAbbreviation(
  token: string,
  vocabulary: DomainVocabulary = emptyVocabulary,
): AbbreviationTier | undefined {
  const lower = token.toLowerCase();
  if (isAcceptedAbbreviation(vocabulary, lower)) return undefined;
  if (UNIVERSAL.has(lower)) return "universal";
  if (WELL_KNOWN.has(lower)) return "wellKnown";
  if (AMBIGUOUS.has(lower)) return "ambiguous";
  return undefined;
}

export function abbreviationScore(tier: AbbreviationTier): number {
  return TIER_SCORES[tier];
}

export function allKnownAbbreviations(): readonly string[] {
  return [...UNIVERSAL.values(), ...WELL_KNOWN.values(), ...AMBIGUOUS.values()];
}

export function abbreviationDictionaryMetrics(): {
  abbreviationCount: number;
} {
  return {
    abbreviationCount: new Set(allKnownAbbreviations()).size,
  };
}
