<!-- source: documentation/agent-skills.md blob fafddfa7e15e | translated: 2026-09-16 | reviewed: - -->
# Habilidades de agente

[English](../agent-skills.md) | [Español](../es/habilidades-de-agente.md) | **Português** | [简体中文](../zh-CN/智能体技能.md)

O NarrativeTrace distribui **habilidades**: procedimentos carregáveis por um agente que executam
comandos testados e condicionam sua conclusão a um passo `verify`, em vez de documentação que um
agente pode ou não ler. Uma habilidade é deliberadamente fina — a lógica de checagem, diagnóstico
ou geração vive em código de biblioteca testado; o trabalho da própria habilidade é saber quando
agir, invocar esse código testado, e interpretar o resultado no contexto.

## Duas habilidades: preparação e diagnóstico

- **`add-narrative-tracing`** — instala o NarrativeTrace em um projeto e o leva ao primeiro trace:
  instalar com o toolchain real, envolver uma classe, renderizar e rodar o primeiro trace, e então
  conectar um logger real (pino/winston/OpenTelemetry). Termina rodando
  `npx @narrativetrace/cli doctor` e passando o bastão — a costura entre as duas habilidades.
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

- **`npx @narrativetrace/cli init`** — o caminho mais rápido, para qualquer projeto: primeiro
  mostra uma prévia do plano e um diff unificado (`--dry-run`, não escreve nada), depois aplica
  exatamente o que a prévia mostrou. Copia as duas habilidades para `.agents/skills/` — e para
  `.claude/skills/` quando o projeto é daquele fornecedor — e escreve uma seção marcada no
  `AGENTS.md`; um `CLAUDE.md` que já exista recebe uma linha `@AGENTS.md`, nenhum é criado. Rode de
  novo a qualquer momento para atualizar: não há gancho de build, e uma nova execução reescreve
  somente as páginas e a seção que lhe pertencem. Veja
  [`@narrativetrace/cli`](../../packages/cli/README.md#narrativetrace-init) para todas as opções.
  Uma prévia `--dry-run --json` contra um projeto vazio se parece com isto:
  ```json
  {
    "carrier": "@narrativetrace/skills@0.2.0",
    "actions": [
      {
        "kind": "create",
        "path": ".agents/skills/narrativetrace-doctor/SKILL.md",
        "status": "planned"
      },
      {
        "kind": "create",
        "path": ".agents/skills/add-narrative-tracing/SKILL.md",
        "status": "planned"
      },
      {
        "kind": "create",
        "path": "AGENTS.md",
        "status": "planned"
      }
    ],
    "exitCode": 0
  }
  ```
- **Copiar os arquivos gerados à mão** continua sendo o plano B — os mesmos caminhos que o `init`
  escreve, mas sem a linha de procedência e sem você mesmo atualizar a seção do `AGENTS.md`.
  **Claude Code**: neste repositório há `SKILL.md` gerados em
  [`.claude/skills/add-narrative-tracing/`](../../.claude/skills/add-narrative-tracing/SKILL.md) e
  [`.claude/skills/narrativetrace-doctor/`](../../.claude/skills/narrativetrace-doctor/SKILL.md),
  cada diretório nomeado com o nome canônico da sua habilidade — o prefixo do plugin do Claude é o
  único lugar onde um segmento abreviado é legítimo, e nada neste repositório é um plugin. Copie
  qualquer um desses diretórios para o `.claude/skills/<nome>/` do seu próprio projeto e o Claude a
  reconhece sozinho, invocável pelo nome (`add-narrative-tracing` / `narrativetrace-doctor`)
  diretamente. **Codex**: os `SKILL.md` gerados também vivem em
  [`.agents/skills/add-narrative-tracing/`](../../.agents/skills/add-narrative-tracing/SKILL.md) e
  [`.agents/skills/narrativetrace-doctor/`](../../.agents/skills/narrativetrace-doctor/SKILL.md) —
  o layout que a CLI do Codex descobre sozinha, subindo do diretório de trabalho até a raiz do
  repositório (e também `~/.agents/skills` para habilidades globais de usuário). Seu frontmatter é
  um subconjunto estrito do da Claude (apenas `name` e `description` — sem `when_to_use`, sem
  `allowed-tools`), então o mesmo corpo de página é distribuído sob os dois layouts. Fonte:
  developers.openai.com/codex/skills e developers.openai.com/codex/concepts/customization
  (obtido em 2026-09-13).
- **Qualquer agente, qualquer plataforma**: todo agente que lê `AGENTS.md` vê o apontador sempre
  ativo que o próprio `AGENTS.md` deste repositório carrega entre seus marcadores
  `<!-- narrativetrace:skills:start -->` — o nome e a descrição das duas habilidades, para que um
  agente que nunca pensou em procurá-las ainda assim saiba que elas existem.
- **Gemini** está no roteiro mas ainda não foi construído.

## Como elas são construídas

Nenhuma habilidade é editada à mão.
`packages/skills-catalogue/src/catalogue/add-narrative-tracing.ts` e
`packages/skills-catalogue/src/catalogue/narrativetrace-doctor.ts` são as duas fontes de verdade; `pnpm run
skills-render` regenera as páginas `.claude/skills/` e `.agents/skills/` das duas habilidades, e a
seção do próprio `AGENTS.md` deste repositório, a partir delas, e `pnpm run skills-check`
(integrado em
`pnpm run check`) quebra a build assim que qualquer página gerada se desviar da fonte tipada. Todo
bloco de código que uma página gerada mostra é embutido a partir de código-fonte real e testado
através da mesma convenção de marcadores `<!-- snippet: -->` que os outros documentos deste
repositório usam — nunca um exemplo digitado à mão. Um lint de Nível A mantém citações a notas de
planejamento privadas fora das duas páginas: as frases de justificativa ficam, a citação que nomeia
a nota não.

## Veja também

- [`@narrativetrace/cli`](../../packages/cli/README.md) — o comando `doctor` que `narrativetrace-doctor` executa
- [Sessenta segundos](sessenta-segundos.md) — o passo a passo de instalação e primeiro trace de onde vêm os passos de `add-narrative-tracing`
- [O que commitar](o-que-commitar.md) — o estado dos traces aprovados que o quarto passo do doctor verifica
