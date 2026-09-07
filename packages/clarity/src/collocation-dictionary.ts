// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
const BUSINESS_CORE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "order",
    new Set([
      "place",
      "create",
      "cancel",
      "update",
      "submit",
      "process",
      "fulfill",
      "ship",
      "track",
      "return",
    ]),
  ],
  [
    "customer",
    new Set([
      "find",
      "validate",
      "register",
      "create",
      "update",
      "delete",
      "notify",
      "verify",
      "authenticate",
    ]),
  ],
  [
    "payment",
    new Set([
      "charge",
      "process",
      "refund",
      "authorize",
      "capture",
      "verify",
      "cancel",
      "create",
      "validate",
    ]),
  ],
  [
    "inventory",
    new Set(["reserve", "check", "update", "allocate", "release", "track", "count", "replenish"]),
  ],
  ["stock", new Set(["allocate", "release", "reserve", "check", "update", "transfer", "count"])],
  [
    "account",
    new Set([
      "create",
      "close",
      "suspend",
      "activate",
      "verify",
      "update",
      "delete",
      "lock",
      "unlock",
    ]),
  ],
  [
    "user",
    new Set([
      "create",
      "delete",
      "update",
      "find",
      "authenticate",
      "authorize",
      "register",
      "block",
      "notify",
    ]),
  ],
  [
    "product",
    new Set([
      "create",
      "update",
      "delete",
      "find",
      "list",
      "publish",
      "archive",
      "search",
      "categorize",
    ]),
  ],
  [
    "invoice",
    new Set(["create", "send", "cancel", "pay", "generate", "void", "approve", "process"]),
  ],
  [
    "email",
    new Set(["send", "receive", "compose", "forward", "delete", "archive", "read", "draft"]),
  ],
  [
    "report",
    new Set(["generate", "export", "schedule", "create", "publish", "archive", "download"]),
  ],
  [
    "transaction",
    new Set(["create", "commit", "rollback", "process", "validate", "log", "reverse"]),
  ],
  ["notification", new Set(["send", "create", "schedule", "cancel", "deliver", "read", "dismiss"])],
  [
    "session",
    new Set(["create", "destroy", "validate", "refresh", "extend", "expire", "invalidate"]),
  ],
  ["token", new Set(["generate", "validate", "refresh", "revoke", "decode", "verify", "issue"])],
  ["password", new Set(["hash", "validate", "reset", "change", "verify", "generate", "encrypt"])],
  [
    "file",
    new Set(["upload", "download", "delete", "read", "write", "create", "move", "copy", "rename"]),
  ],
  ["cache", new Set(["get", "set", "invalidate", "clear", "refresh", "evict", "warm", "update"])],
  ["connection", new Set(["open", "close", "create", "destroy", "pool", "validate", "reset"])],
  [
    "request",
    new Set(["send", "validate", "process", "handle", "parse", "forward", "retry", "cancel"]),
  ],
  ["response", new Set(["send", "build", "format", "parse", "validate", "cache", "compress"])],
  ["config", new Set(["load", "save", "validate", "update", "parse", "merge", "reset"])],
  ["log", new Set(["write", "read", "rotate", "archive", "clear", "parse", "flush"])],
]);

const FINANCE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["account", new Set(["debit", "credit", "balance", "close", "reconcile", "freeze"])],
  ["ledger", new Set(["reconcile", "balance", "post", "close"])],
  ["payment", new Set(["authorize", "capture", "disburse", "remit", "settle", "refund", "void"])],
  ["loan", new Set(["originate", "underwrite", "amortize", "service", "default"])],
  ["invoice", new Set(["issue", "settle", "void", "dispute"])],
  ["transaction", new Set(["commit", "rollback", "authorize", "settle", "void", "reverse"])],
  ["portfolio", new Set(["rebalance", "diversify", "hedge", "liquidate"])],
  ["bond", new Set(["issue", "mature", "redeem", "yield", "coupon"])],
  ["tax", new Set(["withhold", "file", "remit", "assess", "levy", "exempt"])],
  ["budget", new Set(["allocate", "forecast", "reconcile", "approve"])],
  ["asset", new Set(["value", "revalue", "impair", "liquidate"])],
  ["collateral", new Set(["pledge", "release", "haircut"])],
]);

