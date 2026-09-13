<!-- source: documentation/agent-skills.md blob 08eec00a160f | translated: 2026-09-13 | reviewed: - -->
# Habilidades de agente

[English](../agent-skills.md) | [Español](../es/habilidades-de-agente.md) | **Português** | [简体中文](../zh-CN/智能体技能.md)

*(since 0.1.3, unreleased)*

O NarrativeTrace distribui **habilidades**: procedimentos carregáveis por um agente que executam
comandos testados e condicionam sua conclusão a um passo `verify`, em vez de documentação que um
agente pode ou não ler. Uma habilidade é deliberadamente fina — a lógica de checagem, diagnóstico
ou geração vive em código de biblioteca testado; o trabalho da própria habilidade é saber quando
agir, invocar esse código testado, e interpretar o resultado no contexto.

## Duas habilidades: preparação e diagnóstico

- **`add-narrative-tracing`** — instala o NarrativeTrace em um projeto e o leva ao primeiro trace:
  instalar com o toolchain real, envolver uma classe, renderizar e rodar o primeiro trace, e então
  conectar um logger real (equivalente ao SLF4J: pino/winston/OpenTelemetry). Termina rodando
  `npx narrativetrace doctor` e passando o bastão — a costura entre as duas habilidades.
- **`narrativetrace-doctor`** — só diagnóstico, e **somente leitura**: nunca edita, gera ou apaga
  um arquivo. Roda a CLI testada, lê seu relatório, e percorre as partes que uma simples saída de
  CLI não cobre sozinha: provar a ocultação em um teste, ler um trace gerado antes de fazer
  asserções sobre ele, e o fluxo de traces aprovados (marcado como não estudado — sua própria
  célula de avaliação ainda está pendente).

Elas se compõem: um projeto novo começa com `add-narrative-tracing`; um projeto que já tem o
NarrativeTrace instalado, onde algo não está funcionando, começa com `narrativetrace-doctor`.
Qualquer um dos caminhos termina no doctor — a partir daí, o diagnóstico é dele. Uma habilidade
futura vai cuidar da geração (escrever o teste de prova de ocultação que o doctor só pode pedir
para você adicionar hoje).

## Instalando-as

- **Claude Code**: neste repositório há `SKILL.md` gerados em
  [`.claude/skills/add/`](../../.claude/skills/add/SKILL.md) e
  [`.claude/skills/doctor/`](../../.claude/skills/doctor/SKILL.md). Copie qualquer um desses
  diretórios para o `.claude/skills/<nome>/` do seu próprio projeto e o Claude a reconhece
  sozinho, invocável como `/narrativetrace:add` / `/narrativetrace:doctor` uma vez empacotada como
  plugin, ou pelo nome (`add-narrative-tracing` / `narrativetrace-doctor`) diretamente.
- **Qualquer agente, qualquer plataforma**: todo agente que lê `AGENTS.md` vê o apontador sempre
  ativo que o próprio `AGENTS.md` deste repositório carrega entre seus marcadores
  `<!-- narrativetrace:skills:start -->` — o nome e a descrição das duas habilidades, para que um
  agente que nunca pensou em procurá-las ainda assim saiba que elas existem.
- **Codex, Gemini, e um instalador automático** (`npx narrativetrace init` escrevendo esses
  caminhos para você) estão no roteiro mas ainda não construídos — hoje, copiar os arquivos
  gerados é o caminho.

## Como elas são construídas

Nenhuma habilidade é editada à mão. `packages/skills/src/catalogue/add-narrative-tracing.ts` e
`packages/skills/src/catalogue/narrativetrace-doctor.ts` são as duas fontes de verdade; `pnpm run
skills-render` regenera `.claude/skills/add/SKILL.md`, `.claude/skills/doctor/SKILL.md`, e a seção
do próprio `AGENTS.md` deste repositório a partir delas, e `pnpm run skills-check` (integrado em
`pnpm run check`) quebra a build assim que qualquer uma das três se desviar da fonte tipada. Todo
bloco de código que uma página gerada mostra é embutido a partir de código-fonte real e testado
através da mesma convenção de marcadores `<!-- snippet: -->` que os outros documentos deste
repositório usam — nunca um exemplo digitado à mão. Um lint de Nível A mantém citações a notas de
planejamento privadas fora das duas páginas: as frases de justificativa ficam, a citação que nomeia
a nota não.

## Veja também

- [`@narrativetrace/cli`](../../packages/cli/README.md) — o comando `doctor` que `narrativetrace-doctor` executa
- [Sessenta segundos](sessenta-segundos.md) — o passo a passo de instalação e primeiro trace de onde vêm os passos de `add-narrative-tracing`
- [O que commitar](o-que-commitar.md) — o estado dos traces aprovados que o quarto passo do doctor verifica
