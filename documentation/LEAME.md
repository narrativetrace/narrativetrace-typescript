# Documentación de NarrativeTrace

[English](README.md) | **Español** | [Português](LEIAME.md) | [简体中文](自述文件.md)

El índice de las guías de usuario de NarrativeTrace en español. La documentación técnica y de diseño
(superficie de la API, pruebas de seguridad y de concurrencia) permanece solo en inglés — consulta el
[índice completo](README.md). Consulta las convenciones de la plataforma de traducción para las
reglas de esta implementación.

Empieza aquí:

| Documento | Qué cubre |
|---|---|
| [Ve una traza en 60 segundos](es/sesenta-segundos.md) | Un servicio diminuto, un test de Vitest, siete pasos hasta una traza real, con salida real |
| [Guía de instalación](es/guia-de-instalacion.md) | Dependencias, cada camino de integración, configuración de la salida de trazas |
| [Eligiendo una integración](es/eligiendo-una-integracion.md) | Qué paquete necesitas, como diagrama de decisión |
| [Guía de configuración](es/guia-de-configuracion.md) | Niveles de tracing, config de Vitest, opciones de renderizado |
| [Guía de decoradores](es/guia-de-decoradores.md) | `@traced`, `@narrated`, `@onError`, `@notTraced` |

Yendo más a fondo:

| Documento | Qué cubre |
|---|---|
| [Privacidad y ocultación](es/privacidad-y-ocultacion.md) | El contrato de ocultación fila por fila, verificado contra el código |
| [Qué commitear](es/que-commitear.md) | Qué ficheros generados son salida de ejecución y cuáles (si acaso) son baselines revisadas |
| [Solución de problemas](es/solucion-de-problemas.md) | Síntoma → causa → solución para los modos de fallo que la gente realmente encuentra |
| [Habilidades de agente](es/habilidades-de-agente.md) | `add-narrative-tracing`, `narrativetrace-doctor` (una habilidad de agente fina y de solo lectura sobre `npx @narrativetrace/cli doctor`), `add-narrativetrace-clarity`, `narrativetrace-feedback`, `narrativetrace-verify`, `narrativetrace-debug` y `narrativetrace-explain` |
| [Usa NarrativeTrace con tu agente](es/usa-narrativetrace-con-tu-agente.md) | Cursor, Replit, Antigravity, GitHub Copilot y Claude Code: cómo obtiene cada uno las habilidades, el archivo señalador que `init` escribe para él y la evidencia detrás de cada fila |
| [Guía de claridad](es/guia-de-claridad.md) | Modelo de puntuación, componentes de NLP, scanner estático |
| [Guía de integración de frameworks](es/guia-de-integracion-de-frameworks.md) | Express, Hono, navegador, AsyncLocalStorage |
| [Guía de ejemplos](es/guia-de-ejemplos.md) | El lanzador `pnpm demo` y los ejemplos ejecutables |
| [Guía de funcionalidades](es/guia-de-funcionalidades.md) | Catálogo canónico de lo que distribuye esta implementación, con tier y estado |

Recetas, una página por problema, con la salida real de una ejecución:

| Documento | Qué cubre |
|---|---|
| [Añade registro a este servicio](es/recetas/anade-registro-a-este-servicio.md) | Un checkout sin una sola sentencia de log: envuelves sus colaboradores una vez y cada llamada aparece en el logger del proyecto |
| [Ayúdame a depurar y arreglar este error](es/recetas/ayudame-a-depurar-y-arreglar-este-error.md) | Una tarjeta rechazada deja el stock reservado: encontrar el `release` que falta, arreglarlo y fijarlo |
| [Por qué falló esta prueba](es/recetas/por-que-fallo-esta-prueba.md) | Una prueba roja leída span por span contra su aserción |
| [Revisa un flujo complejo antes de cambiarlo](es/recetas/revisa-un-flujo-complejo-antes-de-cambiarlo.md) | Una ejecución en `detail` y en `summary`, el log junto al `.nt` sin valores |
| [Revisa una refactorización: ¿cambió el comportamiento?](es/recetas/revisa-una-refactorizacion-cambio-el-comportamiento.md) | Las pruebas siguen en verde y el diff de aprobación nombra la llamada eliminada |

Estas traducciones están PENDIENTES DE REVISIÓN por un hablante nativo — cada fichero registra su
estado de revisión en la cabecera de la línea 1 (`pnpm run translation-status` imprime la matriz
completa).
