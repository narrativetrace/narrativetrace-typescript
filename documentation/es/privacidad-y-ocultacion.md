<!-- source: documentation/privacy-and-redaction.md blob 324f03029bab | translated: 2026-09-11 | reviewed: - -->
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
| `traceObject()` (proxy) — la vía de captura sobre la que se construyen `express`, `hono`, `angular` y `react` | No |
| `AutoProxyModule` (`@narrativetrace/nestjs`) — su propia vía de captura separada, que muta el prototipo, *no* construida sobre `traceObject()` (ver la nota abajo) | No |
| Fixture de Vitest (`createNarrativeTest`/`narrativeTest`) | No |
| Una llamada personalizada a `renderValue()`/`renderStructured()` que tu propio código haga directamente | Sí — solo pasando `{ redactionPolicy: RedactionPolicy.DISABLED }` explícitamente, y aun así `@notTraced`/`static notTraced` siguen ocultando (ver más abajo) |
| `@notTraced` / `static notTraced` | No aplica — es lo que provoca la ocultación, y siempre gana, en todas las superficies, incluso en un renderizador con `RedactionPolicy.DISABLED` |

Verificado contra el código, no inferido: `traceObject()` es la vía de
captura sobre la que se construyen `express`, `hono`, `angular` y `react` —
nunca propaga una opción `redactionPolicy` desde el llamador. El fixture de
Vitest (`createNarrativeTest`/`narrativeTest`) aparece como su propia fila
arriba porque es un punto de entrada distinto — un proveedor de
`NarrativeContext`, no una vía de captura en sí — así que su garantía de
ocultación es la que aporte el mecanismo de captura con el que envuelvas
dentro del test (normalmente `traceObject()`, a veces `AutoProxyModule` en
un test de NestJS), nunca un tercer comportamiento propio.
**El `AutoProxyModule` de `@narrativetrace/nestjs` es una vía de captura
separada, hecha a mano (`wrapPrototypeMethods`), no un envoltorio sobre
`traceObject()`** — muta directamente el prototipo de cada provider
auto-envuelto en lugar de proxear una instancia, porque NestJS necesita que
se trace cada instancia que crea su contenedor de DI, no un solo objeto
envuelto a mano. Las dos vías comparten el almacenamiento del decorador
`@notTraced` (trasladado a `@narrativetrace/core` justamente por esto) pero
no los *nombres* de sus parámetros capturados: `wrapPrototypeMethods` no
tiene metadatos de decorador/reflexión para recuperar el nombre real de un
parámetro a partir de un método de prototipo crudo, así que ahí todo
parámetro se representa como `arg0`, `arg1`, …, un nombre que la lista de
denegación por NOMBRE, siempre activa, nunca puede igualar.
**Esto es una limitación estructural, no un error que se vaya a corregir
después:** JavaScript no expone los nombres de los parámetros en tiempo de
ejecución sin metadatos al estilo `@traced` que la vía de auto-envoltorio
no tiene. `@notTraced(i)` (ocultación por índice) y la ocultación por forma
del valor (un JWT, un número de tarjeta válido según Luhn, una cadena
`Set-Cookie`, o un dígito verificador o regla estructural de identidad
nacional — independientes del nombre) sí protegen un parámetro
auto-envuelto de NestJS; el eje basado en el nombre, por sí solo, no puede.
La opción `redactionPolicy` solo existe en las funciones de renderizado de
bajo nivel (`renderValue`/`renderStructured` en `@narrativetrace/core`), y
ninguna de las integraciones distribuidas expone una forma de
sobrescribirla. La única manera de llegar a `RedactionPolicy.DISABLED` es
que el código de la aplicación llame directamente a esas funciones — un
acto deliberado y revisable en tu propio código fuente, nunca un flag de
configuración ni una variable de entorno que un despliegue pueda cambiar.

## Qué oculta, y qué prevalece sobre qué

Tres mecanismos independientes se aplican a cada valor capturado o
renderizado:

