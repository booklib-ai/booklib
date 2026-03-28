<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib-ai/skills</h1>

<p align="center">
  定番プログラミング書籍に基づいた AI エージェントスキル — Claude Code、Cursor、Copilot、Windsurf 対応。<br/>
  権威ある書籍の専門知識を、スキル・エージェント・ルールとしてパッケージ化。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/v/@booklib/skills.svg" alt="npm バージョン"/></a>
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/dw/@booklib/skills.svg" alt="ダウンロード数"/></a>
  <a href="https://github.com/booklib-ai/skills/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/skills?style=flat" alt="スター数"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="ライセンス"/></a>
</p>

<p align="center">
  <b>22 スキル</b> &nbsp;·&nbsp; <b>8 エージェント</b> &nbsp;·&nbsp; <b>6 ルール</b> &nbsp;·&nbsp; <b>22 コマンド</b> &nbsp;·&nbsp; <b>9 プロファイル</b>
</p>

---

## 概要

各スキルは、特定のプログラミング書籍の主要なプラクティスを、AI エージェントがコードに直接適用できる構造化された指示としてパッケージ化したものです。汎用的な「良いプログラマーになれ」というプロンプトではなく、*Effective Java*、*Designing Data-Intensive Applications*、*Clean Code* などの権威ある書籍に基づいた的確な専門知識を提供します。

```bash
# すべてをグローバルにインストール
npx @booklib/skills add --all --global

# あるいはスタックに合ったものだけをインストール
npx @booklib/skills add --profile=ts --global       # TypeScript
npx @booklib/skills add --profile=python --global   # Python
npx @booklib/skills add --profile=rust --global     # Rust
npx @booklib/skills add --profile=jvm --global      # Java / Kotlin
```

## 4 つの層

| 層 | 数 | 有効化のタイミング | インストール先 |
|----|----|--------------------|----------------|
| **スキル** | 22 | 自動 — ファイル種別やタスクのコンテキストに応じてトリガー | `.claude/skills/` |
| **コマンド** | 22 | 明示的 — `/effective-python`、`/design-patterns` など | `.claude/commands/` |
| **エージェント** | 8 | オンデマンド — `@python-reviewer`、`@architecture-reviewer` | `.claude/agents/` |
| **ルール** | 6 | 常時 — セッションごとに自動ロード、トリガー不要 | `.claude/rules/` |

**プロファイル**は言語またはドメインごとに 4 層すべてをまとめてインストールします：

```bash
npx @booklib/skills add --profile=python        # Python スキル + コマンド + エージェント + ルール
npx @booklib/skills add --profile=ts            # TypeScript
npx @booklib/skills add --profile=rust          # Rust
npx @booklib/skills add --profile=jvm           # Java + Kotlin + Spring Boot
npx @booklib/skills add --profile=architecture  # DDD + マイクロサービス + システム設計
npx @booklib/skills add --profile=data          # データパイプライン + DDIA
npx @booklib/skills add --profile=ui            # Refactoring UI + アニメーション + データ可視化
npx @booklib/skills add --profile=lean          # リーンスタートアップ
npx @booklib/skills add --profile=core          # スキルルーター + クリーンコード — 汎用デフォルト
```

---

## スキル一覧

| スキル | 書籍 | 著者 |
|--------|------|------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* 第3版 | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* 第2版 | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* 第3版 | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* 第2版 | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* 第2版 | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | メタスキル — 最適なスキルへ自動ルーティング | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## エージェント

1 回の実行で複数のスキルを適用する自律的なレビュアーです。Claude Code で `@エージェント名` を使って呼び出します。

| エージェント | モデル | 適用スキル |
|--------------|--------|-----------|
| `@booklib-reviewer` | sonnet | 最適なスキルへ自動ルーティング — 迷ったらこれ |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## ルール

常時有効なコーディング規約 — `.claude/rules/` にインストールされ、トリガー条件なしに毎セッション自動ロードされます。

| ルール | 言語 | 出典 |
|--------|------|------|
| `clean-code` | 全言語 | *Clean Code* — 命名・関数・コメント・構造 |
| `effective-python` | Python | *Effective Python* — Pythonicスタイル・型・エラー処理 |
| `effective-typescript` | TypeScript | *Effective TypeScript* — 型・推論・null安全 |
| `effective-java` | Java | *Effective Java* — 生成・クラス・ジェネリクス・並行性 |
| `effective-kotlin` | Kotlin | *Effective Kotlin* — 安全性・コルーチン・コレクション |
| `rust` | Rust | *Programming with Rust* + *Rust in Action* — 所有権・エラー・慣用パターン |

```bash
npx @booklib/skills add --rules             # すべてのルールをインストール
npx @booklib/skills add --rules=python      # 特定言語のルールをインストール
npx @booklib/skills add --hooks             # スキル提案フックをインストール
```

---

## スキルルーティング

どのスキルを使えばいいかわからない場合は、`skill-router` メタスキルが自動的に最適なものを選択します。`@booklib-reviewer` エージェントはこのロジックをエンドツーエンドでラップしています：

```
ユーザー："Review my order processing service"

→ skill-router が選択：
   主要：   domain-driven-design   — ドメインモデル設計（集約・値オブジェクト）
   副次：   microservices-patterns — サービス境界とサービス間通信
```

**ベンチマーク：** [`benchmark/`](./benchmark/) には、標準的な PR レビューと skill-router による 2 スキルへのルーティングの比較が含まれています。skill-router パイプラインは約 47% 多くの固有の問題を発見しました。

---

## 品質評価

各スキルは、スキルあり・なしの両条件で評価が実行され、`claude-haiku-4-5` がモデルと評価者を兼ねます。ベースラインからのデルタ（delta）が主要な指標です。

**閾値：** 通過率 ≥ 80% · delta ≥ 20pp · ベースライン < 70%

評価実行：`ANTHROPIC_API_KEY=... npx @booklib/skills eval <スキル名>`

---

## リポジトリ構造

```
booklib-ai/skills/
├── skills/      22 の書籍ベーススキル（SKILL.md + サンプル + 評価）
├── agents/      8 つの自律レビューエージェント
├── commands/    22 のスラッシュコマンド（スキルごとに 1 つ）
├── rules/       6 つの常時有効な言語規約
├── hooks/       Claude Code UserPromptSubmit フック
└── bin/         CLI（skills.js）
```

---

## コントリビューション

掲載すべき書籍を読んでいる方は、PR を送ってください：

```bash
# 1. 既存スキルをテンプレートとしてコピー
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. SKILL.md、examples/before.md、examples/after.md、evals/evals.json を編集

# 3. 検証
npx @booklib/skills check your-book-name
```

エージェントの追加方法を含む完全なガイドは [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

**オープンリクエスト**（`good first issue` タグ付き）：[The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [Accelerate](https://github.com/booklib-ai/skills/issues/8) · [もっと見る →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## ライセンス

MIT
