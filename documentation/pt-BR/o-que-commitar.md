<!-- source: documentation/what-to-commit.md blob 3835cb480d69 | translated: 2026-09-03 | reviewed: - -->
# O que commitar

[English](../what-to-commit.md) | [Español](../es/que-commitear.md) | **Português** | [简体中文](../zh-CN/应提交的内容.md)

O NarrativeTrace escreve arquivos que descrevem uma execução de teste.
Nenhum deles é um contrato revisado e escrito à mão, como é uma baseline de
aprovação em outros ports do NarrativeTrace — este port ainda não lançou
testes estruturais/de aprovação (previsto para uma versão futura). Tudo
abaixo é saída gerada, com uma exceção.

| Artefato | Commit? | Por quê |
|---|---|---|
| `narrativetrace-output/**/*.md` | Não | Regenerado a cada execução |
| `narrativetrace-output/**/*.json` | Não | O mesmo trace como JSON estruturado — regenerado a cada execução |
| `narrativetrace-output/**/*.canonical.json` | Não | A exportação canônica com versão de schema — regenerada a cada execução |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | Não | Regenerado a cada execução |
| `narrativetrace-output/**/*.clarity-json` | Não | Pontuações de clareza por cenário — regenerado a cada execução |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | Não | O agregado de toda a suíte (via `ClaritySuiteReporter`) — um relatório gerado, não uma decisão |
| `glossary.json` / `glossary.md` | **Sim**, se a coleta do glossário for usada | Commitado na raiz do repositório assim que coletado; o arquivo commitado é o que a pontuação de clareza e as verificações de vocabulário leem de volta em cada execução subsequente — "um arquivo, um workflow de revisão" |

Tudo o que está sob `narrativetrace-output/` é saída. Adicione ao
`.gitignore` caso ainda não tenha feito isso:

```gitignore
narrativetrace-output/
```

## A regra em uma frase

Se um arquivo só existe porque um teste rodou, ele é saída — não faça
commit dele. O `glossary.json` é o único arquivo desta lista que se espera
que um humano revise antes de ele ser incorporado: a coleta propõe adições,
mas commitá-las é a aprovação (veja o [Guia de Clareza](guia-de-clareza.md)
e o [Guia de Funcionalidades § Melhore o código](guia-de-funcionalidades.md#melhore-o-código-diagnóstico-de-clareza)).

## Por que ainda não há uma linha `.approved.nt` aqui

Alguns ports do NarrativeTrace também disponibilizam um artefato
estrutural livre de valores e um workflow de aprovação — uma baseline
commitada que falha o build quando a *forma* de um cenário muda, revisada
e promovida deliberadamente. Este port ainda não construiu isso. Até que
construa, a coisa mais próxima de um contrato revisado que você tem hoje é
uma asserção normal no seu teste, mais o que quer que o gate de clareza
imponha sobre a nomenclatura. Se você quiser o workflow de diff estrutural
hoje, trate a exportação JSON (`exportJson`/`.canonical.json`) como sua
própria entrada para uma ferramenta de snapshot testing de sua escolha —
ela é determinística para uma captura livre de contexto, então uma
comparação de snapshot se comporta de forma razoável, mas o próprio
NarrativeTrace ainda não gerencia essa baseline para você.
