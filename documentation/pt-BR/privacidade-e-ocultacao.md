<!-- source: documentation/privacy-and-redaction.md blob 29b4efaedbb0 | translated: 2026-09-13 | reviewed: - -->
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
| Trace estrutural `.nt` (`renderStructural`/`renderStructuralDocument`) | Não aplicável — não carrega nenhum valor para ocultar, antes de tudo |

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
   `traceObject()`** *(since 0.1.3, unreleased)* — um parâmetro simplesmente *nomeado* como um
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

**Um `toString()` personalizado só é confiado para um intrínseco da
plataforma do realm** — `Date`, `URL`, `RegExp`, um `BigInt` encaixotado ou
um typed array (decisão do time, 2026-09-12, a exceção da "folha de
confiança"). *(since 0.1.3, unreleased)* Qualquer outro objeto — uma classe
comum, um valor em forma de registro, uma "folha" sem campo próprio visível
— é *sempre* introspectado campo a campo, não importa o que seu `toString()`
teria impresso. A checagem de identidade é
`Object.getPrototypeOf(valor) === Date.prototype` (e o mesmo para cada um
dos outros intrínsecos acima) — **nunca** `constructor.name` ou qualquer
outra checagem baseada em nome: uma classe do usuário pode se autodenominar
`Date` livremente sem nunca tocar no `Date.prototype` real, e as instâncias
de uma subclasse carregam o protótipo da *subclasse* um nível acima, não o
do intrínseco base, então nem um impostor com o mesmo nome nem uma subclasse
de um tipo de plataforma são confiados apenas por associação. `Error` é
deliberadamente excluído dessa lista mesmo sendo também um intrínseco do
realm: diferente do timestamp opaco de `Date` ou do buffer numérico de um
typed array, `Error.prototype.toString()` interpola `message` — texto livre
que quem chama fornece na construção (`new Error(usuario.password)`) —
exatamente a forma que um campo na lista de negação existe para pegar,
então um valor `Error` é introspectado campo a campo como qualquer outro
objeto. *(since 0.1.3, unreleased)*

**`Date` é confiado da mesma forma, mas renderiza via `toISOString()`, nunca
`toString()`** *(since 0.1.3, unreleased)*: `Date.prototype.toString()`
embute o locale e o NOME do fuso horário do host na string (ex.:
`"Tue Jan 01 2024 01:00:00 GMT+0100 (Central European Standard Time)"`),
então o mesmo instante renderiza como duas strings diferentes e não
reproduzíveis em duas máquinas — ou na mesma máquina com um `TZ` diferente.
`toISOString()` é UTC e não carrega nenhum dos dois eixos: um instante, uma
string, em qualquer lugar, que é exatamente o que um artefato de trace
pensado para ser comparado ou aprovado entre máquinas exige. Um `Date`
inválido (`new Date(NaN)`) continua renderizando como o literal
`Invalid Date` — `toISOString()` lança exceção para ele, então isso é
checado e retornado diretamente, nunca passando pelo marcador de erro
tipado abaixo.

Isso estreita uma regra intermediária de vida curta de 2026-09-11 ("confiar
no `toString()` para qualquer folha — qualquer objeto sem nenhum campo
próprio enumerável") que este port publicou por menos de um dia: nesta
plataforma, "sem campo próprio enumerável" nunca foi, de fato, prova de
"nada a esconder" como parece — um campo `#private` verdadeiro, uma
variável de closure ou um `WeakMap` em nível de módulo indexado por `this`
são todos invisíveis para `Object.keys`, mas livremente legíveis de dentro
do próprio `toString()` da classe, então um impostor com o mesmo nome ou a
mesma forma de um tipo confiável ainda podia vazar por ali. Restringir a
confiança ao pequeno conjunto fechado de intrínsecos que esta biblioteca já
traz consigo — nunca uma classe de usuário arbitrária, folha ou não — fecha
essa brecha de vez. A própria regra de 2026-09-11 fechou antes uma ainda
mais estreita: a regra original ("confiar no `toString()` a menos que um
dos campos *próprios deste objeto* seja um alvo de ocultação") deixava
passar um `toString()` que interpola o texto cuidadosamente escrito de um
objeto **aninhado** (`Order.toString()` imprimindo `this.customer`, que por
sua vez é um `Customer` que oculta um campo) — o nome ou a anotação do
campo ocultado nunca aparecia no próprio `Order`, então a checagem de campo
próprio não encontrava nada para pegar e o segredo aninhado era impresso
por completo. A mesma regra vale para uma **chave** de `Map`: uma chave que
é ela própria um objeto passa pela mesma renderização consciente de
ocultação que um valor, nunca por um `toString()` bruto e incondicional.
*(since 0.1.3, unreleased)*

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
pode lançar uma exceção, ou (somente `toString()`) retornar `null`.
*(since 0.1.3, unreleased)* Uma
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
- **O artefato estrutural `.nt` não carrega nenhum valor em tempo de
  execução.** *(since 0.1.3, unreleased)* Apenas nomes, hierarquia de chamadas e tipos de resultado —
  zero superfície de injeção de prompt, e isso é uma propriedade do
  renderer, não uma política que alguém pudesse esquecer de aplicar. Seu
  cabeçalho `scenario:` está coberto por isso: uma invocação de uma linha de
  `createNarrativeTest(...).each(cases)` é titulada `<nome do teste>
  #<índice>`, nunca o rótulo em que um template interpolou seus argumentos
  (veja [Structural Trace Format](../structural-trace-format.md), ainda não
  traduzido). Como o artefato é *chamado* — seu nome de arquivo, e o próprio
  título do teste — é uma pergunta diferente; veja a não garantia abaixo.
- **A frase do trace/execução não carrega nenhum dado próprio.** *(since 0.1.3, unreleased)*
  `bold elk soars` é derivada deterministicamente de um id de trace ou de
  execução (`humanName()`, três tabelas de palavras fixas) — ela não é, e
  nunca lê, nada que o código traçado produziu, então é seguro imprimi-la,
  logá-la ou colá-la em um relatório de bug sozinha. Ela nunca chega ao
  artefato estrutural `.nt`, a um trace aprovado ou recebido, ao nome de
  arquivo de um artefato, nem às chaves por cenário do manifest — veja
  [Guia de Configuração § A execução tem um nome](guia-de-configuracao.md#a-execução-tem-um-nome-since-013-unreleased).

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
- **Nenhuma ocultação dos nomes dos testes.** *(since 0.1.3, unreleased)* O cabeçalho `scenario:` do
  artefato estrutural e seu nome de arquivo são derivados do próprio título
  do teste (e, para uma invocação de `.each`, do rótulo interpolado, que só
  chega ao nome de arquivo — veja
  [Structural Trace Format](../structural-trace-format.md), ainda não
  traduzido) — texto que o desenvolvedor escreveu, não um valor capturado,
  então nenhum dos mecanismos de ocultação acima roda sobre ele. Um título
  de teste ou um rótulo de `.each` que embuta um segredo
  (`test("faz login como ${password}", ...)`) coloca esse segredo no nome
  de arquivo e no caminho do `.approved.nt` commitado — mantenha segredos
  fora dos títulos de teste e dos templates de nome do `.each`, a mesma
  regra de qualquer outro framework de teste.
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
