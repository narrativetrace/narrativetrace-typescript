// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "@narrativetrace/core-node";
import { AutoProxyModule } from "@narrativetrace/nestjs";
import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { PaymentService } from "./payment.service.js";

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "nestjs-example",
      serviceVersion: "0.1.0",
      environment: "development",
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, InventoryService, PaymentService],
})
export class AppModule {}
