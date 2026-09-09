<!-- source: documentation/troubleshooting.md blob 90ae6487249f | translated: 2026-09-07 | reviewed: - -->
# Solução de problemas

[English](../troubleshooting.md) | [Español](../es/solucion-de-problemas.md) | **Português** | [简体中文](../zh-CN/故障排查.md)

Sintoma → causa → correção, para os modos de falha que as pessoas
realmente encontram. Algumas entradas trazem a explicação completa; outras
apontam para o guia que já traz isso com mais detalhes, em vez de repetir
aqui — um único lugar por fato.

## Parâmetros aparecem como `arg0`, `arg1`

**Causa:** o JavaScript não retém os nomes dos parâmetros em tempo de
execução — não existe uma flag de compilador que os recupere, ao contrário
de uma flag `-parameters` de uma JVM. Sem ajuda, `traceObject()` recorre a
nomes posicionais.

**Correção:** forneça os nomes de uma das duas formas —

```ts
class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(customerId: string, productId: string, quantity: number) { /* ... */ }
}
```

ou, sem decoradores:

```ts
traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });
```

Um bundle de produção minificado remove os nomes da mesma forma, então isso
não é uma preocupação restrita ao desenvolvimento — veja [Guia de
Decoradores § `@traced`](guia-de-decoradores.md#traced).

## Nenhum arquivo de trace é gravado

**Causa:** quase sempre, o teste usou a fixture sem gravação de arquivos
(`narrativeTest`) em vez da que grava arquivos (`createNarrativeTest`) —
esta implementação tem duas fixtures de Vitest de propósito, uma só para asserções e
outra para artefatos. Menos comumente: a árvore de trace tinha zero raízes
(nada foi chamado através do objeto traced), e `writeTraceOutput` não grava
nada para um trace vazio por design, então uma suíte que não capturou
nenhum span não deixa diretórios para trás.

**Correção:** use `createNarrativeTest` (veja [Primeiros 10
Minutos](primeiros-10-minutos.md#3-adicione-um-teste-de-vitest)), e
verifique se a chamada testada realmente passou pelo wrapper traced — uma
chamada feita na instância não encapsulada, em vez do objeto que
`traceObject()` retornou, não registra nada.

## Um getter ou campo nunca aparece no trace

**Causa:** `traceObject()` encapsula métodos, não propriedades arbitrárias.
Getters e propriedades que não são funções passam pelo `Proxy` sem
encapsulamento — ler `traced.total` chama o getter real diretamente e nada
é capturado. Isso é proposital: o NarrativeTrace narra *chamadas*, e a
leitura de um getter parece idêntica, do ponto de vista de quem chama, a
uma leitura simples de propriedade.

**Correção:** se o valor importa para o trace, retorne-o a partir de um
método traced, ou nomeie a propriedade em um template
`@narrated`/`@onError` (`{order.total}`) — a resolução de caminho de
propriedade *invoca* o getter, uma vez, no momento da renderização. Veja o
contrato de pureza no [Guia de
Decoradores](guia-de-decoradores.md#o-contrato-de-pureza--efeitos-colaterais-durante-o-trace).

## Os decoradores `@traced`/`@notTraced` falham ao aplicar ou falham ao compilar

**Causa:** os decoradores aceitam ambos os dialetos — os decoradores TC39
padrão (o default do TypeScript 5) e o dialeto legado
`experimentalDecorators` (NestJS, Angular) — detectados em tempo de
execução pelo formato da chamada. Uma falha significa, portanto, que o
ambiente não compila decoradores de forma alguma: TypeScript anterior ao
5.0 sem `experimentalDecorators`, uma transformação que deixa a sintaxe
`@` intocada, ou JavaScript puro. Nesse caso o decorador lança um
`TypeError` nomeando esta correção, em vez de silenciosamente não
registrar nada.

**Correção:** habilite a compilação de decoradores (o TypeScript 5.0+
compila o dialeto padrão sem nenhuma flag; `experimentalDecorators: true`
também funciona), ou dispense os decoradores e use a forma de configuração
no `traceObject()` — ela expressa tudo o que os decoradores expressam.
Veja o [Guia de Decoradores](guia-de-decoradores.md).

## A pontuação de clareza parece errada

**Causa:** normalmente é um nome genérico que a análise de NLP sinaliza —
`get`, `set`, `process`, `handle`, `data`, `info`, `temp` e nomes similares
pontuam baixo independentemente do contexto.

**Correção:** revise o array `issues` no `.clarity-json` do cenário (ou o
`clarity-report.md` da suíte, uma vez que o `ClaritySuiteReporter` esteja
conectado) e substitua o nome sinalizado por um específico do domínio
(`getData()` → `fetchOrderHistory()`). Veja o [Guia de
Clareza](guia-de-clareza.md) para o modelo de pontuação completo —
renomear `placeOrder` para `process` em [Primeiros 10 Minutos §
6](primeiros-10-minutos.md#6-renomeie-placeorder-para-process-e-veja-a-clareza-cair)
reproduz exatamente essa queda.

## O trace assíncrono está ausente, ou uma tarefa em segundo plano nunca aparece

**Causa:** o `AsyncNarrativeContext` segue o span ativo através de um
`await`, mas uma tarefa que é iniciada e nunca aguardada (`setTimeout`,
uma promise desacoplada, um job enfileirado) não o herda — não há nada
para seguir, porque a chamada que a iniciou já retornou.

**Correção:** encapsule o trabalho desacoplado com
`ForkJoinGroup`/`FireAndForgetGroup`, ou enxerte-o manualmente com
`context.snapshot()` + `snapshot.wrap(fn)`. Veja [Escolhendo uma
Integração § Ressalvas por
caminho](escolhendo-uma-integracao.md#ressalvas-por-caminho).

## `captureTrace()` retorna uma árvore vazia ou parcial de outra tarefa assíncrona

**Causa:** a captura tem escopo na instância do contexto, não em uma
thread como em uma implementação para JVM — mas um `SyncNarrativeContext` (navegador)
não tem nenhuma propagação implícita, então duas chamadas sobrepostas e
não aguardadas no mesmo contexto corrompem os spans uma da outra, em vez
de simplesmente perder um deles.

**Correção:** no Node, use `AsyncNarrativeContext`. Em um navegador, ou
para trabalho sobreposto em qualquer lugar, use um grupo explícito de
fork/fire-and-forget por tarefa concorrente, em vez de compartilhar um
único contexto entre chamadas não aguardadas.

## Uma captura imprimiu "NarrativeTrace dropped N events"

**Causa:** não é uma falha — o anel de eventos (`BufferedEventConsumer`) é
um buffer de tamanho fixo, `8.192` eventos por padrão em
`createNarrativeTest`, e um teste que traceia mais chamadas do que ele
comporta descarta os eventos mais antigos em vez de crescer sem limite ou
bloquear quem chamou. A mensagem exata:

```text
⚠️ NarrativeTrace dropped 16 events: the capture buffer (4) overflowed, so this narrative is incomplete. Raise it with createNarrativeTest({ bufferCapacity: 32 }).
```

**Correção:** aumente `bufferCapacity` para o valor que a mensagem indica,
ou reduza o que o teste traceia. Veja [Guia de Configuração §
8](guia-de-configuracao.md#8-buffer-do-pipeline-de-eventos-bufferedeventconsumer)
para a tabela de capacidade-vs-latência e como dimensioná-la para um
contexto de vida mais longa.

## `@notTraced` oculta o parâmetro, mas um campo aninhado ainda aparece

**Causa:** a ocultação por índice de parâmetro (`@notTraced(i)`) e a
ocultação em nível de campo (`static notTraced = [...]`) são duas
declarações diferentes. A ocultação por índice apaga o argumento inteiro;
um campo dentro de um argumento *não oculto* é renderizado campo a campo,
a menos que esse campo em si esteja na lista de bloqueio por nome ou
declarado.

**Correção:** adicione o campo à própria lista `static notTraced` da
classe:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}
```

Contrato completo, incluindo o que um template de narração faz com um
caminho oculto: [Privacidade e Ocultação](privacidade-e-ocultacao.md).

## Como o NarrativeTrace se comporta ao lado de outro proxy ou interceptor

Não é um relato de bug — é uma questão de design que surge sempre que um
serviço já está encapsulado por outra coisa (um container de DI, outro
`Proxy`, uma biblioteca de contrato). O NarrativeTrace narra apenas
travessias de fronteira de negócio, e qual wrapper fica "por fora" nunca
muda o resultado de negócio ou a exceção que chega até a narração — veja o
[FAQ do
README](../../LEIAME.md#como-o-narrativetrace-interage-com-outras-bibliotecas-que-envolvem-métodos-aop-proxies-bibliotecas-de-contrato)
para o contrato de coexistência completo.
