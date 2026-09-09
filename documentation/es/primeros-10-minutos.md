<!-- source: documentation/first-10-minutes.md blob 8d61acfd864a | translated: 2026-09-07 | reviewed: - -->
# Primeros 10 minutos

[English](../first-10-minutes.md) | **Español** | [Português](../pt-BR/primeiros-10-minutos.md) | [简体中文](../zh-CN/前10分钟.md)

Un servicio minúsculo, un test de Vitest, siete pasos. Cada comando de abajo
se ejecutó de verdad contra esta versión del repositorio — las rutas de
fichero, las puntuaciones de claridad y el marcador `[REDACTED]` son salida
real, no ilustraciones. Lo único que variará en tu máquina es la duración
(`ms`) y el `trace_name` de dos palabras, ambos generados de nuevo en cada
ejecución.

Node 20+ (CI usa la versión 22), TypeScript 5.0+ (para los decoradores del paso 7), un proyecto que
ya ejecuta `vitest run`. Si todavía no has visto el panorama completo,
`pnpm run build && pnpm demo -- --example ecommerce --no-pause` desde la
raíz del repositorio es todavía más rápido — esta página es para cuando
quieres verlo funcionar contra *tu propio* código.

## 1. Añade los paquetes

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

`core-node` reexporta todo lo que hay en `@narrativetrace/core` y registra
el generador de id de Node — importar solo `@narrativetrace/core` lanza una
excepción en la primera llamada trazada. No hay ningún plugin de build que
aplicar; los paquetes son toda la configuración de dependencias.

## 2. Añade una clase de servicio

```ts
// src/order-service.ts
export class OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

No hay ninguna interfaz que declarar — `traceObject()` envuelve el objeto
concreto directamente con un `Proxy` de ES, así que no hay nada contra lo
que implementar. (Las implementaciones de NarrativeTrace para JDK/JVM necesitan una
interfaz para su proxy dinámico; este no.)

## 3. Añade un test de Vitest

```ts
// src/order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C-1234", "SKU-KB", 2);
});
```

`createNarrativeTest()` devuelve un `test` de Vitest que inyecta un
`narrativeContext` nuevo en cada test y escribe los artefactos de traza
cuando termina. El tercer argumento de `traceObject` — `{ placeOrder: [...] }`
— aporta los nombres de los parámetros, porque JavaScript no los conserva en
tiempo de ejecución; sin él, la traza muestra `arg0`, `arg1`, `arg2`. (El
paso 7 muestra la forma con decorador, `@traced`, que hace lo mismo para una
clase de la que eres dueño.)

## 4. Ejecuta la suite

```bash
npx vitest run
```

La salida cae en `narrativetrace-output/` — el valor por defecto que eligió
el fixture porque no se indicó `outputDir` — un fichero por escenario y por
formato:

```text
narrativetrace-output/
   |
   +-- order-service/customer_places_order.md          narrativa humana
   +-- order-service/customer_places_order.json         misma traza, JSON
   +-- diagrams/order-service/customer_places_order.mmd diagrama de secuencia Mermaid
```

`order-service.test.ts` se convirtió en el directorio `order-service` (el
nombre del *fichero* de test, saneado — el equivalente en esta plataforma al
directorio de la *clase* de test en Java); `"customer places order"` se
convirtió en `customer_places_order.md` — el nombre del test, convertido en
slug. Nada más que configurar. Por defecto solo se escriben `md`/`json`/`mmd`;
pasa `formats: [...]` a `createNarrativeTest` para obtener también `puml`,
`clarity-json` o `canonical-json` — consulta la
[Guía de instalación](guia-de-instalacion.md#3-configurar-la-salida-de-trazas).

## 5. Abre la narrativa

`narrativetrace-output/order-service/customer_places_order.md`:

```markdown
---
type: trace
scenario: customer places order
entry_point: OrderService.placeOrder
duration_ms: 1.548
trace_id: 7919d16fd10a133f3f1ebf9f5670c502
trace_name: tidy mink roots
method_count: 1
error_count: 0
---

- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2)` → `"ORD-C-1234-SKU-KB-2"` — 1.548ms
```

Cada valor del flujo de llamadas — los valores de los parámetros, el valor
de retorno — vino de la llamada que hiciste de verdad. Nada se escribió a
mano.

## 6. Renombra `placeOrder` a `process` y observa cómo cae la claridad

La calidad de los nombres se mide, no se asume. `createNarrativeTest`
también escribe `customer_places_order.clarity-json` en cuanto añades
`"clarity-json"` a `formats`. Antes del renombrado, para este escenario
exacto:

```json
{
  "overallScore": 0.94,
  "methodNameScore": 0.91,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": []
}
```

Renombra el método (la declaración, la clave de `paramNames` y el punto de
llamada) a `process` y ejecuta `npx vitest run` de nuevo:

```json
{
  "overallScore": 0.79,
  "methodNameScore": 0.4,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": [
    {
      "category": "method-name",
      "element": "OrderService.process",
      "suggestion": "Use a domain-specific verb+noun (e.g., calculateTotal, reserveInventory)",
      "severity": "MEDIUM",
      "occurrences": 1,
      "impactScore": 2
    }
  ]
}
```

Misma llamada, mismos valores, todo igual salvo el nombre — la puntuación
global cayó de 0.94 a 0.79, la dimensión del nombre del método por sí sola
cayó de 0.91 a 0.40, y apareció una incidencia. Un `clarity-report.md` /
`clarity-results.json` para toda la suite (que agrega cada escenario, con un
umbral de aprobado/fallado que tú defines) necesita un paso más — añadir
`ClaritySuiteReporter` a tus `reporters` de Vitest — que se cubre en la
[Guía de claridad](guia-de-claridad.md#generar-el-fichero-de-resultados-desde-vitest).
Vuelve a llamarlo `placeOrder` (o algo todavía más específico) antes de
continuar.

## 7. Añade `@notTraced` y observa la ocultación

```ts
// src/order-service.ts
import { notTraced, traced } from "@narrativetrace/proxy";

export class OrderService {
  @traced("customerId", "productId", "quantity", "paymentToken")
  @notTraced(3)
  placeOrder(customerId: string, productId: string, quantity: number, paymentToken: string): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

`@traced` sustituye al mapa `paramNames` del paso 3 — con el decorador
puesto, `traceObject(new OrderService(), narrativeContext)` ya no necesita
un tercer argumento. `@notTraced(3)` marca el parámetro de índice 3
(`paymentToken`) como oculto. Pasa un token en el test
(`service.placeOrder("C-1234", "SKU-KB", 2, "tok_live_51H8x9J")`) y ejecuta
de nuevo. La traza:

```markdown
- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2, paymentToken: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1.005ms
```

El nombre del parámetro sigue apareciendo — puedes ver que *se pasó* un
token — pero su valor nunca llega a disco. ¿Sin decoradores en tu build?
La misma ocultación (y la narración, y el contexto de error) está
disponible como configuración en el propio envoltorio:
`traceObject(new OrderService(), narrativeContext, { methods: { placeOrder: { params: [...], notTraced: [3] } } })`
— mira la sección de configuración de la
[Guía de decoradores](guia-de-decoradores.md). Consulta
[Privacidad y ocultación](privacidad-y-ocultacion.md) para saber qué más
cubre la ocultación, incluida la ocultación a nivel de campo (`static
notTraced`) para objetos que no construyes parámetro a parámetro.

## A dónde ir a continuación

| Quieres | Ve a |
|---|---|
| Una vía de integración distinta al fixture de Vitest de arriba | [Eligiendo una integración](eligiendo-una-integracion.md) |
| El contrato de privacidad fila por fila | [Privacidad y ocultación](privacidad-y-ocultacion.md) |
| Qué ficheros generados hacer commit | [Qué commitear](que-commitear.md) |
| Algo de lo anterior no funcionó como se mostraba | [Solución de problemas](solucion-de-problemas.md) |
| Cada opción de configuración | [Guía de configuración](guia-de-configuracion.md) |
