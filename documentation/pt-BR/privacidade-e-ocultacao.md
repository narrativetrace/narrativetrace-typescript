<!-- source: documentation/privacy-and-redaction.md blob 33ca5ffa478b | translated: 2026-09-07 | reviewed: - -->
# Privacidade e ocultação

[English](../privacy-and-redaction.md) | [Español](../es/privacidad-y-ocultacion.md) | **Português** | [简体中文](../zh-CN/隐私与脱敏.md)

Esta biblioteca roda dentro do seu processo e escreve arquivos que o seu
time vai compartilhar — artefatos de teste, saída de CI, linhas de log de
produção. Esta página é a versão linha a linha desse contrato: o que é
ocultado, onde alcança e onde não alcança, e o que o NarrativeTrace
garante versus o que ele nem chega a reivindicar. Verificado linha a linha contra o
código em 2026-09-02, não inferido a partir da documentação.

## Ocultação, superfície por superfície

| Superfície | Pode desativar a ocultação embutida? |
|---|---|
| `traceObject()` (proxy) — o único caminho de captura sobre o qual toda integração abaixo é construída | Não |
| Fixture do Vitest (`createNarrativeTest`/`narrativeTest`) | Não |
| Middleware Express / Hono / NestJS | Não |
| Integrações Angular / React | Não |
| Uma chamada customizada a `renderValue()`/`renderStructured()` que seu próprio código faz diretamente | Sim — apenas passando `{ redactionPolicy: RedactionPolicy.DISABLED }` explicitamente, e mesmo assim `@notTraced`/`static notTraced` continuam ocultando (veja abaixo) |
| `@notTraced` / `static notTraced` | Não aplicável — é a própria coisa que faz a ocultação, e sempre vence, em toda superfície, inclusive em um renderer com `RedactionPolicy.DISABLED` |

Verificado contra o código, não inferido: `traceObject()` — o único
caminho de captura sobre o qual toda integração distribuída (`express`,
`hono`, `nestjs`, `angular`, `react`, `vitest`, …) é construída — nunca
repassa uma opção `redactionPolicy` vinda de quem chama. A opção
`redactionPolicy` existe apenas nas funções de renderização de baixo
nível (`renderValue`/`renderStructured` em `@narrativetrace/core`), e
nenhuma das integrações distribuídas expõe uma forma de sobrescrevê-la. A
única forma de alcançar `RedactionPolicy.DISABLED` é código de aplicação
chamando essas funções diretamente — um ato deliberado e revisável no
seu próprio código-fonte, nunca uma flag de configuração ou variável de
ambiente que um deploy possa alternar.

## O que oculta, e o que tem prioridade sobre o quê

Três mecanismos independentes se aplicam a todo valor capturado/renderizado:

1. **`@notTraced(i)`** em um parâmetro de método — quem chama (o
   construtor do mapa de valores do `traceObject`) substitui o marcador
   `[REDACTED]` antes que um template de narração/erro seja resolvido, de
   modo que o resolvedor de template nunca chega a ter o segredo nessa
   superfície.
2. **`static notTraced = [...]`** em uma classe — ocultação por nome de
   campo para introspecção de objetos e para caminhos de template
   `{param.property}`. Essa verificação é independente de qual
   `RedactionPolicy` está ativa: a resposta para "esse membro foi
   explicitamente anotado" é calculada a partir da própria classe, e
   depois combinada como `annotated || nameMatchesDenyList`, de modo que
   uma anotação explícita oculta mesmo sob uma política que tenha todo
   padrão de nome e toda verificação de forma de valor desligados.
3. **A lista de negação baseada em nome** (`RedactionPolicy.DEFAULT`) —
   uma comparação de substring sem diferenciar maiúsculas/minúsculas nem
   acentos contra nomes de campos (`password`, `secret`, `token`,
   `apikey`, `cvv`, `ssn`, `authorization`, `credential`, `cardnumber`,
   `jwt`, `cookie`, `sessionid`, `accountnumber`, `routingnumber`, `pan`,
   `iban`, e suas grafias em `snake_case`), mais uma segunda verificação
   independente sobre a *forma* do próprio valor — um JWT (`eyJ…`), um
   número de cartão válido pelo algoritmo de Luhn, ou uma string com a
   forma de `Set-Cookie` — de modo que um valor sem nome (um item de
   lista, um valor de map) ou um bearer token sob um nome não reconhecido
   ainda assim é capturado. O vocabulário padrão é **multilíngue e sempre
   ativo** (o padrão da família, compartilhado com os demais runtimes do
   NarrativeTrace): o espanhol (`contraseña`, `tarjeta`, `cédula`,
   `claveAcceso`, `rut`, `cuit`, `dni`), o português (`senha`, `cartão`,
   `cpf`, `cnpj`), o francês (`motDePasse`, `carteBancaire`, `nir`) e o
   chinês (`密码`, `身份证`, mais o pinyin `mima`/`shenfenzheng`) ficam ao
   lado dos padrões em inglês, sem nenhum locale a selecionar — as
   grafias com e sem acento se dobram em um único padrão.
   `"companyName"`/`"panelId"` não combinam com `pan` — os dez padrões
   mais propensos a falsos positivos (`pan`, `iban`, `rut`, `cuit`,
   `dni`, `senha`, `cpf`, `cnpj`, `nir`, `mima`) combinam em limites de
   token de identificador, não em substring pura, então `truthValue`,
   `circuitBreaker`, `chosenHash` e `semiMajorAxis` permanecem visíveis
   enquanto `rutCliente` e `senhaUsuario` ficam ocultos.

