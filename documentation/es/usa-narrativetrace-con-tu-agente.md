<!-- source: documentation/use-with-your-agent.md blob b27cf541f674 | translated: 2026-10-10 | reviewed: - -->
# Usa NarrativeTrace con tu agente

[English](../use-with-your-agent.md) | **Español** | [Português](../pt-BR/use-narrativetrace-com-seu-agente.md) | [简体中文](../zh-CN/搭配你的智能体使用.md)

NarrativeTrace distribuye [habilidades de agente](habilidades-de-agente.md) — los procedimientos que un agente
sigue para instalar la biblioteca, leer una traza y diagnosticar una instalación — en el formato abierto
Agent Skills. Todas las plataformas de la tabla siguiente ya descubren las páginas que `init` escribe en
`.agents/skills`, así que hay un único conjunto de páginas y ninguna copia por plataforma. Lo que cambia de
una plataforma a otra es cómo una persona ajena al proyecto lleva las páginas a un proyecto, y qué archivo
pequeño señala al agente hacia ellas antes de que se le ocurra mirar.

## Plataformas de un vistazo

<!-- platform-table:begin -->
| Plataforma | Cómo obtiene las habilidades alguien ajeno al proyecto | Qué encuentra el agente tras `init` | Evidencia | Verificado |
|---|---|---|---|---|
| Cursor | Instala el plugin desde el manifiesto `.cursor-plugin` del repositorio público, o ejecuta `narrativetrace init` en el proyecto | las habilidades en `.agents/skills` (Cursor también lee `.claude/skills`), y la regla única `.cursor/rules/narrativetrace.mdc` que apunta a ellas | carril Tier B `cursor` | 2026-10-10 |
| Replit | Importa el repositorio público desde GitHub (pega su URL, previsualiza las habilidades, añádelas), o ejecuta `narrativetrace init` en el proyecto | las habilidades en `.agents/skills`, y una sección de NarrativeTrace en `replit.md`, la memoria del proyecto que el agente de Replit lee primero | prueba manual | 2026-10-10 |
| Antigravity | Nada que instalar aparte del propio proyecto: ejecuta `narrativetrace init` en el proyecto y haz commit de las habilidades (la CLI `agy` y el IDE las leen como habilidades del espacio de trabajo) | las habilidades en `.agents/skills`, que Antigravity lee como habilidades del espacio de trabajo, y la sección en `AGENTS.md`, que carga como reglas | carril Tier B `antigravity` | 2026-10-10 |
| GitHub Copilot | Nada que instalar aparte del propio repositorio: ejecuta `narrativetrace init` en el proyecto y haz commit de las habilidades | las habilidades en `.agents/skills` (Copilot también lee `.claude/skills` y `.github/skills`), y la sección en `AGENTS.md` | prueba manual | 2026-10-10 |
| Claude Code | Añade el repositorio como marketplace de plugins e instala su plugin, o ejecuta `narrativetrace init` en el proyecto | las habilidades en `.claude/skills` y `.agents/skills`, y la sección en `AGENTS.md` que importa `CLAUDE.md` | carril Tier B `claude` | 2026-10-10 |
<!-- platform-table:end -->

La tabla se renderiza desde el registro de plataformas que leen el instalador y el doctor, así que no puede
contradecir lo que hace `init`. La columna Verificado es la fecha en que se comprobaron por última vez los
datos de cada fila contra la documentación de la propia plataforma; el comportamiento de las plataformas
cambia rápido, así que trata esa fecha como parte de la respuesta y la documentación del proveedor como la
autoridad.

## Los archivos señaladores que escribe `init`

Un señalador es un archivo pequeño que la plataforma ya lee primero. Se escribe solo cuando el proyecto
muestra que la plataforma está en uso, nunca como copia de una página de habilidad, y nunca mediante un
enlace simbólico:

- **Cursor** — `.cursor/rules/narrativetrace.mdc`, una regla siempre aplicada que dice dónde viven las
  habilidades, escrita solo cuando el proyecto tiene un directorio `.cursor/`. El plugin de Cursor distribuye
  la misma regla.
- **Replit** — una sección marcada de NarrativeTrace en `replit.md`, la memoria del proyecto que el agente de
  Replit lee primero, escrita solo cuando el proyecto tiene `replit.md` o `.replit`. Es la misma sección que
  lleva `AGENTS.md`, con los mismos marcadores.
- **Antigravity, GitHub Copilot, Claude Code** — sin señalador. Leen `.agents/skills` y `AGENTS.md`
  directamente (Antigravity carga `AGENTS.md` como reglas; Claude Code también lee `.claude/skills`, que `init` escribe en todo proyecto).

Un señalador que ya es idéntico a lo que escribiría `init` se adopta en lugar de rechazarse, un archivo que
no es nuestro se rechaza sin `--force`, y `npx @narrativetrace/cli uninstall` elimina exactamente los
señaladores que escribió. `npx @narrativetrace/cli doctor` informa del señalador de cada plataforma detectada
como presente y actual, o nombra lo que falta, está obsoleto o es ajeno.

## Copiar a mano

Copiar funciona para cualquier plataforma, y es el único camino para un agente sin build propio:

- **Codex**: el catálogo renderiza
  [`.agents/skills/narrativetrace-doctor/`](../../.agents/skills/narrativetrace-doctor/SKILL.md) y
  los demás directorios de habilidades en la misma carpeta — el layout versionado en el repositorio que la
  CLI de Codex documenta para las habilidades propias de un proyecto, y que descubre por sí sola, subiendo
  desde el directorio de trabajo hasta la raíz del repositorio (y también `~/.agents/skills` para
  habilidades globales de usuario). Su frontmatter lleva solo `name` y `description` (Codex no documenta
  claves `when_to_use` ni `allowed-tools`); por lo demás, el cuerpo de la página es idéntico. Copia el
  directorio correspondiente en el `.agents/skills/<nombre>/` de tu propio proyecto y Codex lo descubre del
  mismo modo. Fuente: developers.openai.com/codex/skills y
  developers.openai.com/codex/concepts/customization (obtenido el 2026-09-13).
- **Antigravity**: las habilidades del espacio de trabajo se leen desde `.agents/skills/` (heredado:
  `.agent/skills/`), así que sirve la misma copia en el IDE y en la CLI `agy`. Su instalador de plugins
  solo lee el directorio `skills/` de primer nivel de un plugin, que este repositorio no distribuye,
  así que no hay una ruta `agy plugin install`.
- **Cualquier agente, cualquier plataforma**: todo agente que lea `AGENTS.md` ve la sección siempre activa
  que `init` escribe allí — el nombre y la descripción de las habilidades, para que un agente que nunca pensó
  en buscarlas igual sepa que existen.

## Evidencia

La fila de cada plataforma nombra la prueba que la respalda. Los carriles de Claude, Codex, Antigravity y Cursor
manejan la CLI de agente real contra el prompt de instalación sobre un proyecto de prueba, y un carril cuya
CLI no está instalada se omite con una línea en lugar de fallar; Replit y GitHub Copilot son pruebas
manuales registradas por el propietario. Los carriles, la política de cuota esporádica y la matriz de
promoción se describen en
[Tier B — pruebas con LLM](../../packages/skills-catalogue/evals/README.md).

## Relacionado

- [Habilidades de agente](habilidades-de-agente.md) — qué son las habilidades, cómo se construyen y el instalador
- [Guía de instalación](guia-de-instalacion.md) — la biblioteca en sí
