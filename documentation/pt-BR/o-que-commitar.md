<!-- source: documentation/what-to-commit.md blob 3f2805e2b04c | translated: 2026-09-13 | reviewed: - -->
# O que commitar

[English](../what-to-commit.md) | [Español](../es/que-commitear.md) | **Português** | [简体中文](../zh-CN/应提交的内容.md)

O NarrativeTrace escreve arquivos que descrevem uma execução de teste, por
padrão — uma suíte usando `createNarrativeTest` não precisa configurar nada
para obtê-los. A maioria é saída gerada, não um contrato revisado. A única
exceção deliberada além de `glossary.json` é o trace aprovado
(`.approved.nt`) *(since 0.1.3, unreleased)* — ative com `approval: true` (veja o
[Guia de Configuração](guia-de-configuracao.md#2-configuração-do-vitest)) e
ele se torna um contrato revisado e escrito à mão, do mesmo jeito que uma
baseline de aprovação em qualquer outra implementação do NarrativeTrace.

| Artefato | Commit? | Por quê |
|---|---|---|
| `narrativetrace-output/**/*.md` | Não | Regenerado a cada execução |
| `narrativetrace-output/**/*.json` | Não | O mesmo trace como JSON estruturado — regenerado a cada execução |
| `narrativetrace-output/**/*.canonical.json` | Não | A exportação canônica com versão de schema — regenerada a cada execução |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | Não | Regenerado a cada execução |
| `narrativetrace-output/**/*.clarity-json` | Não | Pontuações de clareza por cenário — regenerado a cada execução |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | Não | O agregado de toda a suíte (via `ClaritySuiteReporter`) — um relatório gerado, não uma decisão |
| `narrativetrace-output/structural/**/*.nt` | Não | A baseline *local* de último-verde com a qual o delta do console e os relatórios de falha comparam — não o trace aprovado abaixo |
| `narrativetrace-output/manifest.json` | Não | Índice cenário → artefatos, mais o `id`/`name` da própria execução *(since 0.1.3, unreleased)* — regenerado a cada execução |
| `<approvedDir>/**/*.approved.nt` | **Sim** | O trace aprovado revisado (só existe depois de definir `approval: true`) — o único artefato desta lista que é uma decisão deliberada, não saída |
| `<approvedDir>/**/*.received.nt` | Não | Escrito quando há uma divergência de aprovação, ou quando ainda não existe trace aprovado. Revise-o, rode `pnpm run approve-narratives` (ou `narrativetrace-approve`) para promovê-lo, depois apague-o ou deixe o script removê-lo — nunca faça commit do trace recebido em si |
| `<approvedDir>/**/*.incomplete.nt` | Não | Escrito no lugar de `.received.nt` quando a própria execução foi incompleta (um evento descartado, ou um escopo assíncrono recusado) — comparado por contenção de subsequência, nunca promovível |
| `glossary.json` / `glossary.md` | **Sim**, se a coleta do glossário for usada | Commitado na raiz do repositório assim que coletado; o arquivo commitado é o que a pontuação de clareza e as verificações de vocabulário leem de volta em cada execução subsequente — "um arquivo, um workflow de revisão" |
| `.claude/skills/**/SKILL.md`, a seção `<!-- narrativetrace:skills:* -->` do `AGENTS.md` | **Sim** *(since 0.1.3, unreleased)* | Saída de build do catálogo tipado de `packages/skills` (`pnpm run skills-render`), não saída de uma execução de teste — commitada do mesmo jeito que `glossary.json`: regenerada, revisada nos diffs, e checada contra desvios (`pnpm run skills-check`, integrado em `pnpm run check`) em vez de editada à mão |

Tudo o que está sob `narrativetrace-output/` é saída. Adicione ao
`.gitignore` caso ainda não tenha feito isso:

```gitignore
narrativetrace-output/
```

`<approvedDir>` (padrão `narratives/`) não é: os arquivos `.approved.nt` lá
devem ser rastreados, mas um `.received.nt`/`.incomplete.nt` ao lado de um
deles não fica excluído automaticamente. Adicione uma regra de exclusão
explícita para eles:

```gitignore
narratives/**/*.received.nt
narratives/**/*.incomplete.nt
```

Um job de CI que quer a narrativa no console e os metadados de
clareza/glossário, mas nenhum desses arquivos, pode definir
`NARRATIVETRACE_OUTPUT=false` — veja o
[Guia de Configuração](guia-de-configuracao.md#2-configuração-do-vitest).

## A regra em uma frase

Se um arquivo só existe porque um teste rodou, ele é saída — não faça
commit dele. Se um arquivo existe porque um humano o revisou e aceitou, ele
é uma baseline — commite-o, e espere que seus diffs sejam lidos na revisão
de código do mesmo jeito que o diff de um snapshot test. `glossary.json` e
`.approved.nt` são os dois arquivos desta lista que se espera que um humano
revise antes de eles serem incorporados: a coleta propõe adições ao
glossário e uma mudança estrutural rejeitada escreve um trace recebido, mas
commitar qualquer um dos dois é a aprovação (veja o
[Guia de Clareza](guia-de-clareza.md),
o [Guia de Funcionalidades § Melhore o código](guia-de-funcionalidades.md#melhore-o-código-diagnóstico-de-clareza)
e [Structural Trace Format](../structural-trace-format.md) para o ciclo de
aprovação completo — ainda não traduzido).
