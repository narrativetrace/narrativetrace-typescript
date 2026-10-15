# Documentação do NarrativeTrace

[English](README.md) | [Español](LEAME.md) | **Português** | [简体中文](自述文件.md)

O índice das guias de usuário do NarrativeTrace em português. A documentação técnica e de design
(superfície da API, testes de segurança e de concorrência) permanece somente em inglês — consulte o
[índice completo](README.md). Consulte as convenções da plataforma de tradução para as regras
desta implementação.

Comece aqui:

| Documento | O que cobre |
|---|---|
| [Veja um trace em 60 segundos](pt-BR/sessenta-segundos.md) | Um serviço minúsculo, um teste Vitest, sete passos até um trace real, com saída real |
| [Guia de instalação](pt-BR/guia-de-instalacao.md) | Dependências, cada caminho de integração, configuração da saída de trace |
| [Escolhendo uma integração](pt-BR/escolhendo-uma-integracao.md) | De qual pacote você precisa, como diagrama de decisão |
| [Guia de configuração](pt-BR/guia-de-configuracao.md) | Níveis de tracing, config do Vitest, opções de renderização |
| [Guia de decoradores](pt-BR/guia-de-decoradores.md) | `@traced`, `@narrated`, `@onError`, `@notTraced` |

Aprofundando:

| Documento | O que cobre |
|---|---|
| [Privacidade e ocultação](pt-BR/privacidade-e-ocultacao.md) | O contrato de ocultação linha por linha, verificado contra o código |
| [O que commitar](pt-BR/o-que-commitar.md) | Quais arquivos gerados são saída de execução e quais (se algum) são baselines revisadas |
| [Solução de problemas](pt-BR/solucao-de-problemas.md) | Sintoma → causa → solução para os modos de falha que as pessoas realmente encontram |
| [Habilidades de agente](pt-BR/habilidades-de-agente.md) | `add-narrative-tracing`, `narrativetrace-doctor` (uma habilidade de agente fina e somente leitura sobre `npx @narrativetrace/cli doctor`), `add-narrativetrace-clarity`, `narrativetrace-feedback`, `narrativetrace-verify`, `narrativetrace-debug` e `narrativetrace-explain` |
| [Use o NarrativeTrace com seu agente](pt-BR/use-narrativetrace-com-seu-agente.md) | Cursor, Replit, Antigravity, GitHub Copilot e Claude Code: como cada um obtém as habilidades, o arquivo apontador que o `init` escreve para ele e a evidência por trás de cada linha |
| [Guia de clareza](pt-BR/guia-de-clareza.md) | Modelo de pontuação, componentes de NLP, scanner estático |
| [Guia de integração de frameworks](pt-BR/guia-de-integracao-de-frameworks.md) | Express, Hono, navegador, AsyncLocalStorage |
| [Guia de exemplos](pt-BR/guia-de-exemplos.md) | O lançador `pnpm demo` e os exemplos executáveis |
| [Guia de funcionalidades](pt-BR/guia-de-funcionalidades.md) | Catálogo canônico do que esta implementação distribui, com tier e status |

Receitas, uma página por problema, com a saída real de uma execução:

| Documento | O que cobre |
|---|---|
| [Adicione logs a este serviço](pt-BR/receitas/adicione-logs-a-este-servico.md) | Um checkout sem nenhuma instrução de log: você envolve seus colaboradores uma vez e cada chamada aparece no logger do projeto |
| [Ajude-me a depurar e corrigir este bug](pt-BR/receitas/ajude-me-a-depurar-e-corrigir-este-bug.md) | Um cartão recusado deixa o estoque reservado: encontrar o `release` que falta, corrigi-lo e fixá-lo |
| [Por que este teste falhou](pt-BR/receitas/por-que-este-teste-falhou.md) | Um teste vermelho lido span a span contra a sua asserção |
| [Revise um fluxo complexo antes de alterá-lo](pt-BR/receitas/revise-um-fluxo-complexo-antes-de-altera-lo.md) | Uma execução em `detail` e em `summary`, o log ao lado do `.nt` sem valores |
| [Revise uma refatoração: o comportamento mudou?](pt-BR/receitas/revise-uma-refatoracao-o-comportamento-mudou.md) | Os testes continuam verdes e o diff de aprovação nomeia a chamada removida |

Estas traduções estão PENDENTES DE REVISÃO por um falante nativo — cada arquivo registra seu
status de revisão no cabeçalho da linha 1 (`pnpm run translation-status` imprime a matriz completa).