Um **`toString()` cuidadosamente escrito** normalmente é confiado como
está — mas uma classe que declara qualquer campo `static notTraced` é
introspectada campo a campo em vez disso, então a anotação é respeitada
em vez do que aquele `toString()` teria impresso. A resolução de template
também não tem um atalho para contornar isso: ela foi auditada para
garantir que nunca recorre ao `toString()` bruto de um valor quando a
renderização segura tiver omitido o marcador por um motivo não
relacionado (truncamento no limite de campo/profundidade) — todo valor
de placeholder não escalar passa pelo mesmo renderer que oculta campos
usado pelo resto do trace, incondicionalmente.

A ocultação também **sobrevive ao aninhamento** — um membro ocultado
dentro de um array, um `Set`, um `Map`, um objeto simples, várias dessas
estruturas empilhadas, e um ciclo autorreferencial são todos fixados por
teste (`redacted-value-containment.test.ts`). E ela **prevalece sobre um
template de narração que o nomeia**: `{param.property}` em
`@narrated`/`@onError` resolve um caminho até um membro ocultado como
`[REDACTED]`, nunca o valor literal — fixado de ponta a ponta através do
caminho de captura real, incluindo especificamente a forma "placeholder
do objeto inteiro, dump de campo padrão" (sem nenhum `toString()`
customizado no objeto).

Detalhes completos e exemplos resolvidos:
[Guia de decoradores § `@notTraced`](guia-de-decoradores.md#nottraced).

## Garantias

- **Falhas de tracing são isoladas da execução hospedeira.** A captura é
  best-effort por construção: qualquer falha ao resolver nomes,
  renderizar parâmetros ou entrar em um span degrada para uma chamada não
  rastreada, em vez de bloquear ou falhar o método de negócio (o próprio
  "contrato sem veneno" do `trace-object.ts`). Um `toString()`
  customizado que lança exceção, um getter que lança exceção e é
  referenciado em um template, ou um buffer cheio nunca mudam o que seu
  método retorna ou lança.
- **Toda integração distribuída respeita a ocultação.** Veja a tabela
  acima — nenhuma integração expõe uma forma de contorná-la.
- **O caminho de análise em buffer pode descartar eventos, mas sempre
  reporta a perda.** Ele nunca bloqueia quem chama e nunca cresce além
  do seu limite (um anel de tamanho fixo, `8.192` eventos por padrão na
  fixture do Vitest, maior em um processo de longa duração — veja
  [Guia de configuração § 8](guia-de-configuracao.md#8-buffer-do-pipeline-de-eventos-bufferedeventconsumer)).
  Uma captura que perdeu eventos imprime a contagem e para quanto
  aumentar a capacidade, em seu próprio rodapé.

## Não garantias

- **Nenhuma alegação de "overhead zero".** O tracing faz trabalho, e
  trabalho custa algo — veja a [seção de desempenho do README](../../LEIAME.md#desempenho).
- **Sem tracing de campos privados, mas também sem exigência de
  interface.** Campos de classe `#private` não podem ser interceptados
  por um `Proxy` de jeito nenhum — uma limitação da linguagem
  JavaScript. Diferente de um proxy dinâmico da JVM, não existe
  interface para implementar antes; todo método alcançável por meio de
  lookup de propriedade — declarado no próprio objeto ou herdado de sua
  cadeia de protótipos — é visível para `traceObject()`.
- **Ainda sem artefato estrutural, livre de valores.** Alguns outros
  implementações do NarrativeTrace também distribuem um artefato no estilo `.nt`
  sem nenhum valor de runtime, para entregar a uma ferramenta de IA com
  superfície zero para prompt injection por construção. Esta implementação ainda
  não construiu isso — veja
  [O que commitar](o-que-commitar.md#por-que-ainda-não-há-uma-linha-approvednt-aqui).
  Até que exista, todo artefato gerado nesta implementação carrega valores
  capturados reais e deve ser tratado de acordo.
- **Nenhum caminho "zero código", de "envolver um app que você não
  escreveu".** Não existe um equivalente ao Java agent nesta plataforma,
  então o escopo é sempre por call site explícito ou anotação de classe
  — veja
  [Escolhendo uma integração § Limites da plataforma](escolhendo-uma-integracao.md#limites-da-plataforma).

## O que esta página não cobre

O que acontece quando o NarrativeTrace se empilha com outra biblioteca
que também envolve o mesmo objeto — um container de DI, outro `Proxy`,
uma biblioteca de contrato. Em resumo: o NarrativeTrace narra apenas
travessias de fronteira de negócio, e qual wrapper fica "por fora" nunca
muda os valores ocultados, o resultado de negócio, ou a exceção que chega
até a narrativa — veja o
[FAQ do README](../../LEIAME.md#como-o-narrativetrace-interage-com-outras-bibliotecas-que-envolvem-métodos-aop-proxies-bibliotecas-de-contrato)
para o contrato de coexistência completo.
