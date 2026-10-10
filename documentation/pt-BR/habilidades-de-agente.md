<!-- source: documentation/agent-skills.md blob 1b2fe91ce174 | translated: 2026-10-09 | reviewed: - -->
# Habilidades de agente

[English](../agent-skills.md) | [Español](../es/habilidades-de-agente.md) | **Português** | [简体中文](../zh-CN/智能体技能.md)

O NarrativeTrace distribui **habilidades**: procedimentos carregáveis por um agente que executam
comandos testados e condicionam sua conclusão a um passo `verify`, em vez de documentação que um
agente pode ou não ler. Uma habilidade é deliberadamente fina — a lógica de checagem, diagnóstico
ou geração vive em código de biblioteca testado; o trabalho da própria habilidade é saber quando
agir, invocar esse código testado, e interpretar o resultado no contexto.

## Seis habilidades: preparação, diagnóstico, clareza, relato, verificação e depuração

- **`add-narrative-tracing`** — instala o NarrativeTrace em um projeto e o leva ao primeiro trace:
  instalar com o toolchain real, conectar os frameworks que o projeto já usa rodando o doctor e
  aplicando cada correção `config.<framework>-*` que ele imprime (a página não nomeia nenhum
  framework: a tabela de frameworks do próprio doctor instalado é o oráculo), envolver uma classe,
  renderizar e rodar o primeiro trace, e então conectar um logger real (pino/winston/OpenTelemetry). Termina rodando
  `npx @narrativetrace/cli doctor` e passando o bastão — a costura entre as duas habilidades.
- **`narrativetrace-doctor`** — só diagnóstico, e **somente leitura**: nunca edita, gera ou apaga
  um arquivo. Roda a CLI testada, lê seu relatório, e percorre as partes que uma simples saída de
  CLI não cobre sozinha: provar a ocultação em um teste, ler um trace gerado antes de fazer
  asserções sobre ele, e o fluxo de traces aprovados (marcado como não estudado — sua própria
  célula de avaliação ainda está pendente).
- **`add-narrativetrace-clarity`** — adiciona ou verifica um relatório de nomes em um projeto Vitest:
  registra o `ClaritySuiteReporter` de `@narrativetrace/vitest/reporters`, roda a suíte, confere que
  o `clarity-results.json` é recente e não está vazio, lê as pontuações e os problemas e os explica.
  Renomeia pelas sugestões do próprio relatório e repete até o `npx narrativetrace-clarity` passar
  limpo, e só adiciona um portão aos scripts do pacote quando pedirem — sem nunca baixar um limite
  que o projeto já tenha.
- **`narrativetrace-feedback`** — relata um defeito no próprio NarrativeTrace: uma verificação do
  doctor que está errada ou cuja correção não funciona, um passo de habilidade que não dá para
  seguir, uma redação do prompt de instalação que levou ao lugar errado, ou a biblioteca se
  comportando mal em um projeto bem configurado. O verbo testado por trás dela,
  `narrativetrace feedback`, redige o relatório a partir do projeto (as coordenadas de instalação,
  o próprio relatório JSON do doctor e, no máximo, um trace estrutural) e **se recusa a escrever um
  relatório que carregue um valor dos seus traces** — nomeando a regra que o recusou, de modo que
  haja algo específico a corrigir em vez de um aviso a ignorar. A habilidade então mostra o rascunho
  inteiro e pergunta uma única vez se deve registrá-lo publicamente. Não envia nada a lugar nenhum
  e não registra nada sem uma resposta dada em um turno próprio.
- **`narrativetrace-verify`** — lê o que uma mudança realmente fez antes de o agente dizer que está
  concluída. Roda depois que os testes estão verdes e começa com uma regra de custo que diz em voz
  alta: rastrear uma mudança que cruza colaboradores, ramifica, faz retentativas, roda de forma
  assíncrona ou carrega estado; pular uma função pura ou uma edição de uma só classe, e dizer por
  quê. Depois escreve a intenção **antes** da execução (um trace lido contra nada confirma o que
  quer que tenha acontecido), roda o menor caminho real, lê o `.nt` estrutural, sem valores, contra
  a intenção, abre valores em apenas um span, e relata o que o trace mostrou — cada afirmação
  citando um id de span (`#1.3`). Seus últimos passos **fixam** o fluxo: modo de aprovação ligado,
  a suíte inteira rodada, o `.received.nt` mostrado por inteiro, uma pergunta, e a promoção só
  depois do seu sim.
