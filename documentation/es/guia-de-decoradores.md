<!-- source: documentation/decorators-guide.md blob ca25e80993ca | translated: 2026-09-03 | reviewed: - -->

# Guía de decoradores de NarrativeTrace para TypeScript

[English](../decorators-guide.md) | **Español** | [Português](../pt-BR/guia-de-decoradores.md) | [简体中文](../zh-CN/装饰器指南.md)

Esta guía enumera todos los decoradores disponibles en NarrativeTrace TypeScript y explica cuándo y cómo usar cada uno.

NarrativeTrace sigue la filosofía de **El código es el log**: los nombres de métodos, los nombres de parámetros y los valores de retorno ya deberían comunicar por sí mismos la historia de la ejecución. Mantén primero la lógica de negocio limpia y expresiva, y usa los decoradores de forma excepcional, no por defecto. Añade decoradores solo cuando aporten un valor adicional concreto, como una narración dirigida, contexto específico de un error o la ocultación de datos sensibles.

## Inventario de decoradores

| Decorador | Módulo | Objetivo | Propósito |
|---|---|---|---|
| `@traced()` | `@narrativetrace/proxy` | Método | Vincula los nombres de los parámetros para la salida de la traza. |
| `@narrated()` | `@narrativetrace/proxy` | Método | Añade texto de narración legible para humanos a un método trazado. |
| `@onError()` | `@narrativetrace/proxy` | Método | Añade texto de error contextual cuando un método lanza una excepción. |
| `@notTraced()` | `@narrativetrace/proxy` | Método | Marca los valores de los parámetros como ocultos en la salida de la traza. |

Todos los decoradores usan la [propuesta de decoradores TC39 Stage 3](https://github.com/tc39/proposal-decorators) (TypeScript 5.0+). Son decoradores de método que usan `ClassMethodDecoratorContext`.

## `@traced`

Usa `@traced` para vincular nombres de parámetros explícitos. Esto es esencial cuando los minificadores eliminan los nombres de los parámetros, o cuando quieres nombres más descriptivos en las trazas.

```ts
import { traced } from "@narrativetrace/proxy";

class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(cId: string, pId: string, qty: number) {
    // ...
  }
}
```

Cómo funciona:

- Los nombres de los parámetros se almacenan en un `WeakMap` indexado por la función del método.
- Cuando `traceObject()` intercepta una llamada, busca los nombres y los usa en lugar de `arg0`, `arg1`, etc.
- Los nombres son posicionales — se corresponden con los argumentos por índice.

### Sin `@traced` (nombres de parámetros manuales)

Si no puedes o no quieres usar decoradores, pasa los nombres de los parámetros directamente a `traceObject()`:

```ts
const traced = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
  cancelOrder: ["orderId"],
});
```

Esto es equivalente a `@traced`, pero funciona sin ningún soporte de decoradores.

## `@narrated`

Usa `@narrated` en los métodos cuando quieras una frase explícita en la traza en lugar de depender solo del nombre del método + los parámetros.

```ts
import { narrated } from "@narrativetrace/proxy";

class OrderService {
  @narrated("Placing order of {quantity} units for customer {customerId}")
  placeOrder(customerId: string, quantity: number) {
    // ...
  }
}
```

Cómo funciona:

- La plantilla de narración se almacena en un `WeakMap` indexado por la función del método.
- La cadena de la plantilla se adjunta al campo `MethodSignature.narration` del nodo de traza.
- Funciona con `traceObject()` — la narración aparece en la salida Markdown como texto en cursiva debajo de la llamada.

Cómo se resuelven los marcadores: `{paramName}` sustituye el argumento nombrado; `{param.property}` llama al getter sobre el objeto argumento crudo. Solo se resuelve un único nivel de propiedad — `{order.card.number}` nunca se resuelve, y el marcador sobrevive literalmente. Un miembro oculto alcanzado por una ruta de propiedad se resuelve como `[REDACTED]`, nunca como el valor crudo — consulta la nota sobre ocultación bajo `@notTraced` más abajo.

## `@onError`

Usa `@onError` para adjuntar mensajes específicos del contexto a las excepciones.

```ts
import { onError } from "@narrativetrace/proxy";

class PaymentService {
  @onError("Payment declined for customer {customerId}, amount was {amount}")
  charge(customerId: string, amount: number) {
    // ...
  }
}
```

Cómo funciona:

- La plantilla de contexto de error se almacena en un `WeakMap` indexado por la función del método.
- Cuando el método lanza una excepción, el contexto de error se adjunta al campo `MethodSignature.errorContext` del nodo de traza.
- Enriquece las trazas de error con contexto específico del dominio, más allá del simple mensaje de la excepción.

## `@notTraced`

Usa `@notTraced` para ocultar valores de parámetros sensibles.

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // oculta el parámetro en el índice 1
  login(username: string, password: string) {
    // ...
  }
}
```

Cómo funciona:

- Los índices de los parámetros se almacenan en un `WeakMap<Function, Set<number>>`.
- El proxy renderiza los parámetros ocultos como `[REDACTED]` en la salida de la traza.
- `ParameterCapture.redacted` se establece en `true` para los parámetros ocultos.
- Se pueden ocultar varios índices: `@notTraced(1, 2)`.
- Para **campos de objeto**, declara un campo estático de la clase: `static notTraced = ["pan", "secret"]`
  — esas propiedades se renderizan como `[REDACTED]` durante la introspección, independientemente de la
  lista de denegación basada en nombres de `RedactionPolicy` (que ya cubre `password`, `token`, `ssn`,
  `cvv`, …).
- Casos de uso típicos: contraseñas, tokens, secretos, datos de tarjetas.

**El ocultado gana sobre una plantilla que lo nombre.** `@narrated` y `@onError` resuelven
las rutas `{param.property}` sobre los argumentos crudos, y una ruta que alcanza un miembro oculto
se resuelve como `[REDACTED]` — ya sea que el miembro esté en la lista de denegación por nombre o
listado explícitamente en `static notTraced`. Nombrar una ruta nunca debilita las reglas que se
aplican al valor directamente:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}

class PaymentService {
  @narrated("Charging card ending {card.last4}, cvv {card.cvv}")
  @traced("card")
  charge(card: Card) { /* ... */ }
}
// narración: "Charging card ending 4111, cvv [REDACTED]"
```

