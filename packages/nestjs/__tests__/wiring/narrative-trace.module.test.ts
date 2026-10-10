// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "reflect-metadata";
import { Controller, type INestApplication, Injectable, Module, Param, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NarrativeTraceModule } from "./narrative-trace.module.js";

@Injectable()
class OrderService {
  placeOrder(customerId: string): string {
    return `order for ${customerId}`;
  }
}

@Controller("orders")
class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post(":customerId")
  create(@Param("customerId") customerId: string): string {
    return this.orders.placeOrder(customerId);
  }
}

@Module({
  imports: [NarrativeTraceModule],
  controllers: [OrderController],
  providers: [OrderService],
})
class AppModule {}

let app: INestApplication | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

async function post(path: string): Promise<number> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
  const response = await fetch(`${await app.getUrl()}${path}`, { method: "POST" });
  return response.status;
}

describe("the nestjs row's wiring snippet", () => {
  test("prints the request's own trace of every provider it called", async () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));

    expect(await post("/orders/C-1")).toBe(201);
    await vi.waitFor(() => expect(printed).toHaveLength(1));

    expect(printed[0]).toContain("OrderService.placeOrder(");
  });
});