const ECOMMERCE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["order", new Set(["place", "fulfill", "cancel", "ship", "return", "backorder"])],
  ["cart", new Set(["add", "remove", "empty", "checkout", "abandon"])],
  ["inventory", new Set(["replenish", "reserve", "deplete", "count", "restock"])],
  ["product", new Set(["list", "delist", "discount", "bundle", "feature"])],
  ["subscription", new Set(["activate", "cancel", "renew", "pause", "upgrade", "downgrade"])],
  ["coupon", new Set(["apply", "redeem", "expire", "validate"])],
  ["price", new Set(["set", "reprice", "discount", "markdown"])],
  ["return", new Set(["authorize", "receive", "refund", "restock"])],
]);

const HEALTHCARE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["patient", new Set(["admit", "discharge", "refer", "triage", "diagnose", "treat"])],
  ["medication", new Set(["prescribe", "administer", "dispense", "discontinue", "titrate"])],
  ["appointment", new Set(["schedule", "cancel", "reschedule", "confirm", "checkin"])],
  ["diagnosis", new Set(["confirm", "rule", "differential", "code"])],
  ["record", new Set(["chart", "amend", "seal", "release"])],
  ["vaccine", new Set(["administer", "store", "discard"])],
  ["specimen", new Set(["collect", "label", "process"])],
]);

const HOSPITALITY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["reservation", new Set(["book", "confirm", "cancel", "modify", "honor", "overbook"])],
  ["room", new Set(["assign", "vacate", "upgrade", "block", "service"])],
  ["guest", new Set(["checkin", "checkout", "accommodate", "bill", "comp"])],
  ["booking", new Set(["rebook", "confirm", "cancel"])],
  ["seat", new Set(["assign", "upgrade", "downgrade"])],
]);

const TELECOM: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["call", new Set(["route", "drop", "forward", "transfer", "mute", "hold", "record"])],
  ["signal", new Set(["amplify", "attenuate", "modulate", "demodulate", "broadcast"])],
  ["channel", new Set(["allocate", "multiplex", "tune", "scramble"])],
  ["subscriber", new Set(["provision", "suspend", "activate", "port", "throttle"])],
  ["session", new Set(["originate", "terminate", "handoff"])],
  ["bandwidth", new Set(["allocate", "shape", "throttle"])],
]);

const GAMING: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["player", new Set(["spawn", "respawn", "ban", "kick", "matchmake", "rank"])],
  ["item", new Set(["equip", "loot", "craft", "enchant", "disenchant", "trade"])],
  ["character", new Set(["level", "buff", "debuff", "heal", "revive", "nerf"])],
  ["match", new Set(["start", "pause", "forfeit", "abandon", "spectate"])],
  ["queue", new Set(["join", "leave", "matchmake"])],
  ["lobby", new Set(["create", "join", "leave"])],
]);

const LOGISTICS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["shipment", new Set(["dispatch", "track", "reroute", "deliver", "return", "insure"])],
  ["cargo", new Set(["load", "unload", "stow", "manifest", "inspect", "clear"])],
  ["route", new Set(["plan", "optimize", "divert", "schedule"])],
  ["container", new Set(["load", "seal", "unseal", "transload"])],
  ["dock", new Set(["assign", "slot", "release"])],
]);

const INSURANCE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["policy", new Set(["underwrite", "issue", "renew", "cancel", "lapse", "reinstate", "endorse"])],
  ["claim", new Set(["file", "adjust", "settle", "deny", "subrogate", "appeal"])],
  ["premium", new Set(["quote", "calculate", "collect", "waive", "refund"])],
  ["endorsement", new Set(["add", "remove", "amend"])],
  ["deductible", new Set(["apply", "waive"])],
]);

const EDUCATION: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["student", new Set(["enroll", "expel", "graduate", "mentor", "counsel", "assess"])],
  ["course", new Set(["register", "audit", "drop", "complete", "accredit"])],
  ["grade", new Set(["assign", "appeal", "curve", "post", "withhold"])],
  ["attendance", new Set(["record", "audit", "verify"])],
  ["exam", new Set(["schedule", "proctor", "grade"])],
]);

const REAL_ESTATE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["property", new Set(["list", "appraise", "inspect", "close", "escrow", "foreclose"])],
  ["lease", new Set(["sign", "renew", "terminate", "sublease", "amend"])],
  ["tenant", new Set(["screen", "evict", "accommodate", "bill"])],
  ["title", new Set(["search", "clear", "record"])],
  ["showing", new Set(["schedule", "cancel"])],
]);

