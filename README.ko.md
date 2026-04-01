<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib</h1>

<p align="center">
  정통 서적에 기반한 AI 에이전트 스킬 — Claude Code, Cursor, Copilot, Windsurf 지원.<br/>
  권위 있는 서적의 전문 지식을 스킬, 커맨드, 에이전트, 규칙으로 패키징.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/v/booklib.svg" alt="npm 버전"/></a>
  <a href="https://www.npmjs.com/package/booklib"><img src="https://img.shields.io/npm/dw/booklib.svg" alt="다운로드 수"/></a>
  <a href="https://github.com/booklib-ai/booklib/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/booklib?style=flat" alt="스타 수"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="라이선스"/></a>
</p>

<p align="center">
  <b>스킬 22개</b> &nbsp;·&nbsp; <b>에이전트 8개</b> &nbsp;·&nbsp; <b>규칙 6개</b> &nbsp;·&nbsp; <b>커맨드 22개</b> &nbsp;·&nbsp; <b>프로파일 9개</b>
</p>

---

## 소개

각 스킬은 특정 프로그래밍 서적의 핵심 실천 방법을 AI 에이전트가 코드에 직접 적용할 수 있는 구조화된 지침으로 패키징합니다. "좋은 프로그래머가 되어라"는 막연한 프롬프트 대신, *Effective Java*, *Designing Data-Intensive Applications*, *Clean Code* 같은 권위 있는 책에서 나온 구체적인 전문 지식을 제공합니다.

```bash
# 모든 것을 전역으로 설치
npx booklib add --all --global

# 또는 스택에 맞는 것만 설치
npx booklib add --profile=ts --global       # TypeScript
npx booklib add --profile=python --global   # Python
npx booklib add --profile=rust --global     # Rust
npx booklib add --profile=jvm --global      # Java / Kotlin
```

## 4가지 계층

| 계층 | 수 | 활성화 방식 | 설치 경로 |
|------|-----|------------|----------|
| **스킬** | 22 | 자동 — 파일 타입과 작업 컨텍스트에 따라 트리거 | `.claude/skills/` |
| **커맨드** | 22 | 명시적 — `/effective-python`, `/design-patterns` 등 | `.claude/commands/` |
| **에이전트** | 8 | 필요 시 — `@python-reviewer`, `@architecture-reviewer` | `.claude/agents/` |
| **규칙** | 6 | 항상 — 세션마다 자동 로드, 트리거 조건 없음 | `.claude/rules/` |

**프로파일**은 언어 또는 도메인별로 4가지 계층을 모두 묶어서 설치합니다:

```bash
npx booklib add --profile=python        # Python 스킬 + 커맨드 + 에이전트 + 규칙
npx booklib add --profile=ts            # TypeScript
npx booklib add --profile=rust          # Rust
npx booklib add --profile=jvm           # Java + Kotlin + Spring Boot
npx booklib add --profile=architecture  # DDD + 마이크로서비스 + 시스템 설계
npx booklib add --profile=data          # 데이터 파이프라인 + DDIA
npx booklib add --profile=ui            # Refactoring UI + 애니메이션 + 데이터 시각화
npx booklib add --profile=lean          # 린 스타트업
npx booklib add --profile=core          # 스킬 라우터 + 클린 코드 — 기본 추천값
```

---

## 스킬 목록

| 스킬 | 도서 | 저자 |
|------|------|------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code(클린 코드)* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications(데이터 중심 애플리케이션 설계)* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design(도메인 주도 설계)* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* (3판) | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (2판) | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* (3판) | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* (2판) | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (2판) | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup(린 스타트업)* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns(마이크로서비스 패턴)* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | 메타 스킬 — 최적 스킬로 자동 라우팅 | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview(가상 면접 사례로 배우는 대규모 시스템 설계 기초)* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## 에이전트

한 번의 실행으로 여러 스킬을 적용하는 자율 리뷰어입니다. Claude Code에서 `@에이전트명`으로 호출합니다.