1. **`@notTraced(i)`** en un parámetro de método, por índice — bajo
   `traceObject()`, el *llamador* (su constructor del mapa de valores)
   sustituye el marcador `[REDACTED]` antes de que se resuelva cualquier
   plantilla de narración o de error, de modo que el resolutor de
   plantillas nunca llega a tener el secreto para esta superficie. Bajo el
   `AutoProxyModule` de NestJS no hay ninguna superficie de
   narración/plantilla que proteger (esa integración no lee
   `@narrated`/`@onError`), pero el mismo decorador sigue ocultando el
   propio argumento capturado, leyendo el mismo almacenamiento que lee
   `traceObject()` (ver la nota de superficie por superficie arriba).
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
   — una coincidencia de subcadena sin distinguir mayúsculas/minúsculas ni
   acentos contra nombres de campo **y de parámetro** (`password`,
   `secret`, `token`, `apikey`, `cvv`, `ssn`, `authorization`,
   `credential`, `cardnumber`, `jwt`, `cookie`, `sessionid`,
   `accountnumber`, `routingnumber`, `passphrase`, `bearer`, `accesskey`,
   `socialsecurity`, `taxid`, `pan`, `iban`, y sus formas en `snake_case`),
   más una segunda comprobación independiente sobre la *forma* del propio
   valor — un JWT (`eyJ…`), un número de tarjeta válido según Luhn, una
   cadena con forma de `Set-Cookie`, o un dígito verificador o regla
   estructural de identidad nacional (RUT chileno, CPF/CNPJ brasileño,
   DNI/NIE español, NIR francés, cédula de residente china, o un número
   de la Seguridad Social de EE. UU. con guiones `AAA-GG-SSSS` — la única
   excepción sin dígito verificador, donde los tramos de área/grupo/serie
   nunca emitidos por la SSA lo sustituyen) — de modo que un
   valor sin nombre (un elemento de lista, un valor de mapa) o un token
   bearer bajo un nombre no
   reconocido se sigue atrapando. **La mitad de este eje basada en el
   parámetro solo se aplica bajo `traceObject()`** — un parámetro
   simplemente *nombrado* como un secreto (`paymentToken`, `password`) se
   oculta sin ningún decorador, exactamente igual que un nombre de campo.
   Bajo el `AutoProxyModule` de NestJS todo parámetro se captura como
   `arg0`, `arg1`, … (ver la nota de superficie por superficie arriba), así
   que esta mitad del eje no puede alcanzarlo — ahí solo `@notTraced` y la
   comprobación de forma del valor pueden. El vocabulario por defecto es
   **multilingüe y siempre activo** (el estándar de la familia, compartido
   con los demás runtimes de NarrativeTrace): el español (`contraseña`,
   `tarjeta`, `cédula`, `claveAcceso`, `rut`, `cuit`, `dni`), el portugués
   (`senha`, `cartão`, `cpf`, `cnpj`), el francés (`motDePasse`,
   `carteBancaire`, `nir`), el alemán (`passwort`, `kennwort`) y el chino
   (`密码`, `身份证`, más el pinyin `mima`/`shenfenzheng`) están junto a los
   patrones en inglés, sin ningún locale que seleccionar — las grafías con
   y sin acento se pliegan a un único patrón. `"companyName"`/`"panelId"`
   no coinciden con `pan` — los patrones más propensos a falsos positivos
   (`pan`, `iban`, `otp`, `rut`, `cuit`, `dni`, `senha`, `cpf`, `cnpj`,
   `nir`, `mima`) coinciden en los límites de token del identificador, no
   por subcadena a secas, de modo que `truthValue`, `circuitBreaker`,
   `chosenHash`, `semiMajorAxis` y `carbonFootprintId` siguen visibles
   mientras que `rutCliente`, `senhaUsuario` y `otpCode` quedan ocultos.

**Un `toString()` personalizado solo se respeta para una hoja** — un objeto
sin ningún campo propio, de modo que no hay nada más que la introspección de
campos podría mostrar en su lugar (invariante familiar, 2026-09-11; el
diseño de este port ya coincidía con el de .NET). En cuanto un objeto tiene
al menos un campo propio, siempre se introspecciona campo por campo,
sea lo que sea que su `toString()` hubiera impreso — no solo cuando ese
campo está anotado u oculto por nombre. Esto es más estricto de lo que
parece necesario, y es deliberado: la regla anterior, más estrecha ("respetar
`toString()` salvo que uno de los campos propios de *este objeto* sea un
objetivo de ocultación"), pasaba por alto la forma que cierra una corrección
de seguridad de 2026-09-11 — un `toString()` que interpola el texto cuidado
de un objeto **anidado** (`Order.toString()` imprimiendo `this.customer`,
que a su vez es un `Customer` que oculta un campo) nunca pone el nombre o la
anotación del campo oculto en el propio `Order`, así que la comprobación de
campos propios no encontraba nada que atrapar y el secreto anidado se
imprimía por completo. Confiar en `toString()` solo para las hojas cierra
toda esa clase de fuga de una vez, a cualquier profundidad de anidamiento,
en lugar de perseguir cada nueva forma de interpolación como un error
aparte. La misma regla se aplica a una **clave** de `Map`: una clave que es
en sí misma un objeto pasa por el mismo renderizado consciente de la
ocultación que un valor, nunca por un `toString()` crudo e incondicional.

`narrativeSummary()` es texto cuidado que la autora escribió específicamente
para la traza, y sigue superando tanto la confianza en `toString()` como la
introspección de campos — pero no está exento del análisis de forma del
valor (una forma JWT/PAN/SSN/identificación-nacional/`Set-Cookie` se oculta
incluso dentro de texto cuidado), y un `narrativeSummary()` que lanza
excepción ya no recae en `toString()`/introspección de campos: el valor
completo degrada al marcador de error tipado en su lugar (ver más abajo),
porque recaer así es exactamente cómo un resumen escrito para ocultar un
secreto podría reintroducirlo a través de los campos ordinarios de la clase
en el momento en que el propio resumen falla.

La resolución de plantillas tampoco tiene un atajo para saltarse nada de
esto: se auditó para asegurar que nunca recurre al `toString()` crudo de un
valor cuando el renderizado seguro omitió el marcador por un motivo no
relacionado (truncamiento por el límite de campos/profundidad) — todo valor
de marcador de posición no escalar pasa por el mismo renderizador que oculta
campos que usa el resto de la traza, sin excepciones.

## Errores durante el renderizado

Un miembro que esta librería invoca al renderizar un valor —
`narrativeSummary()`, el `toString()` de una hoja, o un getter de campo—
puede lanzar una excepción, o (solo `toString()`) devolver `null`. Una
excepción degrada al marcador de error tipado para esa única parte,
`<error: NombreDelConstructor>` (p. ej. `<error: TypeError>`; un valor
lanzado que no es un `Error` muestra su `typeof`, p. ej. `<error: string>`)
— **nunca el `message` de la excepción**, que puede llevar el valor exacto
que el miembro se negaba a renderizar. Un getter de campo que lanza
excepción degrada solo ese campo; los campos hermanos siguen
renderizándose con normalidad. Un `toString()` que devuelve `null` (sin
lanzar excepción) muestra en su lugar el marcador simple
`<NombreDelConstructor>`, ya que nada falló.

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
