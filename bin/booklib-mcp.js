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
import { resolveBookLibPaths } from "../lib/paths.js";
import { ContextBuilder } from "../lib/context-builder.js";
import {
  serializeNode, saveNode, generateNodeId,
  listNodes, loadNode, parseNodeFrontmatter,
  resolveNodeRef, appendEdge, EDGE_TYPES,
} from "../lib/engine/graph.js";
import { BookLibIndexer } from "../lib/engine/indexer.js";
import { buildStructuredResponse } from "../lib/engine/structured-response.js";

const { skillsPath } = resolveBookLibPaths();
const searcher = new BookLibSearcher();
const auditor = new BookLibAuditor();
const handoff = new BookLibHandoff();

const server = new Server(
  {
    name: "booklib-engine",
    version: "1.2.0",
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
        description: "Use BEFORE reviewing code, answering best-practices questions, or suggesting patterns. Searches BookLib's expert library and returns relevant principles with citations.",
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
            file: {
              type: "string",
              description: "Optional: path to the file being worked on — provides language/domain context without reading content",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_knowledge",
        description: "Use for broader search that includes personal knowledge captured in this project. Returns results from both expert skills and saved insights/notes.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query (e.g. 'handling concurrency in Python')",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 8)",
            },
            source: {
              type: "string",
              enum: ["all", "skills", "knowledge"],
              description: "Filter by source: 'all' (default), 'skills', or 'knowledge'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "audit_content",
        description: "Use when the user asks for deep code review or quality analysis of a specific file. Audits against a named skill's principles and returns structured findings.",
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
        description: "Use when handing off to another agent or ending a long session. Saves progress, goals, and next steps so another agent can resume.",
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
      {
        name: "get_context",
        description: "Use at session start or when switching tasks to load relevant BookLib context for the current work. Returns combined wisdom from matched skills and knowledge graph.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task description (e.g. 'implement JWT refresh token rotation')",
            },
            file: {
              type: "string",
              description: "Optional: path to the file being edited — enables graph context injection for the owning component",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "create_note",
        description: "Use when the user discovers a useful pattern, says 'remember this', 'take a note', or 'capture this insight'. Creates a searchable knowledge node.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The note title (e.g. 'JWT refresh token strategy')",
            },
            content: {
              type: "string",
              description: "The note body (markdown supported). Leave empty to create a stub.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "list_nodes",
        description: "Use when the user asks 'what have I captured?' or wants to see saved knowledge. Lists all notes, insights, and research nodes.",
        inputSchema: {
          type: "object",
          properties: {
            type_filter: {
              type: "string",
              description: "Optional: filter by node type ('note', 'research', 'component', 'decision', 'feature')",
            },
          },
        },
      },
      {
        name: "link_nodes",
        description: "Use when the user says two concepts are related or wants to connect knowledge. Creates a typed relationship (see-also, applies-to, extends, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Source node — exact ID or partial title (e.g. 'JWT strategy')",
            },
            to: {
              type: "string",
              description: "Target node — exact ID or partial title (e.g. 'auth')",
            },
            type: {
              type: "string",
              enum: EDGE_TYPES,
              description: "Edge type",
            },
          },
          required: ["from", "to", "type"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_skills": {
        const results = await searcher.search(args.query, args.limit ?? 5, 0);
        const structured = buildStructuredResponse(args.query, results, {
          maxPrinciples: args.limit ?? 3,
          file: args.file,
        });
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
      }

      case "search_knowledge": {
        const raw = await searcher.search(args.query, args.limit ?? 8, 0);
        const sourceFilter = args.source ?? 'all';
        const filtered = raw
          .filter(r => {
            if (sourceFilter === 'skills') return r.metadata?.nodeKind !== 'knowledge';
            if (sourceFilter === 'knowledge') return r.metadata?.nodeKind === 'knowledge';
            return true;
          });
        const structured = buildStructuredResponse(args.query, filtered, {
          maxPrinciples: args.limit ?? 3,
          file: args.file,
        });
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
      }

      case "audit_content":
        const skillPath = path.join(skillsPath, args.skill_name);
        const auditReport = await auditor.audit(skillPath, args.file_path);
        return { content: [{ type: "text", text: auditReport }] };

      case "save_session_state":
        handoff.saveState(args);
        return { content: [{ type: "text", text: `Session state saved successfully for ${args.name || 'current branch'}.` }] };

      case "get_context": {
        const builder = new ContextBuilder();
        const result = args.file
          ? await builder.buildWithGraph(args.task, args.file)
          : await builder.build(args.task);
        return { content: [{ type: "text", text: result }] };
      }

      case "create_note": {
        const { nodesDir, indexPath } = resolveBookLibPaths();
        const id = generateNodeId('node');
        const nodeContent = serializeNode({
          id,
          type: 'note',
          title: args.title,
          content: args.content ?? '',
        });
        const filePath = saveNode(nodeContent, id, { nodesDir });
        try {
          const indexer = new BookLibIndexer(indexPath);
          await indexer.indexNodeFile(filePath, nodesDir);
        } catch {
          // Index may not exist yet — node is saved, will appear after booklib index
        }
        return { content: [{ type: "text", text: `Created note: ${id}\nTitle: ${args.title}\nFile: ${filePath}` }] };
      }

      case "list_nodes": {
        const { nodesDir } = resolveBookLibPaths();
        const allIds = listNodes({ nodesDir });
        const nodes = allIds
          .map(id => {
            const raw = loadNode(id, { nodesDir });
            if (!raw) return null;
            const parsed = parseNodeFrontmatter(raw);
            return { id, title: parsed.title ?? '', type: parsed.type ?? '' };
          })
          .filter(n => {
            if (!n) return false;
            if (args.type_filter) return n.type === args.type_filter;
            return true;
          });
        return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
      }

      case "link_nodes": {
        const fromId = resolveNodeRef(args.from);
        const toId = resolveNodeRef(args.to);
        if (!EDGE_TYPES.includes(args.type)) {
          throw new Error(`Invalid edge type "${args.type}". Valid: ${EDGE_TYPES.join(', ')}`);
        }
        const edge = {
          from: fromId,
          to: toId,
          type: args.type,
          weight: 1.0,
          created: new Date().toISOString().split('T')[0],
        };
        appendEdge(edge);
        return { content: [{ type: "text", text: `Edge created: ${fromId} --[${args.type}]--> ${toId}` }] };
      }

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
