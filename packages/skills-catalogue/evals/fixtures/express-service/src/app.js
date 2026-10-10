// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import express from "express";
import { OrderService } from "./order-service.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  const orders = new OrderService();

  app.post("/orders", (req, res) => {
    const { customerId, sku, quantity } = req.body;
    try {
      res.status(201).json(orders.placeOrder(customerId, sku, quantity));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return app;
}