const HR: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "employee",
    new Set(["hire", "onboard", "promote", "demote", "terminate", "furlough", "transfer"]),
  ],
  ["candidate", new Set(["screen", "interview", "recruit", "reject", "shortlist"])],
  ["position", new Set(["post", "fill", "eliminate", "reclassify"])],
  ["headcount", new Set(["plan", "reduce", "increase"])],
  ["compensation", new Set(["benchmark", "adjust", "approve"])],
]);

const SECURITY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["token", new Set(["issue", "revoke", "refresh", "rotate", "invalidate", "blacklist"])],
  ["credential", new Set(["verify", "revoke", "hash", "store", "rotate"])],
  ["session", new Set(["create", "invalidate", "extend", "hijack", "terminate"])],
  ["certificate", new Set(["sign", "revoke", "renew", "chain", "pin"])],
  ["key", new Set(["generate", "rotate", "revoke", "archive"])],
  ["acl", new Set(["enforce", "evaluate", "audit"])],
]);

const DEVOPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["instance", new Set(["provision", "deploy", "scale", "terminate", "snapshot", "migrate"])],
  ["container", new Set(["build", "deploy", "kill", "restart", "orchestrate"])],
  ["pipeline", new Set(["trigger", "run", "abort", "retry", "promote"])],
  ["cache", new Set(["warm", "invalidate", "evict", "flush", "populate"])],
  ["node", new Set(["cordon", "drain", "uncordon"])],
  ["release", new Set(["promote", "rollback", "rollout"])],
]);

const DATA: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["dataset", new Set(["ingest", "cleanse", "partition", "sample", "anonymize"])],
  ["schema", new Set(["migrate", "validate", "version", "evolve", "normalize"])],
  ["index", new Set(["build", "rebuild", "drop", "optimize", "shard"])],
  ["query", new Set(["execute", "optimize", "cache", "paginate", "throttle"])],
  ["feature", new Set(["derive", "normalize", "vectorize"])],
  ["window", new Set(["slide", "aggregate", "rank"])],
]);

const CONTENT: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["article", new Set(["draft", "publish", "archive", "retract", "syndicate"])],
  ["comment", new Set(["post", "moderate", "flag", "delete", "pin"])],
  ["media", new Set(["upload", "transcode", "stream", "caption", "watermark"])],
  ["subtitle", new Set(["generate", "sync", "translate"])],
  ["transcript", new Set(["generate", "edit", "publish"])],
]);

const SOCIAL: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["user", new Set(["follow", "unfollow", "block", "mute", "report", "verify"])],
  ["post", new Set(["publish", "pin", "boost", "archive", "flag"])],
  ["thread", new Set(["start", "lock", "archive"])],
  ["message", new Set(["send", "delete", "unsend"])],
]);

const MESSAGING_EVENTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["message", new Set(["enqueue", "dequeue", "acknowledge", "nack", "retry", "deadletter"])],
  ["event", new Set(["emit", "publish", "replay", "fanout", "route"])],
  ["queue", new Set(["drain", "purge", "park", "resume"])],
]);

const IOT: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["device", new Set(["provision", "commission", "decommission", "pair", "unpair", "reboot"])],
  ["sensor", new Set(["calibrate", "sample", "poll", "stream"])],
  ["telemetry", new Set(["capture", "ingest", "aggregate"])],
]);

const LEGAL: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["contract", new Set(["draft", "sign", "amend", "terminate", "enforce", "breach"])],
  ["case", new Set(["file", "adjudicate", "dismiss", "settle", "appeal"])],
  ["verdict", new Set(["deliver", "appeal", "overturn", "uphold"])],
  ["motion", new Set(["file", "argue", "grant", "deny"])],
  ["brief", new Set(["draft", "file", "amend"])],
]);

const MANUFACTURING: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["batch", new Set(["start", "inspect", "reject", "release", "quarantine"])],
  ["component", new Set(["assemble", "solder", "weld", "test", "certify"])],
  ["line", new Set(["start", "stop", "balance", "retool"])],
  ["workorder", new Set(["create", "schedule", "close"])],
]);

