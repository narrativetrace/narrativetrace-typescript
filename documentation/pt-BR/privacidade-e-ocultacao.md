<!-- source: documentation/privacy-and-redaction.md blob 324f03029bab | translated: 2026-09-11 | reviewed: - -->
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
| `traceObject()` (proxy) — o caminho de captura sobre o qual `express`, `hono`, `angular` e `react` são construídos | Não |
| `AutoProxyModule` (`@narrativetrace/nestjs`) — seu próprio caminho de captura separado, que muta o prototype, *não* construído sobre `traceObject()` (veja a nota abaixo) | Não |
| Fixture do Vitest (`createNarrativeTest`/`narrativeTest`) | Não |
| Uma chamada customizada a `renderValue()`/`renderStructured()` que seu próprio código faz diretamente | Sim — apenas passando `{ redactionPolicy: RedactionPolicy.DISABLED }` explicitamente, e mesmo assim `@notTraced`/`static notTraced` continuam ocultando (veja abaixo) |
| `@notTraced` / `static notTraced` | Não aplicável — é a própria coisa que faz a ocultação, e sempre vence, em toda superfície, inclusive em um renderer com `RedactionPolicy.DISABLED` |

Verificado contra o código, não inferido: `traceObject()` é o caminho de
captura sobre o qual `express`, `hono`, `angular` e `react` são
construídos — nunca repassa uma opção `redactionPolicy` vinda de quem
chama. A fixture do Vitest (`createNarrativeTest`/`narrativeTest`) aparece
como sua própria linha acima porque é um ponto de entrada distinto — um
provedor de `NarrativeContext`, não um caminho de captura por si só —
então sua garantia de ocultação é a de qualquer mecanismo de captura com o
qual o teste envolve por dentro (normalmente `traceObject()`, às vezes
`AutoProxyModule` em um teste NestJS), nunca um terceiro comportamento
próprio. **O `AutoProxyModule` do `@narrativetrace/nestjs` é um caminho de
captura separado, feito à mão (`wrapPrototypeMethods`), não um wrapper
sobre `traceObject()`** — ele muta diretamente o prototype de cada
provider auto-envolto em vez de proxyar uma instância, porque o NestJS
precisa que toda instância que seu container de DI cria seja rastreada,
não um único objeto envolto à mão. Os dois caminhos compartilham o
armazenamento do decorator `@notTraced` (movido para
`@narrativetrace/core` exatamente por esse motivo), mas não os *nomes* dos
seus parâmetros capturados: `wrapPrototypeMethods` não tem metadados de
decorator/reflexão para recuperar o nome real de um parâmetro a partir de
um método de prototype bruto, então ali todo parâmetro é renderizado como
`arg0`, `arg1`, …, um nome que a lista de negação por NOME, sempre ativa,
nunca consegue igualar. **Essa é uma limitação estrutural, não um bug a
ser corrigido depois:** o JavaScript não expõe nomes de parâmetros em
tempo de execução sem metadados no estilo `@traced`, que o caminho de
auto-encapsulamento não tem. `@notTraced(i)` (ocultação por índice) e a
ocultação por forma de valor (um JWT, um número de cartão válido pelo
algoritmo de Luhn, uma string `Set-Cookie`, ou um dígito verificador ou
regra estrutural de identidade nacional — independentes do nome) ainda
protegem um parâmetro auto-envolto do NestJS; o eixo baseado em nome, por
si só, não consegue. A opção `redactionPolicy` existe apenas nas funções
de renderização de baixo nível (`renderValue`/`renderStructured` em
`@narrativetrace/core`), e nenhuma das integrações distribuídas expõe uma
forma de sobrescrevê-la. A única forma de alcançar
`RedactionPolicy.DISABLED` é código de aplicação chamando essas funções
diretamente — um ato deliberado e revisável no seu próprio código-fonte,
nunca uma flag de configuração ou variável de ambiente que um deploy possa
alternar.

## O que oculta, e o que tem prioridade sobre o quê

Três mecanismos independentes se aplicam a todo valor capturado/renderizado:

1. **`@notTraced(i)`** em um parâmetro de método, por índice — sob
   `traceObject()`, quem chama (seu construtor do mapa de valores)
   substitui o marcador `[REDACTED]` antes que um template de
   narração/erro seja resolvido, de modo que o resolvedor de template
   nunca chega a ter o segredo nessa superfície. Sob o `AutoProxyModule`
   do NestJS não há nenhuma superfície de narração/template para proteger
   (essa integração não lê `@narrated`/`@onError`), mas o mesmo decorator
   continua ocultando o próprio argumento capturado, lendo o mesmo
   armazenamento que `traceObject()` lê (veja a nota de superfície por
   superfície acima).
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
   acentos contra nomes de campos **e de parâmetros** (`password`,
   `secret`, `token`, `apikey`, `cvv`, `ssn`, `authorization`,
   `credential`, `cardnumber`, `jwt`, `cookie`, `sessionid`,
   `accountnumber`, `routingnumber`, `passphrase`, `bearer`, `accesskey`,
   `socialsecurity`, `taxid`, `pan`, `iban`, e suas grafias em
   `snake_case`), mais uma segunda verificação independente sobre a
   *forma* do próprio valor — um JWT (`eyJ…`), um número de cartão válido
   pelo algoritmo de Luhn, uma string com a forma de `Set-Cookie`, ou um
   dígito verificador ou regra estrutural de identidade nacional (RUT
   chileno, CPF/CNPJ brasileiro, DNI/NIE espanhol, NIR francês, carteira
   de identidade de residente chinesa, ou um número do Social Security
   dos EUA com hífens `AAA-GG-SSSS` — a única exceção sem dígito
   verificador, em que as faixas de área/grupo/série nunca emitidas pela
   SSA fazem esse papel) — de modo que um valor sem nome (um item de
   lista, um valor de map) ou um bearer token sob um nome não reconhecido
   ainda assim é capturado.
   **A metade deste eixo baseada em parâmetro só se aplica sob
   `traceObject()`** — um parâmetro simplesmente *nomeado* como um
   segredo (`paymentToken`, `password`) é ocultado sem nenhum decorator,
   exatamente como um nome de campo é. Sob o `AutoProxyModule` do NestJS
   todo parâmetro é capturado como `arg0`, `arg1`, … (veja a nota de
   superfície por superfície acima), então essa metade do eixo não
   consegue alcançá-lo — ali só `@notTraced` e a verificação de forma de
   valor conseguem. O vocabulário padrão é **multilíngue e sempre ativo**
   (o padrão da família, compartilhado com os demais runtimes do
   NarrativeTrace): o espanhol (`contraseña`, `tarjeta`, `cédula`,
   `claveAcceso`, `rut`, `cuit`, `dni`), o português (`senha`, `cartão`,
   `cpf`, `cnpj`), o francês (`motDePasse`, `carteBancaire`, `nir`), o
   alemão (`passwort`, `kennwort`) e o chinês (`密码`, `身份证`, mais o
   pinyin `mima`/`shenfenzheng`) ficam ao lado dos padrões em inglês, sem
   nenhum locale a selecionar — as grafias com e sem acento se dobram em
   um único padrão. `"companyName"`/`"panelId"` não combinam com `pan` —
   os padrões mais propensos a falsos positivos (`pan`, `iban`, `otp`,
   `rut`, `cuit`, `dni`, `senha`, `cpf`, `cnpj`, `nir`, `mima`) combinam em
   limites de token de identificador, não em substring pura, então
   `truthValue`, `circuitBreaker`, `chosenHash`, `semiMajorAxis` e
   `carbonFootprintId` permanecem visíveis enquanto `rutCliente`,
   `senhaUsuario` e `otpCode` ficam ocultos.

**Um `toString()` personalizado só é confiado para uma folha** — um objeto
sem nenhum campo próprio, de modo que não há mais nada que a introspecção de
campos poderia mostrar em vez disso (invariante da família, 2026-09-11; o
design deste port já coincidia com o do .NET). No momento em que um objeto
tem ao menos um campo próprio, ele é *sempre* introspectado campo a campo,
não importa o que seu `toString()` teria impresso — não apenas quando esse
campo é, por si só, anotado ou pertence à lista de negação. Isso é mais
restritivo do que parece necessário, e é deliberado: a regra anterior, mais
estreita ("confiar no `toString()` a menos que um dos campos *próprios deste
objeto* seja um alvo de ocultação"), deixava passar a forma que uma correção
de segurança de 2026-09-11 fecha — um `toString()` que interpola o texto
cuidadosamente escrito de um objeto **aninhado** (`Order.toString()`
imprimindo `this.customer`, que por sua vez é um `Customer` que oculta um
campo) nunca coloca o nome ou a anotação do campo ocultado no próprio
`Order`, então a checagem de campo próprio não encontrava nada para pegar e
o segredo aninhado era impresso por completo. Confiar no `toString()` apenas
para folhas fecha essa classe inteira de brecha de uma vez, em qualquer
profundidade de aninhamento, em vez de perseguir cada nova forma de
interpolação como um bug à parte. A mesma regra vale para uma **chave** de
`Map`: uma chave que é ela própria um objeto passa pela mesma renderização
consciente de ocultação que um valor, nunca por um `toString()` bruto e
incondicional.

`narrativeSummary()` é texto cuidadosamente escrito pelo autor
especificamente para o trace, e continua a prevalecer tanto sobre a
confiança no `toString()` quanto sobre a introspecção de campos — mas não
está isento da varredura de forma do valor (uma forma JWT/PAN/SSN/
identificação-nacional/`Set-Cookie` é ocultada mesmo dentro de texto
cuidadosamente escrito), e um `narrativeSummary()` que lança exceção não
recai mais sobre `toString()`/introspecção de campos: o valor inteiro
degrada para o marcador de erro tipado em vez disso (veja abaixo), porque
essa recaída era exatamente como um summary escrito para ocultar um segredo
poderia reintroduzi-lo através dos campos comuns da classe no momento em
que o próprio summary falhasse.

A resolução de template também não tem um atalho para contornar nada disso:
ela foi auditada para garantir que nunca recorre ao `toString()` bruto de um
valor quando a renderização segura tiver omitido o marcador por um motivo
não relacionado (truncamento no limite de campo/profundidade) — todo valor
de placeholder não escalar passa pelo mesmo renderer que oculta campos
usado pelo resto do trace, incondicionalmente.

## Erros durante a renderização

Um membro que esta biblioteca invoca ao renderizar um valor —
`narrativeSummary()`, o `toString()` de uma folha, ou um getter de campo —
pode lançar uma exceção, ou (somente `toString()`) retornar `null`. Uma
exceção degrada para o marcador de erro tipado só naquela parte,
`<error: NomeDoConstrutor>` (ex.: `<error: TypeError>`; um valor lançado que
não é um `Error` mostra seu `typeof`, ex.: `<error: string>`) — **nunca o
`message` da exceção**, que pode carregar o valor exato que o membro se
recusava a renderizar. Um getter de campo que lança exceção degrada só
aquele campo; os campos irmãos continuam sendo renderizados normalmente. Um
`toString()` que retorna `null` (sem lançar exceção) mostra em vez disso o
marcador simples `<NomeDoConstrutor>`, já que nada falhou.

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