| 에이전트 | 모델 | 적용 스킬 |
|----------|------|----------|
| `@booklib-reviewer` | sonnet | 최적 스킬로 자동 라우팅 — 모를 때 사용 |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## 규칙

항상 활성화되는 코딩 표준 — `.claude/rules/`에 설치되어 트리거 조건 없이 매 세션 자동 로드됩니다.

| 규칙 | 언어 | 출처 |
|------|------|------|
| `clean-code` | 모든 언어 | *Clean Code* — 네이밍, 함수, 주석, 구조 |
| `effective-python` | Python | *Effective Python* — Pythonic 스타일, 타입, 에러 처리 |
| `effective-typescript` | TypeScript | *Effective TypeScript* — 타입, 추론, null 안전성 |
| `effective-java` | Java | *Effective Java* — 생성, 클래스, 제네릭, 동시성 |
| `effective-kotlin` | Kotlin | *Effective Kotlin* — 안전성, 코루틴, 컬렉션 |
| `rust` | Rust | *Programming with Rust* + *Rust in Action* — 소유권, 에러, 관용 패턴 |

```bash
npx booklib add --rules             # 모든 규칙 설치
npx booklib add --rules=python      # 특정 언어 규칙 설치
npx booklib add --hooks             # 스킬 제안 훅 설치
```

---

## 스킬 라우팅

어떤 스킬을 써야 할지 모를 때는 `skill-router` 메타 스킬이 자동으로 최적의 스킬을 선택합니다. `@booklib-reviewer` 에이전트는 이 로직을 엔드투엔드로 래핑합니다:

```
사용자: "Review my order processing service"

→ skill-router 선택:
   주요:   domain-driven-design   — 도메인 모델 설계 (애그리게이트, 값 객체)
   보조:   microservices-patterns — 서비스 경계 및 서비스 간 통신
```

**벤치마크:** [`benchmark/`](./benchmark/)에는 일반 PR 리뷰와 skill-router가 두 스킬로 라우팅한 결과의 비교가 포함되어 있습니다. skill-router 파이프라인이 약 47% 더 많은 고유 문제를 발견했습니다.

---

## 품질 평가

각 스킬은 스킬 적용 시와 미적용 시 모두 평가가 실행되며, `claude-haiku-4-5`가 모델과 판정자 역할을 합니다. 베이스라인 대비 델타(delta)가 핵심 지표입니다.

**임계값:** 통과율 ≥ 80% · delta ≥ 20pp · 베이스라인 < 70%

평가 실행: `ANTHROPIC_API_KEY=... npx booklib eval <스킬명>`

---

## 저장소 구조

```
booklib-ai/booklib/
├── skills/      서적 기반 스킬 22개 (SKILL.md + 예제 + 평가)
├── agents/      자율 리뷰 에이전트 8개
├── commands/    슬래시 커맨드 22개 (스킬당 1개)
├── rules/       항상 활성화되는 언어별 규칙 6개
├── hooks/       Claude Code UserPromptSubmit 훅
└── bin/         CLI (skills.js)
```

---

## 기여하기

여기에 포함될 만한 책을 읽었다면 PR을 보내주세요:

```bash
# 1. 기존 스킬을 템플릿으로 복사
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. SKILL.md, examples/before.md, examples/after.md, evals/evals.json 편집

# 3. 검증
npx booklib check your-book-name
```

에이전트 추가 방법을 포함한 전체 가이드는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참조하세요.

**오픈 요청** (`good first issue` 태그): [The Pragmatic Programmer](https://github.com/booklib-ai/booklib/issues/2) · [Clean Architecture](https://github.com/booklib-ai/booklib/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/booklib/issues/4) · [Accelerate](https://github.com/booklib-ai/booklib/issues/8) · [더 보기 →](https://github.com/booklib-ai/booklib/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## 라이선스

MIT
