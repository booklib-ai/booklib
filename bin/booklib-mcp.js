#!/usr/bin/env node

import path from 'path';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BookLibSearcher } from "../lib/engine/searcher.js";
import { BookLibAuditor } from "../lib/engine/auditor.js";
import { BookLibHandoff } from "../lib/engine/handoff.js";
import { BookLibScanner } from "../lib/engine/scanner.js";
import { resolveBookLibPaths } from "../lib/paths.js";

const { skillsPath } = resolveBookLibPaths();
const searcher = new BookLibSearcher();
const auditor = new BookLibAuditor();
const handoff = new BookLibHandoff();
const scanner = new BookLibScanner();

const server = new Server(
  {
    name: "booklib-engine",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_skills",
        description: "Perform a semantic search across the BookLib expert library. Returns conceptual wisdom, frameworks, and pitfalls.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The conceptual or technical search query (e.g., 'handling nulls', 'lean startup pivot')",
            },
            limit: {
              type: "number",
              description: "Maximum results (default: 5)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "audit_content",
        description: "Performs a systematic expert audit of a file or text against a specific BookLib skill.",
        inputSchema: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              description: "The name of the skill to use (e.g., 'effective-kotlin', 'clean-code-reviewer')",
            },
            file_path: {
              type: "string",
              description: "The path to the file to audit.",
            },
          },
          required: ["skill_name", "file_path"],
        },
      },
      {
        name: "save_session_state",
        description: "Saves the current agent's progress, goal, and active skills to a handoff file for another agent to resume.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Optional session name (defaults to git branch)" },
            goal: { type: "string", description: "The ultimate objective of the session" },
            progress: { type: "string", description: "What has been achieved so far" },
            next: { type: "string", description: "The immediate next task for the next agent" },
            skills: { type: "string", description: "Comma-separated list of active BookLib skills" },
          },
          required: ["goal", "next"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_skills":
        const searchResults = await searcher.search(args.query, args.limit);
        return { content: [{ type: "text", text: JSON.stringify(searchResults, null, 2) }] };

      case "audit_content":
        const skillPath = path.join(skillsPath, args.skill_name);
        const auditReport = await auditor.audit(skillPath, args.file_path);
        return { content: [{ type: "text", text: auditReport }] };

      case "save_session_state":
        handoff.saveState(args);
        return { content: [{ type: "text", text: `Session state saved successfully for ${args.name || 'current branch'}.` }] };

      case "scan_project":
        const scanResults = await scanner.scan(args.directory || process.cwd());
        return { content: [{ type: "text", text: scanResults }] };

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BookLib Universal MCP Server running");
}

main().catch(console.error);
