<!-- source: documentation/privacy-and-redaction.md blob fd8d8d3cb23b | translated: 2026-09-07 | reviewed: - -->
# Privacidad y ocultación

[English](../privacy-and-redaction.md) | **Español** | [Português](../pt-BR/privacidade-e-ocultacao.md) | [简体中文](../zh-CN/隐私与脱敏.md)

Esta librería corre dentro de tu proceso y escribe archivos que tu equipo
va a compartir — artefactos de pruebas, salida de CI, líneas de log de
producción. Esta página es la versión fila por fila de ese contrato: qué se
oculta, hasta dónde llega y hasta dónde no, y qué garantiza NarrativeTrace
frente a lo que no promete en absoluto. Verificado línea por línea contra el código el
2026-09-02, no inferido de la documentación.

## Ocultación, superficie por superficie

| Superficie | ¿Se puede desactivar la ocultación integrada? |
|---|---|
| `traceObject()` (proxy) — la única vía de captura sobre la que se construye cada integración de abajo | No |
| Fixture de Vitest (`createNarrativeTest`/`narrativeTest`) | No |
| Middleware de Express / Hono / NestJS | No |
| Integraciones de Angular / React | No |
| Una llamada personalizada a `renderValue()`/`renderStructured()` que tu propio código haga directamente | Sí — solo pasando `{ redactionPolicy: RedactionPolicy.DISABLED }` explícitamente, y aun así `@notTraced`/`static notTraced` siguen ocultando (ver más abajo) |
| `@notTraced` / `static notTraced` | No aplica — es lo que provoca la ocultación, y siempre gana, en todas las superficies, incluso en un renderizador con `RedactionPolicy.DISABLED` |

Verificado contra el código, no inferido: `traceObject()` — la única vía de
captura sobre la que se construye cada integración distribuida (`express`,
`hono`, `nestjs`, `angular`, `react`, `vitest`, …) — nunca propaga una
opción `redactionPolicy` desde el llamador. La opción `redactionPolicy`
solo existe en las funciones de renderizado de bajo nivel
(`renderValue`/`renderStructured` en `@narrativetrace/core`), y ninguna de
las integraciones distribuidas expone una forma de sobrescribirla. La única
manera de llegar a `RedactionPolicy.DISABLED` es que el código de la
aplicación llame directamente a esas funciones — un acto deliberado y
revisable en tu propio código fuente, nunca un flag de configuración ni una
variable de entorno que un despliegue pueda cambiar.

## Qué oculta, y qué prevalece sobre qué

Tres mecanismos independientes se aplican a cada valor capturado o
renderizado:

1. **`@notTraced(i)`** en un parámetro de método — el *llamador*
   (el constructor del mapa de valores de `traceObject`) sustituye el
   marcador `[REDACTED]` antes de que se resuelva cualquier plantilla de
   narración o de error, de modo que el resolutor de plantillas nunca llega
   a tener el secreto para esta superficie.
2. **`static notTraced = [...]`** en una clase — ocultación por nombre de
   campo para la introspección de objetos y para las rutas de plantilla
   `{param.property}`. Esta comprobación es independiente de qué
   `RedactionPolicy` esté activa: la respuesta a "¿este miembro fue anotado
   explícitamente?" se calcula a partir de la propia clase y luego se
   combina como `annotated || nameMatchesDenyList`, de modo que una
   anotación explícita oculta incluso bajo una política que tenga
   desactivados todos los patrones de nombre y todas las comprobaciones de
   forma del valor.
3. **La lista de denegación basada en nombre** (`RedactionPolicy.DEFAULT`)
   — una coincidencia de subcadena sin distinguir mayúsculas/minúsculas
   contra nombres de campo (`password`, `secret`, `token`, `apikey`, `cvv`,
   `ssn`, `authorization`, `credential`, `cardnumber`, `jwt`, `cookie`,
   `sessionid`, `accountnumber`, `routingnumber`, `pan`, `iban`, y sus
   formas en `snake_case`), más una segunda comprobación independiente
   sobre la *forma* del propio valor — un JWT (`eyJ…`), un número de
   tarjeta válido según Luhn, o una cadena con forma de `Set-Cookie` — de
   modo que un valor sin nombre (un elemento de lista, un valor de mapa) o
   un token bearer bajo un nombre no reconocido se sigue atrapando.
   `"companyName"`/`"panelId"` no coinciden con `pan` — los dos patrones
   más propensos a falsos positivos (`pan`, `iban`) coinciden en los
   límites de token del identificador, no por subcadena a secas.