const AGRICULTURE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["field", new Set(["plant", "irrigate", "fertilize", "harvest"])],
  ["crop", new Set(["sow", "spray", "prune", "harvest"])],
  ["livestock", new Set(["feed", "breed", "vaccinate", "wean"])],
]);

const ADVERTISING: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["campaign", new Set(["launch", "pause", "optimize", "target", "remarket"])],
  ["audience", new Set(["segment", "target", "exclude", "expand"])],
  ["creative", new Set(["draft", "review", "approve", "rotate"])],
]);

const TRANSPORTATION: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["flight", new Set(["schedule", "delay", "depart", "arrive", "reroute"])],
  ["vessel", new Set(["berth", "moor", "unmoor", "dock"])],
  ["vehicle", new Set(["dispatch", "refuel", "reroute", "park"])],
]);

const ENERGY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["grid", new Set(["balance", "stabilize", "shed", "curtail", "interconnect"])],
  ["meter", new Set(["read", "calibrate", "install", "replace", "tamper"])],
  ["feeder", new Set(["energize", "deenergize", "switch", "island"])],
  ["plant", new Set(["dispatch", "ramp", "derate", "blackstart"])],
]);

const BLOCKCHAIN: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["token", new Set(["mint", "burn", "stake", "transfer", "vest", "lock"])],
  ["contract", new Set(["deploy", "verify", "audit", "upgrade", "pause"])],
  ["validator", new Set(["delegate", "redelegate", "slash", "unbond"])],
  ["bridge", new Set(["lock", "mint", "burn", "release"])],
]);

const PUBLIC_SECTOR: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["permit", new Set(["issue", "renew", "revoke", "approve"])],
  ["license", new Set(["issue", "renew", "suspend", "revoke"])],
  ["ordinance", new Set(["draft", "enact", "amend", "repeal"])],
]);

const PHARMA_BIOTECH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["assay", new Set(["run", "validate", "repeat"])],
  ["sample", new Set(["aliquot", "dilute", "incubate", "analyze"])],
  ["compound", new Set(["synthesize", "formulate", "stabilize"])],
]);

const SUPPORT_CRM: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["ticket", new Set(["open", "triage", "assign", "escalate", "resolve", "close"])],
  ["case", new Set(["categorize", "prioritize", "reopen", "resolve"])],
  ["customer", new Set(["notify", "update", "verify", "retain"])],
]);

const PAYMENTS_FINTECH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["payout", new Set(["initiate", "disburse", "settle", "reverse"])],
  ["chargeback", new Set(["file", "dispute", "win", "lose"])],
  ["authorization", new Set(["request", "reauthorize", "decline", "approve"])],
]);

const MEDIA_ADTECH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["impression", new Set(["serve", "count", "cap", "pace"])],
  ["bid", new Set(["submit", "win", "lose", "optimize"])],
  ["audience", new Set(["segment", "target", "expand", "suppress"])],
]);

