<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib</h1>

<p align="center">
  Skills de agentes IA baseadas em livros canônicos — para Claude Code, Cursor, Copilot e Windsurf.<br/>
  Conhecimento especializado de livros de referência, empacotado como skills, comandos, agentes e regras.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/v/booklib.svg" alt="versão npm"/></a>
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/dw/booklib.svg" alt="downloads"/></a>
  <a href="https://github.com/booklib-ai/booklib/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/booklib?style=flat" alt="estrelas"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="licença"/></a>
</p>

<p align="center">
  <b>22 skills</b> &nbsp;·&nbsp; <b>8 agentes</b> &nbsp;·&nbsp; <b>6 regras</b> &nbsp;·&nbsp; <b>22 comandos</b> &nbsp;·&nbsp; <b>9 perfis</b>
</p>

---

## O que é

Cada skill empacota as principais práticas de um livro de programação em instruções estruturadas que um agente IA pode aplicar diretamente ao código. Em vez de um prompt genérico "seja um bom programador", você obtém conhecimento especializado e direcionado, fundamentado em fontes como *Effective Java*, *Designing Data-Intensive Applications* e *Clean Code*.

```bash
# Instalar tudo globalmente
npx booklib add --all --global

# Ou instalar apenas o que sua stack precisa
npx booklib add --profile=ts --global       # TypeScript
npx booklib add --profile=python --global   # Python
npx booklib add --profile=rust --global     # Rust
npx booklib add --profile=jvm --global      # Java / Kotlin
```

## Quatro camadas

| Camada | Qtd | Como é ativada | Caminho de instalação |
|--------|-----|---------------|-----------------------|
| **Skills** | 22 | Automaticamente, com base no tipo de arquivo e contexto da tarefa | `.claude/skills/` |
| **Comandos** | 22 | Explicitamente — `/effective-python`, `/design-patterns`, etc. | `.claude/commands/` |
| **Agentes** | 8 | Sob demanda — `@python-reviewer`, `@architecture-reviewer` | `.claude/agents/` |
| **Regras** | 6 | Sempre — carregadas em toda sessão, sem gatilho | `.claude/rules/` |

**Perfis** agrupam todas as quatro camadas por linguagem ou domínio:

```bash
npx booklib add --profile=python        # Python skills + comandos + agente + regras
npx booklib add --profile=ts            # TypeScript
npx booklib add --profile=rust          # Rust
npx booklib add --profile=jvm           # Java + Kotlin + Spring Boot
npx booklib add --profile=architecture  # DDD + microsserviços + design de sistemas
npx booklib add --profile=data          # Pipelines de dados + DDIA
npx booklib add --profile=ui            # Refactoring UI + animações + visualização
npx booklib add --profile=lean          # Lean Startup
npx booklib add --profile=core          # Skill router + clean code — boa opção padrão
```

---

## Skills

| Skill | Livro | Autor |
|-------|-------|-------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Código Limpo (Clean Code)* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Projetando Sistemas de Dados Intensivos* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* (3ª ed) | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (2ª ed) | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* (3ª ed) | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* (2ª ed) | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (2ª ed) | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *A Startup Enxuta (The Lean Startup)* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microsserviços Patterns* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | Meta-skill — roteia automaticamente para a skill ideal | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling com Dados* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## Agentes

Revisores autônomos que aplicam múltiplas skills em uma única execução. Invoque com `@nome-do-agente` no Claude Code.

| Agente | Modelo | Skills aplicadas |
|--------|--------|-----------------|
| `@booklib-reviewer` | sonnet | Roteia automaticamente — use quando não souber qual skill usar |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## Regras

Padrões de código sempre ativos — instalados em `.claude/rules/` e carregados automaticamente em toda sessão, sem condições de gatilho.

| Regra | Linguagem | Fonte |
|-------|-----------|-------|
| `clean-code` | todas | *Clean Code* — nomenclatura, funções, comentários, estrutura |
| `effective-python` | Python | *Effective Python* — estilo Pythônico, tipos, tratamento de erros |
| `effective-typescript` | TypeScript | *Effective TypeScript* — tipos, inferência, null safety |
| `effective-java` | Java | *Effective Java* — criação, classes, genéricos, concorrência |
| `effective-kotlin` | Kotlin | *Effective Kotlin* — segurança, corrotinas, coleções |
| `rust` | Rust | *Programming with Rust* + *Rust in Action* — ownership, erros, idiomas |

```bash
npx booklib add --rules             # instalar todas as regras
npx booklib add --rules=python      # instalar regras de uma linguagem
npx booklib add --hooks             # instalar o hook de sugestão de skills
```

---

## Roteamento de skills

Não sabe qual skill usar? A meta-skill `skill-router` seleciona a melhor automaticamente, e o agente `@booklib-reviewer` encapsula essa lógica de ponta a ponta:

```
Usuário: "Review my order processing service"

→ skill-router seleciona:
   Principal: domain-driven-design   — design do modelo de domínio (Agregados, Objetos de Valor)
   Secundário: microservices-patterns — fronteiras de serviço e comunicação entre serviços
```

**Benchmark:** [`benchmark/`](./benchmark/) contém uma comparação entre uma revisão de PR padrão e o skill-router roteando para duas skills. O pipeline do skill-router encontrou ~47% mais problemas únicos.

---

## Qualidade

As skills são avaliadas com e sem a skill ativa, usando `claude-haiku-4-5` como modelo e juiz. O delta em relação ao baseline é o indicador principal.

**Limites:** taxa de aprovação ≥ 80% · delta ≥ 20pp · baseline < 70%

Executar avaliações: `ANTHROPIC_API_KEY=... npx booklib eval <nome>`

---

## Estrutura do repositório

```
booklib-ai/booklib/
├── skills/      22 skills baseadas em livros (SKILL.md + exemplos + avaliações)
├── agents/      8 agentes revisores autônomos
├── commands/    22 slash commands, um por skill
├── rules/       6 padrões de linguagem sempre ativos
├── hooks/       Hook UserPromptSubmit do Claude Code
└── bin/         CLI (skills.js)
```

---

## Contribuindo

Se você leu um livro que merece estar aqui, abra um PR:

```bash
# 1. Copie uma skill existente como template
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. Edite SKILL.md, examples/before.md, examples/after.md, evals/evals.json

# 3. Valide
npx booklib check your-book-name
```

Veja o [CONTRIBUTING.md](./CONTRIBUTING.md) para o guia completo, incluindo como adicionar agentes.

**Solicitações em aberto** (tag `good first issue`): [The Pragmatic Programmer](https://github.com/booklib-ai/booklib/issues/2) · [Clean Architecture](https://github.com/booklib-ai/booklib/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/booklib/issues/4) · [Accelerate](https://github.com/booklib-ai/booklib/issues/8) · [mais →](https://github.com/booklib-ai/booklib/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## Licença

MIT