Un **`toString()` cuidado** normalmente se respeta tal como está escrito —
pero una clase que declara cualquier campo `static notTraced` se
introspecciona campo por campo en su lugar, así que la anotación se honra
por encima de lo que ese `toString()` habría impreso. La resolución de
plantillas tampoco tiene un atajo para saltarse esto: se auditó para
asegurar que nunca recurre al `toString()` crudo de un valor cuando el
renderizado seguro omitió el marcador por un motivo no relacionado
(truncamiento por el límite de campos/profundidad) — todo valor de
marcador de posición no escalar pasa por el mismo renderizador que oculta
campos que usa el resto de la traza, sin excepciones.

La ocultación también **sobrevive el anidamiento** — un miembro oculto
dentro de un array, un `Set`, un `Map`, un objeto plano, varios de esos
apilados, y un ciclo autorreferencial, todos están fijados por prueba
(`redacted-value-containment.test.ts`). Y **gana sobre una plantilla de
narración que lo nombra**: `{param.property}` en `@narrated`/`@onError`
resuelve una ruta hacia un miembro oculto como `[REDACTED]`, nunca con el
valor literal — fijado de extremo a extremo a través de la vía de captura
real, incluyendo específicamente la forma "marcador de posición de objeto
completo, volcado de campos por defecto" (sin ningún `toString()`
personalizado en el objeto).

Detalle completo y ejemplos trabajados:
[Guía de decoradores § `@notTraced`](guia-de-decoradores.md#nottraced).

## Garantías

- **Los fallos de trazado están aislados de la ejecución del host.** La
  captura es de mejor esfuerzo por construcción: cualquier fallo al
  resolver nombres, renderizar parámetros o entrar en un span degrada a una
  llamada sin trazar en lugar de bloquear o hacer fallar el método de
  negocio (el propio "contrato sin veneno" de `trace-object.ts`). Un
  `toString()` personalizado que lanza excepción, un getter que lanza
  excepción y que está nombrado en una plantilla, o un buffer lleno, nunca
  cambian lo que tu método devuelve o lanza.
- **Toda integración distribuida respeta la ocultación.** Consulta la
  tabla de arriba — ninguna integración expone una forma de saltársela.
- **La vía de análisis en búfer puede descartar eventos, pero siempre
  informa de la pérdida.** Nunca bloquea al llamador y nunca crece más allá
  de su límite (un anillo de tamaño fijo, `8,192` eventos por defecto en el
  fixture de Vitest, más en un proceso de larga duración — consulta
  [Guía de configuración § 8](guia-de-configuracion.md#8-almacenamiento-en-búfer-del-pipeline-de-eventos-bufferedeventconsumer)).
  Una captura que perdió eventos imprime el recuento y hasta cuánto subir
  la capacidad, en su propio pie de página.

## No-garantías

- **Ninguna promesa de "coste cero".** El trazado hace trabajo, y el
  trabajo cuesta algo — consulta la
  [sección de rendimiento del README](../../LEAME.md#rendimiento).
- **Ningún trazado de campos privados, pero tampoco ningún requisito de
  interfaz.** Los campos de clase `#private` no pueden ser interceptados
  por un `Proxy` en absoluto — una limitación del propio lenguaje
  JavaScript. A diferencia de un proxy dinámico de la JVM, no hace falta
  implementar ninguna interfaz primero; todo método alcanzable mediante
  búsqueda de propiedades — declarado en el propio objeto o heredado de su
  cadena de prototipos — es visible para `traceObject()`.
- **Todavía sin artefacto estructural libre de valores.** Otros puertos
  de NarrativeTrace sí distribuyen un artefacto tipo `.nt` sin ningún valor
  de runtime, pensado para entregárselo a una herramienta de IA con cero
  superficie de inyección de prompts por construcción. Este puerto todavía
  no ha construido eso — consulta
  [Qué commitear](que-commitear.md#por-qué-todavía-no-hay-una-fila-approvednt-aquí).
  Hasta que exista, todo artefacto generado en este puerto lleva valores
  reales capturados y debe tratarse en consecuencia.
- **Ninguna vía de "cero código" para envolver una app que no escribiste.**
  No existe un equivalente al agente Java en esta plataforma, así que el
  alcance siempre se define por sitio de llamada explícito o por anotación
  de clase — consulta
  [Eligiendo una integración § Límites de la plataforma](eligiendo-una-integracion.md#límites-de-la-plataforma).

## Lo que esta página no cubre

Qué ocurre cuando NarrativeTrace se apila con otra librería que también
envuelve el mismo objeto — un contenedor de DI, otro `Proxy`, una librería
de contratos. En resumen: NarrativeTrace narra únicamente los cruces de
frontera de negocio, y cuál envoltorio queda "por fuera" nunca cambia los
valores ocultos, el resultado de negocio, ni la excepción que llega a la
narración — consulta las
[preguntas frecuentes del README](../../LEAME.md#cómo-interactúa-narrativetrace-con-otras-bibliotecas-que-envuelven-métodos-aop-proxies-bibliotecas-de-contratos)
para el contrato de coexistencia completo.
