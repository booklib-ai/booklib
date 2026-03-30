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
import { ContextBuilder } from "../lib/context-builder.js";
import {
  serializeNode, saveNode, generateNodeId,
  listNodes, loadNode, parseNodeFrontmatter,
  resolveNodeRef, appendEdge,
} from "../lib/engine/graph.js";
import { BookLibIndexer } from "../lib/engine/indexer.js";

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
        name: "search_knowledge",
        description: "Semantic search across book skills and personal knowledge graph nodes. Returns ranked results with a 'source' field: 'skill' or 'knowledge'.",
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
      {
        name: "get_context",
        description: "Builds a compiled context prompt combining relevant book wisdom and personal knowledge graph nodes for a given task. Optionally provide a file path to also inject graph context for the owning component.",
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
        description: "Creates a knowledge node of type 'note' in the local knowledge graph and immediately indexes it for search.",
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
        description: "Lists all knowledge graph nodes with their id, title, and type.",
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
        description: "Creates a typed edge between two knowledge graph nodes. Accepts node IDs or partial title strings.",
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
              enum: ["implements","contradicts","extends","applies-to","see-also","inspired-by","supersedes","depends-on"],
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
      case "search_skills":
        const searchResults = await searcher.search(args.query, args.limit);
        return { content: [{ type: "text", text: JSON.stringify(searchResults, null, 2) }] };

      case "search_knowledge": {
        const raw = await searcher.search(args.query, args.limit ?? 8);
        const sourceFilter = args.source ?? 'all';
        const results = raw
          .filter(r => {
            if (sourceFilter === 'skills') return r.metadata?.nodeKind !== 'knowledge';
            if (sourceFilter === 'knowledge') return r.metadata?.nodeKind === 'knowledge';
            return true;
          })
          .map(r => ({
            source: r.metadata?.nodeKind === 'knowledge' ? 'knowledge' : 'skill',
            title: r.metadata?.title ?? r.metadata?.skill ?? 'unknown',
            text: r.text,
            score: r.score,
          }));
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

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
        const VALID_TYPES = ['implements','contradicts','extends','applies-to','see-also','inspired-by','supersedes','depends-on'];
        if (!VALID_TYPES.includes(args.type)) {
          throw new Error(`Invalid edge type "${args.type}". Valid: ${VALID_TYPES.join(', ')}`);
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
