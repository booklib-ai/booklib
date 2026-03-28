# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0] - 2026-03-28

### Added
- **Rules system** — Standalone rule files for Cursor and other AI editors
- **Standalone `--hooks` flag** — Install hooks independently of skills
- **Landing page update** — Improved GitHub Pages documentation

### Changed
- Multi-language README support (中文, 日本語, 한국어, Português)
- README overhaul for v1.10.0 with improved clarity and examples

### Fixed
- Book covers now load via Google Books JSON API (eliminates false-positive placeholders)
- Cover image detection improved to skip 1×1 pixel placeholders

## [1.9.0] - 2026-02-27

### Added
- **Agents system** — `@python-reviewer`, `@ts-reviewer`, `@architecture-reviewer`, and more
- **Cursor support** — Install skills and rules to `.cursor/rules/` for Cursor IDE
- **Installation profiles** — Quick-start profiles for common stacks (python, ts, jvm, rust, architecture, data, ui, lean, core)
- **Slash commands** — `/effective-python`, `/design-patterns`, etc. for explicit skill invocation
- **Hook system** — Auto-suggestion when asking for code reviews
- **GitHub Pages site** — Interactive skill browser with book covers

### Changed
- AGENTS.md rewritten with profiles and cross-platform setup
- README structure reorganized around profiles and tiers

### Removed
- Hardcoded skill count (now dynamic)

## [1.8.0] - 2026-02-26

### Added
- **Installation profiles** — Platform-specific quick-install (e.g., `--profile=ts`, `--profile=python`)
- **Benchmark suite** — Performance testing infrastructure
- **Skill quality checker** — `npx @booklib/skills check <skill-name>`

### Changed
- Project logo added and displayed in README
- Community health files added
- NPM ignore list improved

## [1.7.0] - 2026-02-24

### Added
- **Agents system** — `@booklib-reviewer`, `@python-reviewer`, `@ts-reviewer` for autonomous code review
- **Skill-router meta-skill** — Auto-routing to best skill based on context
- **GitHub Actions workflows** — Automated testing and release pipeline
- **Skill evaluation framework** — `evals.json` test cases for quality assurance

### Changed
- All skills upgraded to **Platinum** quality (13/13 checks)
- Scripts added to all skills for practical examples
- Skill structure standardized with examples/ and references/ directories

## [1.6.0] - 2026-02-20

### Added
- **Slash commands system** — Explicit skill invocation without relying on auto-trigger
- **Skill verification** — `npx @booklib/skills eval <skill-name>` for running test cases

## [1.5.0] - 2026-02-18

### Added
- `spring-boot-in-action` skill — Enterprise Java best practices
- Spring Boot patterns and architecture guidance

## [1.4.0] - 2026-02-16

### Added
- `effective-typescript` skill — Dan Vanderkam's TypeScript best practices
- `programming-with-rust` skill — Donis Marshall's practical Rust patterns
- `rust-in-action` skill — Tim McNamara's systems programming with Rust

### Changed
- Upgraded to Platinum quality across new skills

## [1.3.0] - 2026-02-15

### Added
- **Skill-router** — Meta-skill that automatically selects the best skill for your task
- Improved skill discovery mechanism
- Better error messages for missing skills

## [1.2.0] - 2026-02-14

### Added
- GitHub Pages site with skill browser
- Animated demo GIF
- Improved README with better visual hierarchy

## [1.1.0] - 2026-02-13

### Added
- NPM version, downloads, and license badges
- Better documentation structure
- CLAUDE.md with project overview

## [1.0.0] - 2026-02-10

### Added
- **Initial release** with 18 core skills:
  - `animation-at-work`
  - `clean-code-reviewer`
  - `data-intensive-patterns`
  - `data-pipelines`
  - `design-patterns`
  - `domain-driven-design`
  - `effective-java`
  - `effective-kotlin`
  - `effective-python`
  - `kotlin-in-action`
  - `lean-startup`
  - `microservices-patterns`
  - `refactoring-ui`
  - `storytelling-with-data`
  - `system-design-interview`
  - `using-asyncio-python`
  - `web-scraping-python`
  - Plus 4 additional skills

- **Installation system** — NPM-based skill installation
- **Skill structure** — Standardized SKILL.md format with YAML frontmatter
- **Auto-triggering** — Skills load automatically based on file context
- **MIT License** — Open-source and permissive
- **Security policy** — Responsible disclosure guidelines
- **Code of Conduct** — Community standards

---

## Release Notes

For detailed release notes, see [GitHub Releases](https://github.com/booklib-ai/skills/releases).

## Versioning Policy

This project follows **Semantic Versioning**:
- **MAJOR** — Breaking changes to skill APIs or skill removal
- **MINOR** — New skills, new features, non-breaking improvements
- **PATCH** — Bug fixes, documentation improvements, skill enhancements

New skills are added regularly and will increment the MINOR version.
