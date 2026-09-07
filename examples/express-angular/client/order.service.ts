// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";

export interface OrderRequest {
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
}

export interface OrderResponse {
  readonly order: {
    readonly orderId: string;
    readonly transactionId: string;
    readonly totalCharged: number;
    readonly itemCount: number;
  };
  readonly trace: {
    readonly roots: readonly unknown[];
  };
}

export interface OrderErrorResponse {
  readonly error: string;
  readonly trace: {
    readonly roots: readonly unknown[];
  };
}

@Injectable()
export class OrderService {
  private readonly http = inject(HttpClient);

  placeOrder(request: OrderRequest): Observable<OrderResponse> {
    return this.http.post<OrderResponse>("/api/orders", request);
  }
}
