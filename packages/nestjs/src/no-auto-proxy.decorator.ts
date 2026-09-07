// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "reflect-metadata";

const NO_AUTO_PROXY = Symbol("NO_AUTO_PROXY");

export function NoAutoProxy(): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey !== undefined) {
      Reflect.defineMetadata(NO_AUTO_PROXY, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(NO_AUTO_PROXY, true, target);
    }
  };
}

export function isNoAutoProxy(target: object, propertyKey?: string | symbol): boolean {
  if (propertyKey !== undefined) {
    return Reflect.getMetadata(NO_AUTO_PROXY, target, propertyKey) === true;
  }
  return Reflect.getMetadata(NO_AUTO_PROXY, target) === true;
}
