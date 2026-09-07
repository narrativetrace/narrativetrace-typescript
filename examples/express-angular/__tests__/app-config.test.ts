// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NARRATIVE_CONTEXT } from "@narrativetrace/angular";
import { afterEach, describe, expect, test } from "vitest";
import { appConfig } from "../client/app.config.js";
import { OrderService } from "../client/order.service.js";

describe("appConfig", () => {
  afterEach(() => TestBed.resetTestingModule());

  test("provides NARRATIVE_CONTEXT", () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    const ctx = TestBed.inject(NARRATIVE_CONTEXT);
    expect(ctx).toBeDefined();
    expect(ctx.isActive).toBe(true);
  });

  test("provides traced OrderService", () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    const service = TestBed.inject(OrderService);
    expect(service).toBeDefined();
    expect(typeof service.placeOrder).toBe("function");
  });
});
