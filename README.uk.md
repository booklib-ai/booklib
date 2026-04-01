<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib</h1>

<p align="center">
  Відкрита екосистема знань для AI-агентів.<br/>
  Навички з канонічних книг — плюс пошук по спільноті, семантичний пошук та сумісність з оркестраторами.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/v/booklib.svg" alt="npm версія"/></a>
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/dw/booklib.svg" alt="завантаження"/></a>
  <a href="https://github.com/booklib-ai/booklib/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/booklib?style=flat" alt="зірки"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="ліцензія"/></a>
</p>

<p align="center">
  <b>22 вбудовані навички</b> &nbsp;·&nbsp; <b>258+ для відкриття</b> &nbsp;·&nbsp; <b>8 агентів</b> &nbsp;·&nbsp; <b>сумісність з obra/superpowers та ruflo</b>
</p>

---

## Що це таке

BookLib пакує експертні знання з канонічних книг з програмування у навички, які AI-агенти можуть застосовувати безпосередньо до вашого коду. Бібліотека містить 22 перевірені навички — і рушій відкриття, який може знаходити, індексувати та впроваджувати сотні додаткових навичок зі спільноти.

**Два рівні:**

| Рівень | Що робить |
|--------|-----------|
| **Вбудована бібліотека** | 22 навички з канонічних книг, попередньо проіндексовані, готові до використання |
| **Екосистема відкриття** | Знаходить і завантажує навички з GitHub-репозиторіїв, реєстрів спільноти та npm-пакетів |

BookLib — не статична інсталяція. Це локальний рушій знань: семантичний пошук по вмісту навичок, автоматичне впровадження контексту через хуки, рольові профілі для агентів-зграй і міст синхронізації, що робить кожну завантажену навичку доступною для будь-якого оркестратора, сумісного з Claude Code.

---

## Як активуються навички

| Механізм | Що його запускає | Подробиці |
|----------|-----------------|-----------|
| **Хук PreToolUse** | Редагування файлу, що відповідає `filePattern` навички | Впроваджує лише релевантні фрагменти — точно, автоматично, без сповіщень |
| **Інструмент Skill** | `Skill("effective-kotlin")` | Повний дамп навички на вимогу — для оркестраторів та субагентів |
| **Пошук** | `booklib search "<концепція>"` | Семантичний векторний пошук — повертає найрелевантніші фрагменти |
| **Аудит** | `booklib audit <навичка> <файл>` | Застосовує принципи навички до конкретного файлу |

**Хук** — точний рівень. Після `booklib hooks install` він спрацьовує при кожному виклику `Read`/`Edit`/`Write`/`Bash`, зіставляє шлях до файлу з патернами навичок і непомітно впроваджує відповідні секції навичок у контекст. Редагуйте `.kt` — отримуєте effective-kotlin. Редагуйте `.py` — отримуєте effective-python.

---

## Швидкий старт

```bash
# Встановити CLI
npm install -g booklib

# Побудувати локальний індекс пошуку
booklib index

# Встановити хук PreToolUse — автоматично впроваджує навички при редагуванні файлів
booklib hooks install

# Пошук мудрості за концепцією
booklib search "як обробляти null-значення в Kotlin"

# Відкрити та встановити всі довірені навички (вбудовані + спільноти)
booklib setup

# Синхронізувати всі завантажені навички → доступні для Skill tool і оркестраторів
booklib sync
```

---

## Вбудовані навички

| Навичка | Книга | Автор |
|---------|-------|-------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* (3-є вид.) | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (2-є вид.) | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* (3-є вид.) | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* (2-є вид.) | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (2-є вид.) | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | Мета-навичка — автоматично маршрутизує до правильної навички | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## Відкриття навичок

BookLib може знаходити та індексувати навички поза вбудованим набором. Налаштуйте джерела у `booklib.config.json`:

```json
{
  "sources": [
    { "type": "registry", "trusted": true },
    { "type": "manifest", "url": "./community/registry.json", "trusted": true },
    { "type": "github-skills-dir", "repo": "obra/superpowers", "dir": "skills", "branch": "main", "trusted": true },
    { "type": "github-org", "org": "your-org" },
    { "type": "npm-scope", "scope": "@your-scope" }
  ]
}
```

```bash
booklib discover              # перелік доступних навичок з усіх джерел
booklib discover --refresh    # примусове повторне сканування
booklib fetch naming-cheatsheet    # завантажити конкретну навичку
booklib setup                 # завантажити всі довірені навички одразу
```

`"trusted": true` — навичка встановлюється автоматично через `booklib setup`. Ненадійні джерела видимі, але потребують явного підтвердження через `booklib fetch <назва>`.

---

## Сумісність з оркестраторами

Після `booklib sync` кожна завантажена навичка знаходиться за шляхом `~/.claude/skills/<назва>/SKILL.md` — звідти читає нативний Skill tool Claude Code.

```bash
booklib sync    # записати всі завантажені навички до ~/.claude/skills/
```

| Оркестратор | Встановлення | Навички доступні через |
|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers` | Skill tool — доступний у кожній сесії |
| [ruflo](https://github.com/ruvnet/ruflo) | `npm install -g ruflo` | Skill tool — доступний у кожній сесії |

---

## Зграї та рольові профілі

```bash
booklib profile reviewer     # навички для агента-рецензента коду
booklib profile security     # навички для аудитора безпеки
booklib profile architect    # навички для агента системного проєктування
```

Ролі: `architect` · `coder` · `reviewer` · `tester` · `security` · `frontend` · `optimizer` · `devops` · `ai-engineer` · `manager`

```bash
booklib swarm-config audit      # карта навичок для тригера аудиту
booklib swarm-config feature    # architect → coder → reviewer → tester
booklib swarm-config            # перелік усіх налаштованих тригерів
```

---

## Агенти

| Агент | Модель | Застосовані навички |
|-------|--------|---------------------|
| `@booklib-reviewer` | sonnet | Автоматична маршрутизація до найкращої навички |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## Семантичний пошук та аудит

```bash
booklib search "як обробляти null-значення в Kotlin"
booklib search "event sourcing vs CQRS" --role=architect
booklib audit effective-kotlin src/PaymentService.kt
booklib scan    # теплова карта — порушення по навичках у всьому проєкті
```

---

## Передача сесій

```bash
booklib save-state --goal="..." --next="..." --progress="..."
booklib resume
booklib recover-auto    # автовідновлення з останньої сесії або git-історії
```

Координація між агентами:

```bash
booklib sessions-list
booklib sessions-merge auth-session,payment-session combined
booklib sessions-lineage main feature-x "розгалужено для роботи з auth"
booklib sessions-compare python-audit,kotlin-audit src/auth.ts comparison
```

---

## Якість

Кожна вбудована навичка оцінюється шляхом запиту до моделі переглянути код з навичкою та без неї. **Дельта** = відсоток проходження з навичкою мінус без неї — вона вимірює, наскільки навичка дійсно змінює поведінку моделі.

Порогові значення: відсоток проходження ≥ 80% · дельта ≥ 20пп · базовий рівень < 70%

---

## Внесок у проєкт

Щоб додати вбудовану навичку:

```bash
cp -r skills/clean-code-reviewer skills/назва-вашої-книги
# Відредагуйте SKILL.md, examples/before.md, examples/after.md, evals/evals.json
npx booklib check назва-вашої-книги
```

Щоб додати навичку спільноти — відредагуйте `community/registry.json` та відкрийте PR.

Детальніше: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## Ліцензія

MIT
