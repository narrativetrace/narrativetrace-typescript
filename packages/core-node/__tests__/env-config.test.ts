// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { resolveEnvConfig, serviceIdentityFromEnv } from "../src/env-config.js";
import * as entryPoint from "../src/index.js";

describe("resolveEnvConfig", () => {
  test("reads level, output, outputDir and format", () => {
    expect(
      resolveEnvConfig({
        NARRATIVETRACE_LEVEL: "summary",
        NARRATIVETRACE_OUTPUT: "console",
        NARRATIVETRACE_OUTPUT_DIR: "/tmp/traces",
        NARRATIVETRACE_FORMAT: "markdown",
      }),
    ).toEqual({
      level: "summary",
      output: "console",
      outputDir: "/tmp/traces",
      format: "markdown",
    });
  });

  test("defaults the level to the fallback when unset", () => {
    expect(resolveEnvConfig({}, "narrative")).toEqual({ level: "narrative" });
  });

  test("degrades a garbage level to the fallback without throwing", () => {
    expect(resolveEnvConfig({ NARRATIVETRACE_LEVEL: "loud" }, "detail").level).toBe("detail");
  });

  test("parses the level case-insensitively", () => {
    expect(resolveEnvConfig({ NARRATIVETRACE_LEVEL: "OFF" }).level).toBe("off");
  });

  test("omits optional keys that are absent or empty", () => {
    const config = resolveEnvConfig({ NARRATIVETRACE_OUTPUT: "" });
    expect(config.output).toBeUndefined();
    expect(config.outputDir).toBeUndefined();
    expect(config.format).toBeUndefined();
  });

  test("reads approval, approvedDir and structuralJson", () => {
    expect(
      resolveEnvConfig({
        NARRATIVETRACE_APPROVAL: "true",
        NARRATIVETRACE_APPROVED_DIR: "narratives",
        NARRATIVETRACE_STRUCTURAL_JSON: "true",
      }),
    ).toEqual({
      level: "detail",
      approval: "true",
      approvedDir: "narratives",
      structuralJson: "true",
    });
  });
});

describe("resolveEnvConfig redaction additions", () => {
  test("reads the additional redaction patterns variable raw", () => {
    expect(
      resolveEnvConfig({ NARRATIVETRACE_REDACTION_ADDITIONALPATTERNS: "betalingskort, id" })
        .redactionAdditionalPatterns,
    ).toBe("betalingskort, id");
  });

  test("omits the additional redaction patterns when unset or empty", () => {
    expect(resolveEnvConfig({}).redactionAdditionalPatterns).toBeUndefined();
    expect(
      resolveEnvConfig({ NARRATIVETRACE_REDACTION_ADDITIONALPATTERNS: "" })
        .redactionAdditionalPatterns,
    ).toBeUndefined();
  });
});

describe("resolveEnvConfig service identity", () => {
  test("reads the service name, version and environment", () => {
    expect(
      resolveEnvConfig({
        NARRATIVETRACE_SERVICE_NAME: "checkout-api",
        NARRATIVETRACE_SERVICE_VERSION: "1.4.2",
        NARRATIVETRACE_ENVIRONMENT: "staging",
      }),
    ).toEqual({
      level: "detail",
      serviceName: "checkout-api",
      serviceVersion: "1.4.2",
      environment: "staging",
    });
  });

  test("omits the identity settings when unset or empty", () => {
    const config = resolveEnvConfig({ NARRATIVETRACE_SERVICE_NAME: "" });
    expect(config.serviceName).toBeUndefined();
    expect(config.serviceVersion).toBeUndefined();
    expect(config.environment).toBeUndefined();
  });
});

describe("serviceIdentityFromEnv", () => {
  test("is undefined when no identity setting is present", () => {
    expect(serviceIdentityFromEnv({ NARRATIVETRACE_LEVEL: "off" })).toBeUndefined();
  });

  test("carries only the fields that were set", () => {
    expect(serviceIdentityFromEnv({ NARRATIVETRACE_SERVICE_VERSION: "1.4.2" })).toEqual({
      serviceVersion: "1.4.2",
    });
    expect(serviceIdentityFromEnv({ NARRATIVETRACE_ENVIRONMENT: "staging" })).toEqual({
      environment: "staging",
    });
  });

  test("carries all three when all are set, through the package entry point", () => {
    expect(
      entryPoint.serviceIdentityFromEnv({
        NARRATIVETRACE_SERVICE_NAME: "checkout-api",
        NARRATIVETRACE_SERVICE_VERSION: "1.4.2",
        NARRATIVETRACE_ENVIRONMENT: "staging",
      }),
    ).toEqual({ serviceName: "checkout-api", serviceVersion: "1.4.2", environment: "staging" });
  });
});
