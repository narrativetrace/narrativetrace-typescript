// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Component, Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { provideTraced } from "@narrativetrace/angular";
import { afterEach, describe, expect, test, vi } from "vitest";
import { appConfig } from "./app.config.js";

@Injectable()
class OrderService {
  placeOrder(customerId: string): string {
    return `order for ${customerId}`;
  }
}

@Component({ template: "", standalone: true })
class PageComponent {}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe("the angular row's wiring snippet", () => {
  test("prints the trace of the calls made before each navigation", async () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        provideTraced(OrderService),
        provideRouter([{ path: "checkout", component: PageComponent }]),
      ],
    });

    TestBed.inject(OrderService).placeOrder("C-1");
    await TestBed.inject(Router).navigateByUrl("/checkout");

    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("OrderService.placeOrder(");
  });
});
