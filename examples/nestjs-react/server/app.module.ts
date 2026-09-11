// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core-node";
import { AutoProxyModule } from "@narrativetrace/nestjs";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import { Module } from "@nestjs/common";
import pino from "pino";
import { InventoryService } from "./inventory.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { PaymentService } from "./payment.service.js";

// Real logger destination for the trace — documentation/framework-integration-guide.md § 9
// (Winston & Pino). Without an explicit pipeline, AutoProxyModule captures into a throwaway
// consumer nothing drains (see AutoProxyOptions.pipeline); BufferedEventConsumer keeps
// captureTrace() (used by OrdersController) working alongside the logger.
const logger = pino();
const pinoConsumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "nestjs-example",
      serviceVersion: "0.1.0",
      environment: "development",
      pipeline: new DualPathPipeline(pinoConsumer, new BufferedEventConsumer()),
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, InventoryService, PaymentService],
})
export class AppModule {}
