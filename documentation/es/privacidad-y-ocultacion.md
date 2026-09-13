<!-- source: documentation/privacy-and-redaction.md blob 8fc25f9b4abe | translated: 2026-09-13 | reviewed: - -->
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
| Traza estructural `.nt` (`renderStructural`/`renderStructuralDocument`) | No aplica — no lleva ningún valor que ocultar, para empezar |

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
   parámetro solo se aplica bajo `traceObject()`** *(since 0.1.3, unreleased)*
   — un parámetro
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

**Un `toString()` personalizado solo se respeta para un intrínseco de la
plataforma del realm** — `Date`, `URL`, `RegExp`, un `BigInt` empaquetado o
un array tipado (decisión del equipo, 2026-09-12, la excepción de la "hoja
de confianza"). *(since 0.1.3, unreleased)* Cualquier otro objeto — una
clase corriente, un valor con forma de registro, una "hoja" sin campo propio
visible — siempre se introspecciona campo por campo, sea lo que sea que su
`toString()` hubiera impreso. La comprobación de identidad es
`Object.getPrototypeOf(valor) === Date.prototype` (y lo mismo para cada uno
de los demás intrínsecos anteriores) — **nunca** `constructor.name` ni
ninguna otra comprobación basada en el nombre: una clase de usuario puede
llamarse a sí misma `Date` libremente sin tocar jamás el `Date.prototype`
real, y las instancias de una subclase llevan el prototipo de la *subclase*
un nivel por encima, no el del intrínseco base, así que ni un impostor con
el mismo nombre ni una subclase de un tipo de la plataforma se respetan
jamás por simple asociación. `Error` queda deliberadamente excluido de esta
lista aunque también sea un intrínseco del realm: a diferencia de la marca
de tiempo opaca de `Date` o el búfer numérico de un array tipado,
`Error.prototype.toString()` interpola `message` — texto libre que quien
llama suministra al construirlo (`new Error(usuario.password)`) —
exactamente la forma que un campo en la lista de ocultación existe para
atrapar, así que un valor `Error` se introspecciona campo por campo como
cualquier otro objeto. *(since 0.1.3, unreleased)*

Esto estrecha una regla intermedia de vida corta de 2026-09-11 ("respetar
`toString()` para cualquier hoja — cualquier objeto sin ningún campo propio
enumerable") que este port publicó durante menos de un día: en esta
plataforma, "sin campo propio enumerable" nunca fue en realidad prueba de
"nada que ocultar" como suena — un campo `#private` verdadero, una variable
de clausura o un `WeakMap` a nivel de módulo indexado por `this` son
invisibles para `Object.keys` pero perfectamente legibles desde dentro del
propio `toString()` de la clase, así que un impostor con el mismo nombre o
la misma forma de un tipo de confianza aún podía filtrarse a través de él.
Restringir la confianza al conjunto pequeño y cerrado de intrínsecos que
esta librería trae consigo — nunca una clase de usuario arbitraria, hoja o
no — cierra ese agujero por completo. La propia regla de 2026-09-11 cerró
antes una todavía más estrecha: la regla original ("respetar `toString()`
salvo que uno de los campos propios de *este objeto* sea un objetivo de
ocultación") pasaba por alto un `toString()` que interpola el texto cuidado
de un objeto **anidado** (`Order.toString()` imprimiendo `this.customer`,
que a su vez es un `Customer` que oculta un campo) — el nombre o la
anotación del campo oculto nunca aparecía en el propio `Order`, así que la
comprobación de campos propios no encontraba nada que atrapar y el secreto
anidado se imprimía por completo. La misma regla se aplica a una **clave**
de `Map`: una clave que es en sí misma un objeto pasa por el mismo
renderizado consciente de la ocultación que un valor, nunca por un
`toString()` crudo e incondicional. *(since 0.1.3, unreleased)*

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
puede lanzar una excepción, o (solo `toString()`) devolver `null`.
*(since 0.1.3, unreleased)* Una
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
- **La traza estructural `.nt` no lleva ningún valor en tiempo de
  ejecución.** *(since 0.1.3, unreleased)* Solo nombres, jerarquía de llamadas y tipos de resultado —
  cero superficie de inyección de prompts, y eso es una propiedad del
  renderizador, no una política que alguien pudiera olvidar aplicar. Su
  cabecera `scenario:` está cubierta por lo mismo: una invocación de una fila
  de `createNarrativeTest(...).each(cases)` se titula `<nombre del test>
  #<índice>`, nunca la etiqueta en la que una plantilla interpoló sus
  argumentos (consulta [Structural Trace Format](../structural-trace-format.md),
  todavía sin traducir). Cómo se *llama* el artefacto — su nombre de fichero,
  y el propio título del test — es una pregunta distinta; consulta la
  no-garantía de abajo.
- **La frase de traza/ejecución no lleva ningún dato propio.** *(since 0.1.3, unreleased)*
  `bold elk soars` se deriva de forma determinista de un id de traza o de
  ejecución (`humanName()`, tres tablas de palabras fijas) — no es, ni lee
  nunca, nada que el código trazado haya producido, así que es seguro
  imprimirla, registrarla en el log o pegarla en un reporte de error por sí
  sola. Nunca llega al artefacto estructural `.nt`, a una traza aprobada o
  recibida, al nombre de fichero de un artefacto, ni a las claves por
  escenario del manifest — consulta
  [Guía de configuración § La ejecución tiene un nombre](guia-de-configuracion.md#la-ejecución-tiene-un-nombre-since-013-unreleased).

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
- **Ninguna ocultación de los nombres de los tests.** *(since 0.1.3, unreleased)* La cabecera
  `scenario:` del artefacto estructural y su nombre de fichero se derivan
  del propio título del test (y, para una invocación de `.each`, de la
  etiqueta interpolada, que solo llega al nombre de fichero — consulta
  [Structural Trace Format](../structural-trace-format.md), todavía sin
  traducir) — texto que escribió el desarrollador, no un valor capturado,
  así que ninguno de los mecanismos de ocultación de arriba se ejecuta
  jamás sobre él. Un título de test o una etiqueta de `.each` que incluya un
  secreto (`test("inicia sesión como ${password}", ...)`) pone ese secreto
  en el nombre de fichero y en la ruta del `.approved.nt` commiteado —
  mantén los secretos fuera de los títulos de test y de las plantillas de
  nombre de `.each`, la misma regla que en cualquier otro framework de
  testing.
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
