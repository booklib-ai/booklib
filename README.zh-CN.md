<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib-ai/skills</h1>

<p align="center">
  基于经典书籍的 AI 代理技能 — 适用于 Claude Code、Cursor、Copilot 和 Windsurf。<br/>
  将权威书籍中的专家知识，打包为技能、命令、代理和规则。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/v/@booklib/skills.svg" alt="npm 版本"/></a>
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/dw/@booklib/skills.svg" alt="下载量"/></a>
  <a href="https://github.com/booklib-ai/skills/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/skills?style=flat" alt="Star 数"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="许可证"/></a>
</p>

<p align="center">
  <b>22 个技能</b> &nbsp;·&nbsp; <b>8 个代理</b> &nbsp;·&nbsp; <b>6 条规则</b> &nbsp;·&nbsp; <b>22 个命令</b> &nbsp;·&nbsp; <b>9 个配置文件</b>
</p>

---

## 这是什么

每个技能将某本编程书籍中的核心实践，打包成 AI 代理可以直接应用于代码的结构化指令。不再是泛泛的"成为一名好程序员"提示词，而是来自《Effective Java》、《Designing Data-Intensive Applications》和《Clean Code》等权威书籍的针对性专业知识。

```bash
# 全局安装所有内容
npx @booklib/skills add --all --global

# 或只安装适合你技术栈的内容
npx @booklib/skills add --profile=ts --global       # TypeScript
npx @booklib/skills add --profile=python --global   # Python
npx @booklib/skills add --profile=rust --global     # Rust
npx @booklib/skills add --profile=jvm --global      # Java / Kotlin
```

## 四个层级

| 层级 | 数量 | 激活方式 | 安装路径 |
|------|------|---------|---------|
| **技能** | 22 | 自动，根据文件类型和任务上下文触发 | `.claude/skills/` |
| **命令** | 22 | 显式调用 — `/effective-python`、`/design-patterns` 等 | `.claude/commands/` |
| **代理** | 8 | 按需调用 — `@python-reviewer`、`@architecture-reviewer` | `.claude/agents/` |
| **规则** | 6 | 始终生效 — 每次会话自动加载，无需触发条件 | `.claude/rules/` |

**配置文件**按语言或领域捆绑以上所有层级：

```bash
npx @booklib/skills add --profile=python        # Python 技能 + 命令 + 代理 + 规则
npx @booklib/skills add --profile=ts            # TypeScript
npx @booklib/skills add --profile=rust          # Rust
npx @booklib/skills add --profile=jvm           # Java + Kotlin + Spring Boot
npx @booklib/skills add --profile=architecture  # DDD + 微服务 + 系统设计
npx @booklib/skills add --profile=data          # 数据管道 + DDIA
npx @booklib/skills add --profile=ui            # Refactoring UI + 动画 + 数据可视化
npx @booklib/skills add --profile=lean          # 精益创业
npx @booklib/skills add --profile=core          # 技能路由器 + 代码整洁 — 推荐默认值
```

---

## 技能列表

| 技能 | 书籍 | 作者 |
|------|------|------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code（代码整洁之道）* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications（数据密集型应用系统设计）* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design（领域驱动设计）* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java（Effective Java 中文版）* (第3版) | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (第2版) | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python（Effective Python 中文版）* (第3版) | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* (第2版) | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (第2版) | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup（精益创业）* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns（微服务架构设计模式）* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | 元技能 — 自动路由到最合适的技能 | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data（用数据讲故事）* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview（系统设计面试）* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## 代理

自主审查器，在一次执行中应用多个技能。在 Claude Code 中使用 `@代理名称` 调用。

| 代理 | 模型 | 应用的技能 |
|------|------|-----------|
| `@booklib-reviewer` | sonnet | 自动路由到最佳技能 — 不确定时使用此代理 |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## 规则

始终生效的编码规范 — 安装到 `.claude/rules/`，每次会话自动加载，无需任何触发条件。

| 规则 | 语言 | 来源 |
|------|------|------|
| `clean-code` | 所有语言 | *Clean Code* — 命名、函数、注释、结构 |
| `effective-python` | Python | *Effective Python* — Pythonic 风格、类型、错误处理 |
| `effective-typescript` | TypeScript | *Effective TypeScript* — 类型、推断、空值安全 |
| `effective-java` | Java | *Effective Java* — 创建、类、泛型、并发 |
| `effective-kotlin` | Kotlin | *Effective Kotlin* — 安全性、协程、集合 |
| `rust` | Rust | *Programming with Rust* + *Rust in Action* — 所有权、错误、惯用模式 |

```bash
npx @booklib/skills add --rules             # 安装所有规则
npx @booklib/skills add --rules=python      # 安装单个语言的规则
npx @booklib/skills add --hooks             # 安装技能建议钩子
```

---

## 技能路由

不确定用哪个技能？`skill-router` 元技能会自动选择最佳匹配，而 `@booklib-reviewer` 代理则端到端地封装了整个流程：

```
用户："Review my order processing service"

→ skill-router 选择：
   主要：   domain-driven-design   — 领域模型设计（聚合根、值对象）
   次要：   microservices-patterns — 服务边界和服务间通信
```

**基准测试：** [`benchmark/`](./benchmark/) 展示了标准 PR 审查与 skill-router 路由到两个技能的对比。skill-router 管道多发现了约 47% 的独特问题。

---

## 质量评估

每个技能都在启用和不启用的情况下分别运行评估，使用 `claude-haiku-4-5` 作为模型和评判者。与基线的差值（delta）是关键指标。

**阈值：** 通过率 ≥ 80% · delta ≥ 20pp · 基线 < 70%

运行评估：`ANTHROPIC_API_KEY=... npx @booklib/skills eval <技能名>`

---

## 仓库结构

```
booklib-ai/skills/
├── skills/      22 个基于书籍的技能（SKILL.md + 示例 + 评估）
├── agents/      8 个自主审查代理
├── commands/    22 个斜杠命令，每个技能一个
├── rules/       6 条始终生效的语言规范
├── hooks/       Claude Code UserPromptSubmit 钩子
└── bin/         CLI（skills.js）
```

---

## 参与贡献

如果你读过一本适合加入的书籍，欢迎提交 PR：

```bash
# 1. 基于现有技能创建新技能
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. 编辑 SKILL.md、examples/before.md、examples/after.md、evals/evals.json

# 3. 验证
npx @booklib/skills check your-book-name
```

完整指南请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)，包括如何添加代理。

**待认领的书籍**（标记为 `good first issue`）：[The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [Accelerate](https://github.com/booklib-ai/skills/issues/8) · [更多 →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## 许可证

MIT