Si necesitas el valor en una narrativa, quítalo de `static notTraced` (o del patrón de la lista de
denegación que coincide con él) — esa eliminación es la decisión deliberada y revisable. Un
marcador que nombra una propiedad que no existe en el objeto es una errata de escritura, no una
decisión de ocultación: sobrevive literalmente, y la advertencia de marcador sin resolver en
tiempo de pruebas se sigue disparando para él.

## El contrato de pureza — efectos secundarios durante el trazado

NarrativeTrace puede invocar un conjunto pequeño y fijo de rutas de código de tus objetos mientras renderiza
una traza. Mantén esos miembros **puros** — libres de efectos secundarios como carga perezosa, contadores
de acceso, poblado de cachés o E/S — exactamente igual que lo harías para un depurador o un serializador.

Qué se invoca y qué no:

- **La introspección enumera las propiedades propias enumerables** (`Object.keys`). Un getter definido
  en una clase vive en el prototipo, nunca se enumera, y nunca se ejecuta durante la
  introspección. (Un accesor definido directamente en un objeto literal *sí* es propio-enumerable
  y se ejecutaría — prefiere getters de clase o marca el campo en `static notTraced`.)
- **Lo que NarrativeTrace sí invoca:** un `toString()` personalizado (propio, no el predeterminado), un
  método designado con `@narrativeSummary`, y cualquier ruta de propiedad que nombres en una
  plantilla `@narrated`/`@onError` — `{order.total}` se resuelve mediante acceso a la propiedad, así que
  un getter nombrado ahí *sí* se ejecuta.
- **La invocación está acotada y aislada.** La salida tiene un límite (`maxStringLength`,
  `maxArrayItems`, `maxObjectKeys`); un getter o `toString()` que lanza una excepción nunca hace fallar
  la llamada de negocio trazada (las plantillas recurren al literal `{placeholder}`, el renderizado
  recurre a un marcador con el nombre del tipo); los valores se renderizan de forma eager en el punto
  de llamada, así que cualquier efecto secundario ocurre una sola vez, en un punto determinista. Los
  thenables nunca se esperan (`await`) — se renderizan como `<pending>`.

Si un miembro no puede ser puro, inclúyelo en `static notTraced` — el valor de un miembro oculto
nunca se lee — o dale al tipo un `toString()`/`@narrativeSummary` curado para que controles
exactamente qué se accede. Con un contexto inactivo (nivel `off`, o captura de parámetros
desactivada en `summary`), no se renderiza ningún argumento en absoluto — no se toca código de
usuario en la ruta rápida.

## Combinando decoradores

Los decoradores se pueden apilar en el mismo método:

```ts
import { traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class TransferService {
  @traced("fromAccountId", "toAccountId", "amount", "authToken")
  @narrated("Transferring {amount} from {fromAccountId} to {toAccountId}")
  @onError("Transfer rejected for source account {fromAccountId}")
  @notTraced(3) // oculta authToken
  transfer(from: string, to: string, amount: number, token: string) {
    // ...
  }
}
```

Este único método combina el nombrado de parámetros, la narración, el contexto de error dirigido y la ocultación de parámetros.

## Ejemplo completo

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdown } from "@narrativetrace/core";
import { traceObject, traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class PaymentService {
  @traced("customerId", "amount", "token")
  @narrated("Charging {amount} to customer {customerId}")
  @onError("Payment failed for customer {customerId}")
  @notTraced(2) // oculta token
  charge(customerId: string, amount: number, token: string) {
    if (amount > 1000) throw new Error("Amount exceeds limit");
    return { transactionId: "TX-1", amount };
  }
}

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);
const traced = traceObject(new PaymentService(), context);

traced.charge("C1", 500, "tok_secret_123");
console.log(renderMarkdown(context.captureTrace()));
```

## Véase también

- [Guía de instalación](guia-de-instalacion.md) — dependencias, vías de integración, configuración de la salida de trazas
- [Guía de configuración](guia-de-configuracion.md) — niveles de tracing, opciones de renderizado
- [Guía de claridad](guia-de-claridad.md) — modelo de puntuación, componentes NLP, escáner estático