const PROGRAMMING: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "node",
    new Set([
      "create",
      "build",
      "render",
      "visit",
      "traverse",
      "remove",
      "insert",
      "find",
      "update",
      "delete",
    ]),
  ],
  ["tree", new Set(["build", "render", "traverse", "walk", "flatten", "prune", "create", "parse"])],
  [
    "list",
    new Set(["create", "build", "render", "filter", "sort", "append", "remove", "clear", "find"]),
  ],
  ["score", new Set(["compute", "calculate", "normalize", "compare", "update", "aggregate"])],
  ["value", new Set(["get", "set", "render", "format", "parse", "validate", "compute", "convert"])],
  ["text", new Set(["render", "format", "parse", "tokenize", "trim", "split", "join", "encode"])],
  [
    "name",
    new Set([
      "parse",
      "validate",
      "format",
      "generate",
      "resolve",
      "normalize",
      "tokenize",
      "score",
    ]),
  ],
  ["error", new Set(["handle", "throw", "catch", "log", "report", "wrap", "format", "recover"])],
  ["result", new Set(["compute", "build", "format", "render", "aggregate", "merge", "collect"])],
  [
    "state",
    new Set(["update", "reset", "restore", "save", "load", "merge", "initialize", "validate"]),
  ],
  ["context", new Set(["create", "build", "enter", "exit", "restore", "save", "capture", "wrap"])],
  [
    "source",
    new Set(["read", "parse", "scan", "analyze", "load", "validate", "compile", "transform"]),
  ],
  ["parameter", new Set(["validate", "parse", "capture", "render", "extract", "format", "score"])],
  ["issue", new Set(["collect", "detect", "report", "create", "resolve", "format", "filter"])],
  ["method", new Set(["score", "analyze", "extract", "invoke", "call", "find", "validate"])],
  ["class", new Set(["define", "instantiate", "extend", "load", "inspect", "serialize"])],
  ["object", new Set(["create", "clone", "serialize", "deserialize", "validate", "merge"])],
  ["module", new Set(["load", "initialize", "configure", "wire", "register", "reload"])],
  ["package", new Set(["publish", "install", "resolve", "upgrade", "sign", "scan"])],
  ["field", new Set(["read", "write", "map", "validate", "serialize", "redact"])],
  ["exception", new Set(["throw", "catch", "wrap", "propagate", "log", "map"])],
  ["buffer", new Set(["allocate", "fill", "flush", "drain", "resize", "slice"])],
  ["stream", new Set(["open", "read", "write", "flush", "close", "pipe"])],
  ["payload", new Set(["build", "parse", "validate", "sanitize", "sign", "compress"])],
  ["request", new Set(["build", "send", "retry", "cancel", "validate", "throttle"])],
  ["response", new Set(["return", "serialize", "parse", "cache", "stream", "validate"])],
  ["schema", new Set(["define", "validate", "migrate", "evolve", "generate", "infer"])],
  ["event", new Set(["emit", "publish", "consume", "handle", "replay", "enrich"])],
  ["command", new Set(["dispatch", "execute", "validate", "queue", "retry", "cancel"])],
  ["handler", new Set(["register", "resolve", "invoke", "chain", "decorate", "replace"])],
  ["factory", new Set(["create", "build", "configure", "wire", "cache", "resolve"])],
]);

const API_PLATFORM: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["endpoint", new Set(["expose", "secure", "version", "deprecate", "throttle", "document"])],
  ["webhook", new Set(["register", "deliver", "sign", "verify", "retry", "disable"])],
  ["gateway", new Set(["route", "authorize", "throttle", "cache", "rewrite"])],
  ["tenant", new Set(["provision", "isolate", "migrate", "suspend", "activate", "offboard"])],
  ["featureflag", new Set(["enable", "disable", "rollout", "target", "evaluate", "retire"])],
  ["job", new Set(["schedule", "enqueue", "run", "retry", "cancel", "monitor"])],
  ["workflow", new Set(["start", "advance", "pause", "resume", "cancel", "complete"])],
  ["rule", new Set(["define", "evaluate", "prioritize", "enforce", "override", "disable"])],
  ["template", new Set(["render", "compile", "validate", "version", "override", "publish"])],
  ["artifact", new Set(["build", "publish", "sign", "promote", "download", "verify"])],
]);

const OBSERVABILITY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["metric", new Set(["record", "aggregate", "export", "tag", "sample", "reset"])],
  ["trace", new Set(["start", "annotate", "propagate", "sample", "flush", "end"])],
  ["span", new Set(["start", "annotate", "tag", "link", "flush", "finish"])],
  ["alert", new Set(["trigger", "silence", "acknowledge", "escalate", "resolve"])],
  ["incident", new Set(["declare", "triage", "escalate", "mitigate", "resolve", "postmortem"])],
  ["dashboard", new Set(["build", "publish", "share", "refresh", "drilldown", "archive"])],
  ["log", new Set(["write", "parse", "filter", "ship", "redact", "correlate"])],
  ["checkpoint", new Set(["create", "restore", "persist", "prune", "verify", "rotate"])],
]);

const ML_AI: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["model", new Set(["train", "validate", "evaluate", "serve", "deploy", "retrain"])],
  ["embedding", new Set(["generate", "index", "normalize", "store", "cache", "search"])],
  ["prompt", new Set(["compose", "template", "ground", "evaluate", "sanitize", "version"])],
  ["classifier", new Set(["train", "score", "calibrate", "threshold", "evaluate", "serve"])],
  ["prediction", new Set(["generate", "score", "explain", "cache", "serve", "audit"])],
  ["experiment", new Set(["design", "run", "track", "compare", "promote", "archive"])],
  ["label", new Set(["assign", "review", "correct", "merge", "map", "validate"])],
  [
    "featurestore",
    new Set(["publish", "materialize", "backfill", "serve", "monitor", "deprecate"]),
  ],
]);

