// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeStorage } from "@narrativetrace/nestjs";
import { Body, Controller, HttpCode, HttpException, HttpStatus, Post } from "@nestjs/common";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly storage: NarrativeStorage,
  ) {}

  @Post()
  @HttpCode(200)
  create(@Body() body: { customerId: string; productId: string; quantity: number }) {
    try {
      const order = this.ordersService.placeOrder(body.customerId, body.productId, body.quantity);
      return { order, trace: this.captureTrace() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpException(
        { error: message, trace: this.captureTrace() },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private captureTrace() {
    return this.storage.current()?.captureTrace() ?? { roots: [] };
  }
}