- **`narrativetrace-debug`** — parte de um sintoma, não de uma mudança: o reproduz com o rastreamento
  ligado, nomeia por id de span o primeiro span em que um valor diverge **antes** de qualquer código
  mudar, restringe-se à subárvore desse span envolvendo mais um colaborador (nunca `@notTraced`,
  que oculta), corrige ali, confere que o trace estrutural não mostra mais nada se movendo, e fixa a
  reprodução como teste de regressão atrás do mesmo portão. Um defeito no próprio NarrativeTrace vai
  para `narrativetrace-feedback` em vez de ser contornado.

Elas se compõem: um projeto novo começa com `add-narrative-tracing`; um projeto que já tem o
NarrativeTrace instalado, onde algo não está funcionando, começa com `narrativetrace-doctor`.
Qualquer um dos caminhos termina no doctor — a partir daí, o diagnóstico é dele.
`add-narrativetrace-clarity` cuida dos primeiros relatórios de nomes e da exigência opcional de
clareza; ela não instala o rastreamento nem colhe um glossário, e nenhum achado do doctor aponta
para ela, porque nada falha por não haver um relatório. `narrativetrace-feedback` é onde um caminho termina quando o problema acaba sendo nosso e não do
projeto — a regra de encerramento do próprio doctor aponta para ela. Uma habilidade
futura vai cuidar da geração (escrever o teste de prova de ocultação que o doctor só pode pedir
para você adicionar hoje).
`narrativetrace-verify` é onde a próxima sessão começa quando o rastreamento funciona — o último
passo da habilidade de instalação passa o bastão para ela — e `narrativetrace-debug` é onde começa
um sintoma relatado. Ambas renderizam uma única seção compartilhada de "como ler um trace", então
nunca ensinam duas maneiras de ler o mesmo arquivo.

## Instalando-as