const QUALITY_GOVERNANCE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["testcase", new Set(["define", "execute", "assert", "parameterize", "isolate", "stabilize"])],
  ["fixture", new Set(["prepare", "seed", "reset", "load", "teardown", "reuse"])],
  ["baseline", new Set(["establish", "compare", "refresh", "approve", "pin", "version"])],
  ["benchmark", new Set(["run", "compare", "profile", "optimize", "track", "report"])],
  ["regression", new Set(["detect", "reproduce", "triage", "fix", "verify", "prevent"])],
  ["coverage", new Set(["measure", "report", "increase", "enforce", "track", "gate"])],
  ["runbook", new Set(["author", "version", "execute", "review", "validate", "retire"])],
  ["playbook", new Set(["draft", "execute", "simulate", "update", "review", "publish"])],
  ["auditlog", new Set(["capture", "append", "seal", "query", "retain", "export"])],
  ["control", new Set(["define", "implement", "test", "enforce", "monitor", "audit"])],
  ["evidence", new Set(["collect", "attach", "review", "retain", "export", "verify"])],
  ["finding", new Set(["record", "triage", "assign", "remediate", "verify", "close"])],
  ["lineage", new Set(["capture", "trace", "visualize", "validate", "repair", "publish"])],
  ["policy", new Set(["evaluate", "enforce", "apply", "override", "simulate", "attest"])],
  ["compliance", new Set(["assess", "monitor", "report", "attest", "remediate", "enforce"])],
]);

function mergeCollocationMaps(
  maps: ReadonlyArray<ReadonlyMap<string, ReadonlySet<string>>>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const merged = new Map<string, Set<string>>();
  for (const map of maps) {
    for (const [noun, verbs] of map.entries()) {
      const bucket = merged.get(noun) ?? new Set<string>();
      for (const verb of verbs) bucket.add(verb);
      merged.set(noun, bucket);
    }
  }
  return new Map([...merged.entries()].map(([noun, verbs]) => [noun, new Set(verbs)]));
}

const ALL_COLLOCATIONS = mergeCollocationMaps([
  BUSINESS_CORE,
  FINANCE,
  ECOMMERCE,
  HEALTHCARE,
  HOSPITALITY,
  TELECOM,
  GAMING,
  LOGISTICS,
  INSURANCE,
  EDUCATION,
  REAL_ESTATE,
  HR,
  SECURITY,
  DEVOPS,
  DATA,
  CONTENT,
  SOCIAL,
  MESSAGING_EVENTS,
  IOT,
  LEGAL,
  MANUFACTURING,
  AGRICULTURE,
  ADVERTISING,
  TRANSPORTATION,
  ENERGY,
  BLOCKCHAIN,
  PUBLIC_SECTOR,
  PHARMA_BIOTECH,
  SUPPORT_CRM,
  PAYMENTS_FINTECH,
  MEDIA_ADTECH,
  PROGRAMMING,
  API_PLATFORM,
  OBSERVABILITY,
  ML_AI,
  QUALITY_GOVERNANCE,
]);

export function hasNoun(noun: string): boolean {
  return ALL_COLLOCATIONS.has(noun.toLowerCase());
}

export function isValidCollocation(verb: string, noun: string): boolean {
  const verbs = ALL_COLLOCATIONS.get(noun.toLowerCase());
  return verbs?.has(verb.toLowerCase()) ?? false;
}

/** The verbs conventionally paired with a noun (empty when the noun is unknown). */
export function preferredVerbs(noun: string): ReadonlySet<string> {
  return ALL_COLLOCATIONS.get(noun.toLowerCase()) ?? new Set();
}

export function allCollocationNouns(): readonly string[] {
  return [...ALL_COLLOCATIONS.keys()];
}

export function allCollocationPairs(): ReadonlyArray<{ noun: string; verb: string }> {
  return [...ALL_COLLOCATIONS.entries()].flatMap(([noun, verbs]) =>
    [...verbs.values()].map((verb) => ({ noun, verb })),
  );
}

export function collocationDictionaryMetrics(): {
  nounCount: number;
  pairCount: number;
} {
  return {
    nounCount: ALL_COLLOCATIONS.size,
    pairCount: allCollocationPairs().length,
  };
}
