// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  checkInstrumentationExclusions,
  SHIPPED_DEFAULT,
} from "../../src/doctor/checks/instrumentation-exclusions.js";
import { snapshot } from "../fixture.js";

describe("checkInstrumentationExclusions", () => {
  test("with nothing stated it reports the shipped default as the list in force", () => {
    const finding = checkInstrumentationExclusions(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("config.instrumentation-exclusions");
    expect(finding.message).toContain("shipped default");
    for (const prefix of SHIPPED_DEFAULT) expect(finding.message).toContain(prefix);
  });

  test("a stated list is reported as the whole list and the default is not mentioned", () => {
    const finding = checkInstrumentationExclusions(
      snapshot({ env: { NARRATIVETRACE_EXCLUDE: "acme.vendor; Billing.*" } }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("NARRATIVETRACE_EXCLUDE");
    expect(finding.message).toContain("acme.vendor, Billing");
    expect(finding.message).not.toContain("Reflector");
  });

  test("a present-but-empty value is reported as excluding nothing", () => {
    const finding = checkInstrumentationExclusions(
      snapshot({ env: { NARRATIVETRACE_EXCLUDE: "" } }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("excludes nothing");
  });

  test("a blank entry fails: the runtime ignores the whole value and uses the default", () => {
    const finding = checkInstrumentationExclusions(
      snapshot({ env: { NARRATIVETRACE_EXCLUDE: "a;;b" } }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("blank");
    expect(finding.fix).toContain("NARRATIVETRACE_EXCLUDE");
  });

  test("a duplicate entry fails, however it is spelled", () => {
    const finding = checkInstrumentationExclusions(
      snapshot({ env: { NARRATIVETRACE_EXCLUDE: "a,a.*" } }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("duplicate");
  });
});
