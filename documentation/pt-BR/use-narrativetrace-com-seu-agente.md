<!-- source: documentation/use-with-your-agent.md blob b27cf541f674 | translated: 2026-10-10 | reviewed: - -->
# Use o NarrativeTrace com seu agente

[English](../use-with-your-agent.md) | [Español](../es/usa-narrativetrace-con-tu-agente.md) | **Português** | [简体中文](../zh-CN/搭配你的智能体使用.md)

O NarrativeTrace distribui [habilidades de agente](habilidades-de-agente.md) — os procedimentos que um agente
segue para instalar a biblioteca, ler uma trilha e diagnosticar uma instalação — no formato aberto
Agent Skills. Todas as plataformas da tabela abaixo já descobrem as páginas que o `init` escreve em
`.agents/skills`, então existe um único conjunto de páginas e nenhuma cópia por plataforma. O que muda de uma
plataforma para outra é como alguém de fora leva as páginas para um projeto, e qual arquivo pequeno aponta o
agente para elas antes que ele pense em olhar.

## Plataformas em resumo

<!-- platform-table:begin -->
| Plataforma | Como alguém de fora obtém as habilidades | O que o agente encontra após o `init` | Evidência | Verificado |
|---|---|---|---|---|
| Cursor | Instale o plugin a partir do manifesto `.cursor-plugin` do repositório público, ou execute `narrativetrace init` no projeto | as habilidades em `.agents/skills` (o Cursor também lê `.claude/skills`), e a regra única `.cursor/rules/narrativetrace.mdc` que aponta para elas | lane Tier B `cursor` | 2026-10-10 |
| Replit | Importe o repositório público do GitHub (cole a URL, visualize as habilidades, adicione-as), ou execute `narrativetrace init` no projeto | as habilidades em `.agents/skills`, e uma seção do NarrativeTrace em `replit.md`, a memória do projeto que o agente do Replit lê primeiro | teste manual | 2026-10-10 |
| Antigravity | Nada a instalar além do próprio projeto: execute `narrativetrace init` no projeto e faça commit das habilidades (a CLI `agy` e a IDE as leem como habilidades do workspace) | as habilidades em `.agents/skills`, que o Antigravity lê como habilidades do workspace, e a seção em `AGENTS.md`, que ele carrega como regras | lane Tier B `antigravity` | 2026-10-10 |
| GitHub Copilot | Nada a instalar além do próprio repositório: execute `narrativetrace init` no projeto e faça commit das habilidades | as habilidades em `.agents/skills` (o Copilot também lê `.claude/skills` e `.github/skills`), e a seção em `AGENTS.md` | teste manual | 2026-10-10 |
| Claude Code | Adicione o repositório como marketplace de plugins e instale o plugin dele, ou execute `narrativetrace init` no projeto | as habilidades em `.claude/skills` e `.agents/skills`, e a seção em `AGENTS.md` que o `CLAUDE.md` importa | lane Tier B `claude` | 2026-10-10 |
<!-- platform-table:end -->

A tabela é renderizada a partir do registro de plataformas que o instalador e o doctor leem, então não pode
divergir do que o `init` faz. A coluna Verificado é a data em que os fatos de cada linha foram conferidos
pela última vez com a documentação da própria plataforma; o comportamento das plataformas muda depressa,
então trate essa data como parte da resposta e a documentação do fornecedor como a autoridade.

## Os arquivos apontadores que o `init` escreve

Um apontador é um arquivo pequeno que a plataforma já lê primeiro. Ele só é escrito quando o projeto mostra
que a plataforma está em uso, nunca como cópia de uma página de habilidade, e nunca por meio de um link
simbólico:

- **Cursor** — `.cursor/rules/narrativetrace.mdc`, uma regra sempre aplicada que diz onde as habilidades
  vivem, escrita só quando o projeto tem um diretório `.cursor/`. O plugin do Cursor distribui a mesma regra.
- **Replit** — uma seção marcada do NarrativeTrace em `replit.md`, a memória do projeto que o agente do Replit
  lê primeiro, escrita só quando o projeto tem `replit.md` ou `.replit`. É a mesma seção que o `AGENTS.md`
  carrega, com os mesmos marcadores.
- **Antigravity, GitHub Copilot, Claude Code** — nenhum apontador. Eles leem `.agents/skills` e
  `AGENTS.md` diretamente (o Antigravity carrega o `AGENTS.md` como regras; o Claude Code também lê `.claude/skills`, que o `init` escreve em todo projeto).

Um apontador que já é idêntico ao que o `init` escreveria é adotado em vez de recusado, um arquivo que não é
nosso é recusado sem `--force`, e `npx @narrativetrace/cli uninstall` remove exatamente os apontadores que
escreveu. `npx @narrativetrace/cli doctor` informa o apontador de cada plataforma detectada como presente e
atual, ou nomeia o que está faltando, desatualizado ou alheio.

## Copiando à mão

Copiar funciona para qualquer plataforma, e é o único caminho para um agente sem build próprio:

- **Codex**: o catálogo renderiza
  [`.agents/skills/narrativetrace-doctor/`](../../.agents/skills/narrativetrace-doctor/SKILL.md) e
  os demais diretórios de habilidades na mesma pasta — o layout versionado no repositório que a CLI do Codex
  documenta para as habilidades próprias de um projeto, e que ela descobre sozinha, subindo do diretório de
  trabalho até a raiz do repositório (e também `~/.agents/skills` para habilidades globais de usuário). Seu
  frontmatter carrega apenas `name` e `description` (o Codex não documenta chaves `when_to_use` nem
  `allowed-tools`); de resto, o corpo da página é idêntico. Copie o diretório relevante para o
  `.agents/skills/<nome>/` do seu próprio projeto e o Codex o descobre da mesma forma. Fonte:
  developers.openai.com/codex/skills e developers.openai.com/codex/concepts/customization
  (obtido em 2026-09-13).
- **Antigravity**: as habilidades do workspace são lidas de `.agents/skills/` (legado:
  `.agent/skills/`), então a mesma cópia serve na IDE e na CLI `agy`. O instalador de plugins dele lê
  apenas o diretório `skills/` de primeiro nível de um plugin, que este repositório não distribui,
  então não há um caminho `agy plugin install`.
- **Qualquer agente, qualquer plataforma**: todo agente que lê `AGENTS.md` vê a seção sempre ativa que o
  `init` escreve ali — o nome e a descrição das habilidades, para que um agente que nunca pensou em
  procurá-las ainda assim saiba que elas existem.

## Evidência

A linha de cada plataforma nomeia o teste que a sustenta. As lanes do Claude, Codex, Antigravity e Cursor
conduzem a CLI de agente real contra o prompt de instalação em um projeto de fixture, e uma lane cuja CLI
não está instalada é ignorada com uma linha em vez de falhar; Replit e GitHub Copilot são testes manuais
registrados pelo proprietário. As lanes, a política de cota esporádica e a matriz de promoção são descritas
em [Tier B — testes com LLM](../../packages/skills-catalogue/evals/README.md).

## Relacionado

- [Habilidades de agente](habilidades-de-agente.md) — o que são as habilidades, como são construídas e o instalador
- [Guia de instalação](guia-de-instalacao.md) — a biblioteca em si
