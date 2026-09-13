// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  artifactIdentityOfInvocation,
  artifactIdentityOfMethod,
  methodSignature,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import { describe, expect, it } from "vitest";
import {
  approvalRejected,
  type StructuralIo,
  structuralPaths,
  writeStructuralOutput,
} from "../src/structural-output.js";

function fakeIo(
  initial: Record<string, string> = {},
): StructuralIo & { files: Record<string, string> } {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    readFile: (path) => files[path],
    writeFile: (path, content) => {
      files[path] = content;
    },
    mkdir: () => {},
    deleteFile: (path) => {
      delete files[path];
    },
  };
}

function tree(): ReturnType<typeof traceTree> {
  return traceTree([traceNode(methodSignature("Svc", "run", []), returned(null), [], 1)]);
}

describe("structuralPaths", () => {
  it("resolves only the last-green path when approval mode is off", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", undefined);
    expect(paths.lastGreen).toBe("out/structural/Svc/run.nt");
    expect(paths.approved).toBeUndefined();
  });

  it("resolves the approved/received/incomplete siblings when approval mode is on", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    expect(paths.approved).toBe("narratives/Svc/run.approved.nt");
    expect(paths.received).toBe("narratives/Svc/run.received.nt");
    expect(paths.incomplete).toBe("narratives/Svc/run.incomplete.nt");
  });

  it("keys an invocation's paths by its full artifact identity", () => {
    const identity = artifactIdentityOfInvocation("Svc", "run", 2, "case B");
    const paths = structuralPaths(identity, "out", undefined);
    expect(paths.lastGreen).toBe("out/structural/Svc/run-002-case_b.nt");
  });
});

describe("writeStructuralOutput — last-green lifecycle", () => {
  it("writes the current structure as the baseline on the first (green) run", () => {
    const io = fakeIo();
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", undefined);
    const result = writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    expect(result.delta.kind).toBe("new");
    expect(io.files[paths.lastGreen]).toContain("My scenario");
  });

  it("does not advance the baseline when the test itself failed", () => {
    const io = fakeIo({
      [structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", undefined).lastGreen]:
        "scenario: My scenario\n\n- Other.call()\n",
    });
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", undefined);
    const before = io.files[paths.lastGreen];
    const result = writeStructuralOutput(tree(), "My scenario", paths, true, undefined, io);
    expect(io.files[paths.lastGreen]).toBe(before);
    expect(result.delta.kind).toBe("changed");
  });

  it("reports unchanged and leaves the baseline untouched when the structure is byte-identical", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", undefined);
    const io = fakeIo();
    writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    const before = io.files[paths.lastGreen];
    const result = writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    expect(result.delta.kind).toBe("unchanged");
    expect(io.files[paths.lastGreen]).toBe(before);
  });
});

describe("writeStructuralOutput — approval mode", () => {
  it("does not run approval verification for an already-failed test", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const io = fakeIo();
    const result = writeStructuralOutput(tree(), "My scenario", paths, true, undefined, io);
    expect(result.approval).toBeUndefined();
    expect(io.files[paths.received as string]).toBeUndefined();
  });

  it("writes a received trace and reports no-approved-trace when none exists yet", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const io = fakeIo();
    const result = writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    expect(result.approval?.kind).toBe("no-approved-trace");
    expect(io.files[paths.received as string]).toContain("My scenario");
    expect(approvalRejected(result.approval)).toBe(true);
  });

  it("matches an approved trace, clears a stale received trace, and still advances last-green", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const current = "scenario: My scenario\n\n- Svc.run()\n";
    const io = fakeIo({
      [paths.approved as string]: current,
      [paths.received as string]: "stale",
    });
    const result = writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    expect(result.approval?.kind).toBe("match");
    expect(io.files[paths.received as string]).toBeUndefined();
    expect(io.files[paths.lastGreen]).toBe(current);
  });

  it("rejects a changed structure, writes a received trace, and does not advance last-green", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const io = fakeIo({ [paths.approved as string]: "scenario: My scenario\n\n- Other.call()\n" });
    const result = writeStructuralOutput(tree(), "My scenario", paths, false, undefined, io);
    expect(result.approval?.kind).toBe("changed");
    expect(io.files[paths.received as string]).toContain("Svc.run");
    expect(io.files[paths.lastGreen]).toBeUndefined();
  });

  it("tolerates a lossy run that is a subsequence of the approved trace", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const approved = "scenario: My scenario\n\n- Svc.run()\n- Svc.extra()\n";
    const io = fakeIo({ [paths.approved as string]: approved });
    const shortTree = traceTree([
      traceNode(methodSignature("Svc", "run", []), returned(null), [], 1),
    ]);
    const result = writeStructuralOutput(
      shortTree,
      "My scenario",
      paths,
      false,
      "1 event dropped",
      io,
    );
    expect(result.approval?.kind).toBe("lossy-match");
    expect(approvalRejected(result.approval)).toBe(false);
  });

  it("still rejects a lossy run that adds/renames/reorders a call, writing to .incomplete.nt", () => {
    const paths = structuralPaths(artifactIdentityOfMethod("Svc", "run"), "out", "narratives");
    const approved = "scenario: My scenario\n\n- Svc.other()\n";
    const io = fakeIo({ [paths.approved as string]: approved });
    const result = writeStructuralOutput(
      tree(),
      "My scenario",
      paths,
      false,
      "1 event dropped",
      io,
    );
    expect(result.approval?.kind).toBe("lossy-changed");
    expect(io.files[paths.incomplete as string]).toContain("Svc.run");
    expect(io.files[paths.received as string]).toBeUndefined();
    expect(approvalRejected(result.approval)).toBe(true);
  });
});

describe("approvalRejected", () => {
  it("is false when there is no approval outcome at all (approval mode off)", () => {
    expect(approvalRejected(undefined)).toBe(false);
  });
});