- **`npx @narrativetrace/cli init`** — o caminho mais rápido, para qualquer projeto: primeiro
  mostra uma prévia do plano e um diff unificado (`--dry-run`, não escreve nada), depois aplica
  exatamente o que a prévia mostrou. Copia as seis habilidades para `.agents/skills/` — e para
  `.claude/skills/` quando o projeto é daquele fornecedor — e escreve uma seção marcada no
  `AGENTS.md`; um `CLAUDE.md` que já exista recebe uma linha `@AGENTS.md`, nenhum é criado. Rode de
  novo a qualquer momento para atualizar: não há gancho de build, e uma nova execução reescreve
  somente as páginas e a seção que lhe pertencem. Veja
  [`@narrativetrace/cli`](../../packages/cli/README.md#narrativetrace-init) para todas as opções.
  A prévia contra um projeto vazio é mostrada mais abaixo.
- **Copiar os arquivos gerados à mão** continua sendo o plano B — os mesmos caminhos que o `init`
  escreve, mas sem a linha de procedência e sem você mesmo atualizar a seção do `AGENTS.md`.
  **Claude Code**: neste repositório há `SKILL.md` gerados em
  [`.claude/skills/add-narrative-tracing/`](../../.claude/skills/add-narrative-tracing/SKILL.md) e
  [`.claude/skills/narrativetrace-doctor/`](../../.claude/skills/narrativetrace-doctor/SKILL.md) e
  [`.claude/skills/narrativetrace-feedback/`](../../.claude/skills/narrativetrace-feedback/SKILL.md) e
  [`.claude/skills/add-narrativetrace-clarity/`](../../.claude/skills/add-narrativetrace-clarity/SKILL.md) e
  [`.claude/skills/narrativetrace-verify/`](../../.claude/skills/narrativetrace-verify/SKILL.md) e
  [`.claude/skills/narrativetrace-debug/`](../../.claude/skills/narrativetrace-debug/SKILL.md),
  cada diretório nomeado com o nome canônico da sua habilidade — o prefixo do plugin do Claude é o
  único lugar onde um segmento abreviado é legítimo, e nada neste repositório é um plugin. Copie
  qualquer um deles para o `.claude/skills/<nome>/` do seu próprio projeto e o Claude a
  reconhece sozinho, invocável pelo nome (`add-narrative-tracing` / `narrativetrace-doctor` /
  `narrativetrace-feedback` / `add-narrativetrace-clarity` / `narrativetrace-verify` / `narrativetrace-debug`) diretamente. **Codex**: os `SKILL.md` gerados também vivem em
  [`.agents/skills/add-narrative-tracing/`](../../.agents/skills/add-narrative-tracing/SKILL.md) e
  [`.agents/skills/narrativetrace-doctor/`](../../.agents/skills/narrativetrace-doctor/SKILL.md) e
  [`.agents/skills/narrativetrace-feedback/`](../../.agents/skills/narrativetrace-feedback/SKILL.md) e
  [`.agents/skills/add-narrativetrace-clarity/`](../../.agents/skills/add-narrativetrace-clarity/SKILL.md) e
  [`.agents/skills/narrativetrace-verify/`](../../.agents/skills/narrativetrace-verify/SKILL.md) e
  [`.agents/skills/narrativetrace-debug/`](../../.agents/skills/narrativetrace-debug/SKILL.md) —
  o layout que a CLI do Codex descobre sozinha, subindo do diretório de trabalho até a raiz do
  repositório (e também `~/.agents/skills` para habilidades globais de usuário). Seu frontmatter é
  um subconjunto estrito do da Claude (apenas `name` e `description` — sem `when_to_use`, sem
  `allowed-tools`), então o mesmo corpo de página é distribuído sob os dois layouts. Fonte:
  developers.openai.com/codex/skills e developers.openai.com/codex/concepts/customization
  (obtido em 2026-09-13).
- **Qualquer agente, qualquer plataforma**: todo agente que lê `AGENTS.md` vê o apontador sempre
  ativo que o próprio `AGENTS.md` deste repositório carrega entre seus marcadores
  `<!-- narrativetrace:skills:start -->` — o nome e a descrição das seis habilidades, para que um
  agente que nunca pensou em procurá-las ainda assim saiba que elas existem.
- **Gemini** está no roteiro mas ainda não foi construído.

Uma prévia `--dry-run --json` contra um projeto vazio se parece com isto:

```json
{
  "carrier": "@narrativetrace/skills@0.3.0",
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
      "path": ".agents/skills/narrativetrace-feedback/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/add-narrativetrace-clarity/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-verify/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-debug/SKILL.md",
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

## De um registro

Um projeto pode carregar essas habilidades sem que ninguém aqui jamais rode o instalador, em um
dos três estados:

1. **Instalado pelo `init`** — commitado, do time. O único estado que `config.skills-installed`
   aprova: as páginas carregam a linha de procedência e correspondem à versão que este projeto
   resolve.
2. **Uma instalação pessoal a partir de um registro** (um cache de plugins do Claude Code) — só
   sua. Invisível para o doctor por design: ele diagnostica o projeto, e uma instalação pessoal não
   alcança nenhum colega de time nem nenhum outro agente.
3. **Uma instalação de registro dentro do projeto** (`npx skills add`) — as páginas geradas deste
   mesmo repositório, que chegaram por um registro em vez do `init`, então ainda não carregam a
   linha de procedência.

Experimentar as habilidades por conta própria, sem tocar no projeto:

```text
/plugin marketplace add narrativetrace/narrativetrace-typescript
/plugin install narrativetrace-typescript@narrativetrace-typescript
```

depois rode `npx @narrativetrace/cli init --dry-run`, leia o diff, e rode sem a flag para que o
`AGENTS.md` aponte para elas.

Instalando no projeto a partir do registro do padrão aberto:

```text
npx skills add narrativetrace/narrativetrace-typescript
```

depois rode `npx @narrativetrace/cli init --dry-run`, leia o diff, e rode sem a flag para que o
`AGENTS.md` aponte para elas.

Uma página deixada por um registro nunca é recusada só por estar ali. O `init` a compara, byte a
byte, normalizando só a quebra de linha, com o que ele mesmo teria gerado. Uma idêntica à própria
página desta versão fica **adotada** — é isso que o plano diz, em vez de "substituída", porque
quem lê precisa saber que nada seu foi sobrescrito. Este é o próprio texto do plano, citado, nunca
digitado de novo aqui:

```ts
const ADOPTED = "adopted: identical to this carrier's page, so only the provenance line is added";
```

Uma página que difere — outra versão, ou editada à mão — mantém a recusa comum para a qual existe
o `--force`. O `npx skills add` também deixa `.claude/skills/<nome>` como um link simbólico para a
página do padrão aberto; o `init` nunca escreve através de um link como esse. Um link cujo destino
ele adotaria ou já possui é substituído por um diretório real com o sabor correto; qualquer outro
link é recusado, porque `--force` cobre conteúdo, nunca um link.

E este é o próprio reparo do doctor, citado do mesmo jeito, para um projeto onde as páginas estão
ali, mas não carregam nada disso:

```ts
const INIT_DRY_RUN = "npx --yes @narrativetrace/cli init --dry-run";
const NOT_OURS = " (there, but not ours)";

/**
 * What a page with no provenance line most often IS: a registry install (design D5 state 3) — `npx
 * skills add`, or a plugin or workspace install — of this repository's own rendered pages. Naming the
 * case matters because the obvious reading of "not ours" is "somebody else's work", which invites a
 * `--force` nobody needs: `init` ADOPTS a page identical to this release's.
 */
const FROM_A_REGISTRY =
  " Pages that are there without our line usually came from a registry (npx skills add, a plugin" +
  " or workspace install). A page identical to this release's is adopted, and no --force is needed.";
```

## Como elas são construídas

Nenhuma habilidade é editada à mão.
`packages/skills-catalogue/src/catalogue/add-narrative-tracing.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-doctor.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-feedback.ts`,
`packages/skills-catalogue/src/catalogue/add-narrativetrace-clarity.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-verify.ts` e
`packages/skills-catalogue/src/catalogue/narrativetrace-debug.ts` são as seis fontes de verdade
(a seção de leitura, o portão de aprovação e a fixação que as três últimas compartilham são
escritos uma só vez, ao lado delas);
`pnpm run skills-render` regenera as páginas `.claude/skills/` e `.agents/skills/` de cada
habilidade, e a
seção do próprio `AGENTS.md` deste repositório, a partir delas, e `pnpm run skills-check`
(integrado em
`pnpm run check`) quebra a build assim que qualquer página gerada se desviar da fonte tipada. Todo
bloco de código que uma página gerada mostra é embutido a partir de código-fonte real e testado
através da mesma convenção de marcadores `<!-- snippet: -->` que os outros documentos deste
repositório usam — nunca um exemplo digitado à mão. Um lint de Nível A mantém citações a notas de
planejamento privadas fora das páginas: as frases de justificativa ficam, a citação que nomeia
a nota não. Um segundo lint vigia o único trecho de frontmatter cuja ausência é uma virtude: uma
habilidade cujos passos podem tornar algo público — hoje, `narrativetrace-feedback` — não deve
declarar `allowed-tools`, porque esse campo pré-aprova as ferramentas listadas durante o turno que
carrega a habilidade, e uma habilidade de relato que pré-aprovasse o próprio comando de relato faria
o harness deixar de perguntar justamente onde perguntar é o ponto. Um terceiro lint mantém a mesma
linha para as duas habilidades que promovem uma linha de base de aprovação
(`narrativetrace-verify`, `narrativetrace-debug`): uma habilidade que roda o comando de aprovação
não declara nenhuma ferramenta permitida.

## Veja também

- [`@narrativetrace/cli`](../../packages/cli/README.md) — o comando `doctor` que `narrativetrace-doctor` executa, e o comando `feedback` que `narrativetrace-feedback` aciona
- [Sessenta segundos](sessenta-segundos.md) — o passo a passo de instalação e primeiro trace de onde vêm os passos de `add-narrative-tracing`
- [O que commitar](o-que-commitar.md) — o estado dos traces aprovados que o quarto passo do doctor verifica
