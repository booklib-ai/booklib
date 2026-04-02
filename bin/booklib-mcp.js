#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
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
  resolveKnowledgePaths, parseCaptureLinkArgs,
} from "../lib/engine/graph.js";
import { BookLibIndexer } from "../lib/engine/indexer.js";
import { processResults } from "../lib/engine/reasoning-modes.js";
import { autoLink } from '../lib/engine/auto-linker.js';
import { buildGraphContext } from '../lib/engine/graph-injector.js';
import { graphActivatedSearch } from '../lib/engine/graph-search.js';
import { extractFromResults } from '../lib/engine/principle-extractor.js';

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
        name: "lookup",
        description: "Check BookLib when you're about to make a recommendation about code quality, architecture, or design patterns. Query with task description + domain (e.g., 'authentication patterns for spring boot'). Call once per distinct task, not per message. Skip for trivial tasks.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Task description + domain (e.g., 'error handling in kotlin coroutines')",
            },
            file: {
              type: "string",
              description: "Optional: path to the file being worked on — provides language/domain context without reading content",
            },
            limit: {
              type: "number",
              description: "Maximum results (default: 3)",
            },
            source: {
              type: "string",
              enum: ["all", "skills", "knowledge"],
              description: "Filter by source: 'all' (default), 'skills' (expert knowledge only), or 'knowledge' (personal insights only)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "review_file",
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
              description: "The path to the file to review.",
            },
          },
          required: ["skill_name", "file_path"],
        },
      },
      {
        name: "brief",
        description: "Use at task start or when switching context. Combines expert knowledge + personal insights + project component context into one briefing. Call once when starting a task, not repeatedly.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task description (e.g. 'implement JWT refresh token rotation')",
            },
            file: {
              type: "string",
              description: "Optional: path to the file being edited — enables component-level context from knowledge graph",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "remember",
        description: "Use when the user discovers a useful pattern, says 'remember this', 'take a note', or 'capture this insight'. Also when the user makes a decision worth preserving ('we decided to...', 'from now on...'). Creates a searchable knowledge node.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short descriptive title (e.g. 'JWT refresh token strategy')",
            },
            content: {
              type: "string",
              description: "Detailed description (markdown supported). Leave empty to create a stub.",
            },
            type: {
              type: "string",
              enum: ["insight", "decision", "pattern", "note", "research"],
              description: "Node type (default: 'insight')",
            },
            tags: {
              type: "string",
              description: "Comma-separated tags for categorization",
            },
            links: {
              type: "string",
              description: "Link targets — 'target:edge-type' pairs, e.g. 'auth:applies-to,security:see-also'",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "recalled",
        description: "Use when the user asks 'what have I captured?' or wants to see saved knowledge. Lists all notes, insights, and research nodes.",
        inputSchema: {
          type: "object",
          properties: {
            type_filter: {
              type: "string",
              description: "Optional: filter by type ('insight', 'decision', 'pattern', 'note', 'research')",
            },
          },
        },
      },
      {
        name: "connect",
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
      {
        name: "save_progress",
        description: "Use when handing off to another agent or ending a long session. Saves progress, goals, and next steps so another agent can resume.",
        inputSchema: {
          type: "object",
          properties: {
            goal: { type: "string", description: "The ultimate objective of the session" },
            next: { type: "string", description: "The immediate next task for whoever resumes" },
            progress: { type: "string", description: "What has been achieved so far" },
            name: { type: "string", description: "Optional session name (defaults to git branch)" },
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
      case "lookup":
      case "search_skills":
      case "search_knowledge": {
        const raw = await searcher.search(args.query, args.limit ?? 3, 0);
        const sourceFilter = args.source ?? 'all';
        const filtered = raw
          .filter(r => {
            if (sourceFilter === 'skills') return r.metadata?.nodeKind !== 'knowledge';
            if (sourceFilter === 'knowledge') return r.metadata?.nodeKind === 'knowledge';
            return true;
          });

        // Read config for reasoning mode + ollama model
        let reasoningMode = 'fast';
        let ollamaModel = 'phi3';
        try {
          const configPath = path.join(process.cwd(), 'booklib.config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            reasoningMode = config.reasoning ?? 'fast';
            ollamaModel = config.ollamaModel ?? 'phi3';
          }
        } catch { /* use default */ }

        // Try graph-activated search for multi-concept queries
        const graphResult = graphActivatedSearch(args.query, filtered);

        if (graphResult.activated && graphResult.graphResults.length > 0) {
          const limit = args.limit ?? 3;
          const textPrinciples = extractFromResults(filtered, limit);
          const allPrinciples = [
            ...graphResult.graphResults.slice(0, limit),
            ...textPrinciples,
          ].slice(0, limit);

          return { content: [{ type: "text", text: JSON.stringify({
            query: args.query,
            file: args.file ?? null,
            concepts: graphResult.concepts,
            graphActivated: true,
            results: allPrinciples,
            note: `${graphResult.graphResults.length} graph intersection(s), ${textPrinciples.length} text result(s).`,
          }, null, 2) }] };
        }

        const structured = await processResults(args.query, filtered, reasoningMode, {
          maxPrinciples: args.limit ?? 3,
          file: args.file,
          apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
          apiProvider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
          ollamaModel,
        });
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
      }

      case "review_file":
      case "audit_content": {
        const skillPath = path.join(skillsPath, args.skill_name);
        const auditReport = await auditor.audit(skillPath, args.file_path);
        return { content: [{ type: "text", text: auditReport }] };
      }

      case "brief":
      case "get_context": {
        const builder = new ContextBuilder();

        // Graph-first: if file provided, find component and linked knowledge
        let projectKnowledge = [];
        if (args.file) {
          try {
            const graphNodes = await buildGraphContext({
              filePath: args.file,
              taskContext: args.task,
              searcher,
            });
            projectKnowledge = graphNodes.map(node => ({
              insight: node.title,
              type: node.type,
              source: `project ${node.type}: ${node.id}`,
              body: node.body,
              score: node.score,
            }));
          } catch { /* graph traversal is best-effort */ }
        }

        // Expert knowledge from skill search
        const expertContext = await builder.build(args.task, { promptOnly: true });

        const structured = {
          task: args.task,
          file: args.file ?? null,
          project_knowledge: projectKnowledge,
          expert_knowledge: expertContext,
          note: projectKnowledge.length > 0
            ? `Graph context: ${projectKnowledge.length} linked node(s) for ${args.file}.`
            : 'No graph context — no file provided or no matching components.',
        };

        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
      }

      case "remember":
      case "create_note": {
        const { nodesDir } = resolveKnowledgePaths();
        const { indexPath } = resolveBookLibPaths();
        const id = generateNodeId('node');
        const nodeType = args.type ?? 'insight';
        const nodeContent = serializeNode({
          id,
          type: nodeType,
          title: args.title,
          content: args.content ?? '',
          tags: args.tags ? args.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          links: args.links,
        });
        const filePath = saveNode(nodeContent, id, { nodesDir });
        try {
          const indexer = new BookLibIndexer(indexPath);
          await indexer.indexNodeFile(filePath, nodesDir);
        } catch {
          // Index may not exist yet — node is saved, will appear after booklib index
        }
        // Process explicit links
        if (args.links) {
          const links = parseCaptureLinkArgs(args.links);
          const today = new Date().toISOString().split('T')[0];
          for (const link of links) {
            if (EDGE_TYPES.includes(link.type)) {
              appendEdge({ from: id, to: link.to, type: link.type, weight: 1.0, created: today });
            }
          }
        }
        // Auto-link to components and related knowledge
        let autoLinked = [];
        try {
          autoLinked = await autoLink({
            nodeId: id,
            title: args.title,
            content: args.content ?? '',
            tags: args.tags ? args.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          });
        } catch { /* best-effort */ }
        return { content: [{ type: "text", text: JSON.stringify({
          id,
          title: args.title,
          type: nodeType,
          saved_to: filePath,
          indexed: true,
          auto_linked: autoLinked.map(l => `${l.to} (${l.type}) — ${l.reason}`),
          note: `Saved and indexed.${autoLinked.length > 0 ? ` Auto-linked to ${autoLinked.length} node(s).` : ''}`
        }, null, 2) }] };
      }

      case "recalled":
      case "list_nodes": {
        const { nodesDir } = resolveKnowledgePaths();
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

      case "connect":
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

      case "save_progress":
      case "save_session_state": {
        handoff.saveState(args);
        return { content: [{ type: "text", text: `Session state saved successfully for ${args.name || 'current branch'}.` }] };
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
