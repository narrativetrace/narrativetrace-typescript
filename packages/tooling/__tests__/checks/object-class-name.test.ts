// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkObjectClassName } from "../../src/doctor/checks/object-class-name.js";
import { snapshot, withFiles } from "../fixture.js";

const APP = "src/checkout.ts";
const check = (source: string) =>
  checkObjectClassName(snapshot({ sourceFiles: withFiles({ [APP]: source }) }));

describe("checkObjectClassName", () => {
  test("passes when nothing is traced", () => {
    const finding = checkObjectClassName(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("trap.object-class-name");
  });

  test("passes when a class instance is traced", () => {
    expect(check("traceObject(new CheckoutService(), ctx);").status).toBe("pass");
  });

  test("fails when an inline object literal is traced with no className", () => {
    const finding = check("traceObject({ checkout(o) { return o; } }, ctx);");
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(APP);
    expect(finding.message).toContain("Object.<method>");
    expect(finding.fix).toContain("className");
  });

  test("fails when a variable holding an object literal is traced with no className", () => {
    const source = "const svc = { checkout(o) { return o; } };\ntraceObject(svc, ctx);";
    expect(check(source).status).toBe("fail");
  });

  test("passes when the literal is traced with a className", () => {
    const source = "traceObject({ checkout(o) { return o; } }, ctx, { className: 'Checkout' });";
    expect(check(source).status).toBe("pass");
  });

  test("passes when a variable holding a literal is traced with a className", () => {
    const source =
      "const svc = { checkout(o) { return o; } };\ntraceObject(svc, ctx, { className: 'Checkout' });";
    expect(check(source).status).toBe("pass");
  });

  test("ignores a commented-out literal trace", () => {
    expect(check("// traceObject({ a() {} }, ctx);").status).toBe("pass");
  });

  test("fails when rendered output already shows an Object.<method> span", () => {
    const finding = checkObjectClassName(
      snapshot({
        outputFiles: withFiles({ "narrativetrace-output/t.md": "`Object.checkout(order)`" }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("narrativetrace-output/t.md");
  });

  test("does not mistake Object.keys in rendered prose for a traced class", () => {
    const finding = checkObjectClassName(
      snapshot({
        outputFiles: withFiles({ "narrativetrace-output/t.md": "see Object.keys docs" }),
      }),
    );
    expect(finding.status).toBe("pass");
  });
});
