// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { classifyToken, tokenTierScore } from "../src/generic-token-detector.js";

describe("GenericTokenDetector", () => {
  test("classifies single-letter tokens as meaningless", () => {
    expect(classifyToken("x")).toBe("meaningless");
    expect(classifyToken("i")).toBe("meaningless");
    expect(classifyToken("a")).toBe("meaningless");
  });

  test("classifies vague common tokens", () => {
    expect(classifyToken("data")).toBe("vague");
    expect(classifyToken("info")).toBe("vague");
    expect(classifyToken("value")).toBe("vague");
    expect(classifyToken("item")).toBe("vague");
    expect(classifyToken("result")).toBe("vague");
    expect(classifyToken("stuff")).toBe("vague");
  });

  test("classifies standard utility tokens", () => {
    expect(classifyToken("name")).toBe("standard");
    expect(classifyToken("type")).toBe("standard");
    expect(classifyToken("count")).toBe("standard");
    expect(classifyToken("size")).toBe("standard");
    expect(classifyToken("list")).toBe("standard");
    expect(classifyToken("key")).toBe("standard");
    expect(classifyToken("id")).toBe("standard");
  });

  test("classifies domain-specific tokens", () => {
    expect(classifyToken("customer")).toBe("domain");
    expect(classifyToken("order")).toBe("domain");
    expect(classifyToken("invoice")).toBe("domain");
    expect(classifyToken("payment")).toBe("domain");
  });

  test("is case-insensitive", () => {
    expect(classifyToken("Data")).toBe("vague");
    expect(classifyToken("NAME")).toBe("standard");
    expect(classifyToken("TMP")).toBe("meaningless");
  });

  test("classifies empty string as meaningless", () => {
    expect(classifyToken("")).toBe("meaningless");
  });

  test("returns numerical scores for each tier", () => {
    expect(tokenTierScore("domain")).toBe(1.0);
    expect(tokenTierScore("standard")).toBe(0.8);
    expect(tokenTierScore("vague")).toBe(0.4);
    expect(tokenTierScore("meaningless")).toBe(0.1);
  });

  test("meaningless includes common temp/debug names", () => {
    expect(classifyToken("tmp")).toBe("meaningless");
    expect(classifyToken("temp")).toBe("meaningless");
    expect(classifyToken("foo")).toBe("meaningless");
    expect(classifyToken("bar")).toBe("meaningless");
    expect(classifyToken("baz")).toBe("meaningless");
    expect(classifyToken("qux")).toBe("meaningless");
    expect(classifyToken("todo")).toBe("meaningless");
    expect(classifyToken("fixme")).toBe("meaningless");
  });

  test("vague includes all generic parameter-like names", () => {
    expect(classifyToken("object")).toBe("vague");
    expect(classifyToken("thing")).toBe("vague");
    expect(classifyToken("output")).toBe("vague");
    expect(classifyToken("input")).toBe("vague");
    expect(classifyToken("param")).toBe("vague");
    expect(classifyToken("arg")).toBe("vague");
    expect(classifyToken("element")).toBe("vague");
    expect(classifyToken("entity")).toBe("vague");
    expect(classifyToken("record")).toBe("vague");
    expect(classifyToken("entry")).toBe("vague");
    expect(classifyToken("detail")).toBe("vague");
    expect(classifyToken("content")).toBe("vague");
    expect(classifyToken("payload")).toBe("vague");
    expect(classifyToken("meta")).toBe("vague");
    expect(classifyToken("metadata")).toBe("vague");
    expect(classifyToken("blob")).toBe("vague");
    expect(classifyToken("document")).toBe("vague");
    expect(classifyToken("artifact")).toBe("vague");
    expect(classifyToken("messagebody")).toBe("vague");
    expect(classifyToken("dataset")).toBe("vague");
    expect(classifyToken("modeloutput")).toBe("vague");
    expect(classifyToken("modelinput")).toBe("vague");
  });

  test("standard includes common utility tokens", () => {
    expect(classifyToken("status")).toBe("standard");
    expect(classifyToken("length")).toBe("standard");
    expect(classifyToken("index")).toBe("standard");
    expect(classifyToken("flag")).toBe("standard");
    expect(classifyToken("mode")).toBe("standard");
    expect(classifyToken("state")).toBe("standard");
    expect(classifyToken("level")).toBe("standard");
    expect(classifyToken("code")).toBe("standard");
    expect(classifyToken("label")).toBe("standard");
    expect(classifyToken("path")).toBe("standard");
    expect(classifyToken("file")).toBe("standard");
    expect(classifyToken("dir")).toBe("standard");
    expect(classifyToken("port")).toBe("standard");
    expect(classifyToken("host")).toBe("standard");
    expect(classifyToken("uri")).toBe("standard");
    expect(classifyToken("endpoint")).toBe("standard");
    expect(classifyToken("topic")).toBe("standard");
    expect(classifyToken("channel")).toBe("standard");
    expect(classifyToken("session")).toBe("standard");
    expect(classifyToken("token")).toBe("standard");
    expect(classifyToken("trace")).toBe("standard");
    expect(classifyToken("metric")).toBe("standard");
    expect(classifyToken("tenant")).toBe("standard");
    expect(classifyToken("date")).toBe("standard");
    expect(classifyToken("time")).toBe("standard");
    expect(classifyToken("start")).toBe("standard");
    expect(classifyToken("end")).toBe("standard");
    expect(classifyToken("min")).toBe("standard");
    expect(classifyToken("max")).toBe("standard");
    expect(classifyToken("total")).toBe("standard");
    expect(classifyToken("sum")).toBe("standard");
    expect(classifyToken("average")).toBe("standard");
    expect(classifyToken("limit")).toBe("standard");
    expect(classifyToken("offset")).toBe("standard");
    expect(classifyToken("page")).toBe("standard");
  });

  test("tier scores are strictly ordered", () => {
    expect(tokenTierScore("domain")).toBeGreaterThan(tokenTierScore("standard"));
    expect(tokenTierScore("standard")).toBeGreaterThan(tokenTierScore("vague"));
    expect(tokenTierScore("vague")).toBeGreaterThan(tokenTierScore("meaningless"));
  });
});
