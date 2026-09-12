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
| [Guia de clareza](pt-BR/guia-de-clareza.md) | Modelo de pontuação, componentes de NLP, scanner estático |
| [Guia de integração de frameworks](pt-BR/guia-de-integracao-de-frameworks.md) | Express, Hono, navegador, AsyncLocalStorage |
| [Guia de exemplos](pt-BR/guia-de-exemplos.md) | O lançador `pnpm demo` e os exemplos executáveis |
| [Guia de funcionalidades](pt-BR/guia-de-funcionalidades.md) | Catálogo canônico do que esta implementação distribui, com tier e status |

Estas traduções estão PENDENTES DE REVISÃO por um falante nativo — cada arquivo registra seu
status de revisão no cabeçalho da linha 1 (`pnpm run translation-status` imprime a matriz completa).
