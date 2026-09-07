// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "reflect-metadata";
import { Controller, Get, Injectable, Module, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AutoProxyModule } from "../src/auto-proxy.module.js";
import { NarrativeStorage } from "../src/narrative-storage.js";
import { NoAutoProxy } from "../src/no-auto-proxy.decorator.js";

@Injectable()
class OrderService {
  placeOrder(customerId: string) {
    return { orderId: "ORD-1", customerId };
  }
}

@Injectable()
@NoAutoProxy()
class HealthService {
  check() {
    return { status: "ok" };
  }
}

@Controller("orders")
class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create() {
    return this.orderService.placeOrder("C-1");
  }
}

@Controller("health")
class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}

@Module({
  imports: [AutoProxyModule.forRoot({ serviceName: "test-service" })],
  controllers: [OrderController, HealthController],
  providers: [OrderService, HealthService],
})
class TestAppModule {}

describe("AutoProxyModule integration", () => {
  let app: ReturnType<
    Awaited<ReturnType<typeof Test.createTestingModule>>["createNestApplication"]
  >;
  let storage: NarrativeStorage;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    storage = moduleRef.get(NarrativeStorage);
  }, 15000);

  afterAll(async () => {
    await app?.close();
  });

  test("module compiles and initializes", () => {
    expect(app).toBeDefined();
    expect(storage).toBeInstanceOf(NarrativeStorage);
  });

  test("OrderService methods work outside request scope (noop)", () => {
    const orderService = app.get(OrderService);
    const result = orderService.placeOrder("C-1");
    expect(result).toEqual({ orderId: "ORD-1", customerId: "C-1" });
  });

  test("@NoAutoProxy service methods are not traced", () => {
    const healthService = app.get(HealthService);
    expect(healthService.check()).toEqual({ status: "ok" });
  });

  test("NarrativeStorage is singleton", () => {
    expect(app.get(NarrativeStorage)).toBe(storage);
  });

  test("wrapped method traces when context active", async () => {
    const orderService = app.get(OrderService);
    expect(storage.current()).toBeUndefined();
    const { SyncNarrativeContext, NarrativeTraceConfig } = await import("@narrativetrace/core");
    const traceCtx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const result = storage.run(traceCtx, () => orderService.placeOrder("C-2"));
    expect(result).toEqual({ orderId: "ORD-1", customerId: "C-2" });
    const tree = traceCtx.captureTrace();
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(tree.roots[0].signature.className).toBe("OrderService");
    expect(tree.roots[0].signature.methodName).toBe("placeOrder");
  });
});
