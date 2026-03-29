/**
 * The BookLib Global Registry contains a list of industry-refined skills.
 * These are suggested to the user if their local search doesn't yield high-score results.
 */
export const SKILL_REGISTRY = [
  {
    id: "clean-code",
    name: "Clean Code",
    author: "Robert C. Martin",
    description: "Principles for readable, maintainable, and expressive code.",
    url: "https://raw.githubusercontent.com/booklib-ai/skills/main/skills/clean-code-reviewer/SKILL.md",
    keywords: ["naming", "functions", "classes", "refactor", "smells"]
  },
  {
    id: "effective-kotlin",
    name: "Effective Kotlin",
    author: "Marcin Moskała",
    description: "Best practices for safety, readability, and efficiency in Kotlin.",
    url: "https://raw.githubusercontent.com/booklib-ai/skills/main/skills/effective-kotlin/SKILL.md",
    keywords: ["kotlin", "null safety", "mutability", "coroutines"]
  },
  {
    id: "lean-startup",
    name: "The Lean Startup",
    author: "Eric Ries",
    description: "Scientific method for business and validated learning.",
    url: "https://raw.githubusercontent.com/booklib-ai/skills/main/skills/lean-startup/SKILL.md",
    keywords: ["mvp", "validated learning", "pivot", "startup experiments"]
  },
  {
    id: "system-design",
    name: "System Design Interview",
    author: "Alex Xu",
    description: "High-level patterns for scalability, estimation, and distributed systems.",
    url: "https://raw.githubusercontent.com/booklib-ai/skills/main/skills/system-design-interview/SKILL.md",
    keywords: ["scalability", "load balancer", "caching", "replication"]
  },
  {
    id: "superpowers-debug",
    name: "Superpowers Debugging",
    author: "obra",
    description: "Systematic debugging workflow from the Superpowers repo.",
    url: "https://raw.githubusercontent.com/obra/superpowers/main/skills/debugging.md",
    keywords: ["debugging", "troubleshooting", "systematic"]
  },
  {
    id: "anthropic-research",
    name: "Anthropic Research Guide",
    author: "Anthropic",
    description: "Advanced techniques for chain-of-thought and research-based tasks.",
    url: "https://raw.githubusercontent.com/anthropic-cookbook/main/skills/research.md",
    keywords: ["thinking", "chain of thought", "research", "deep dive"]
  },
  {
    id: "cursor-best-practices",
    name: "Cursor Rules Master",
    author: "community",
    description: "The most effective project-level rules from the Cursor community.",
    url: "https://raw.githubusercontent.com/cursorrules/collection/main/rules/typescript-react.md",
    keywords: ["react", "frontend", "architecture", "component"]
  },
  {
    id: "awesome-prompts",
    name: "Universal Role-player",
    author: "awesome-prompts",
    description: "A collection of 100+ expert personas from the 100k+ star Awesome Prompts repo.",
    url: "https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv",
    keywords: ["persona", "roleplay", "expert", "consultant"]
  }
];
