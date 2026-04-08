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
import { detectResultSourceType } from '../lib/engine/synthesis-templates.js';
import { autoLink } from '../lib/engine/auto-linker.js';
import { buildGraphContext } from '../lib/engine/graph-injector.js';
import { graphActivatedSearch } from '../lib/engine/graph-search.js';
import { extractFromResults } from '../lib/engine/principle-extractor.js';
import { prioritizeLookupResults } from '../lib/engine/lookup-priority.js';
import { ContextMapBuilder } from '../lib/engine/context-map.js';

const { skillsPath } = resolveBookLibPaths();
const searcher = new BookLibSearcher();
const auditor = new BookLibAuditor();
const handoff = new BookLibHandoff();

const server = new Server(
  {
    name: "booklib-engine",
    version: "2.0.0",
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
        description: "Search BookLib for post-training API docs, team decisions, or expert knowledge. Prioritizes gap corrections, then team knowledge, then skills. Skip for standard patterns you already know.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What you need to know (e.g., 'supabase auth session handling')",
            },
            file: {
              type: "string",
              description: "Path to the file being worked on — adds language and component context",
            },
            limit: {
              type: "number",
              description: "Maximum results (default: 3)",
            },
            source: {
              type: "string",
              enum: ["all", "skills", "knowledge"],
              description: "Filter: 'all' (default), 'skills' (expert only), 'knowledge' (team/personal only)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "review",
        description: "Deep code review of a file against a named skill's principles. Returns structured findings with source citations.",
        inputSchema: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              description: "Skill to review against (e.g., 'effective-kotlin', 'clean-code-reviewer')",
            },
            file_path: {
              type: "string",
              description: "Path to the file to review",
            },
          },
          required: ["skill_name", "file_path"],
        },
      },
      {
        name: "remember",
        description: "Capture a team decision, pattern, or insight as a searchable knowledge node. Use when the user says 'remember this', makes a decision, or discovers something worth preserving.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short descriptive title (e.g., 'use PaymentIntents not Charges')",
            },
            content: {
              type: "string",
              description: "Detailed description in markdown. Leave empty for a stub.",
            },
            type: {
              type: "string",
              enum: ["insight", "decision", "pattern", "note", "research"],
              description: "Node type (default: 'insight')",
            },
            tags: {
              type: "string",
              description: "Comma-separated tags",
            },
            links: {
              type: "string",
              description: "Link targets as 'target:edge-type' pairs (e.g., 'auth:applies-to')",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "verify",
        description: "Check if a file's imports are covered by BookLib's index. Flags unknown post-training APIs that may need current docs.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Path to the source file to check" },
            auto_index: { type: "boolean", description: "Auto-index docs for unknown imports if configured" },
          },
          required: ["file_path"],
        },
      },
      {
        name: "guard",
        description: "Check if code contradicts captured team decisions. Use after writing code that touches architecture, API choices, or team conventions.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Path to the source file to check" },
          },
          required: ["file_path"],
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

        // Check context-map for post-training gap matches before generic search
        let contextMapHits = [];
        try {
          const mapPath = path.join(process.cwd(), '.booklib', 'context-map.json');
          const map = ContextMapBuilder.load(mapPath);
          if (map?.items?.length) {
            const queryLower = args.query.toLowerCase();
            contextMapHits = map.items.filter(item =>
              item.type === 'post-training' &&
              item.importTriggers.some(t => queryLower.includes(t.toLowerCase()))
            ).map(item => ({
              text: item.injection?.correction ?? item.id,
              score: 1.0,
              metadata: { nodeKind: 'context-map', source: item.source, type: item.type },
            }));
          }
        } catch { /* context map not available */ }

        // Prioritize: gap results first, then team knowledge, then skill results
        const gapResults = contextMapHits;
        const teamResults = filtered.filter(r => r.metadata?.nodeKind === 'knowledge');
        const nicheResults = filtered.filter(r => r.metadata?.nodeKind !== 'knowledge');
        const prioritized = prioritizeLookupResults({ gapResults, teamResults, nicheResults });

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
        const graphResult = graphActivatedSearch(args.query, prioritized);

        if (graphResult.activated && graphResult.graphResults.length > 0) {
          const limit = args.limit ?? 3;
          const textPrinciples = extractFromResults(prioritized, limit);
          // Skills first, graph context appended — never replace skill results
          const allPrinciples = [
            ...textPrinciples.slice(0, limit),
            ...graphResult.graphResults.slice(0, 2),
          ];

          return { content: [{ type: "text", text: JSON.stringify({
            query: args.query,
            file: args.file ?? null,
            concepts: graphResult.concepts,
            graphActivated: true,
            results: allPrinciples,
            note: `${textPrinciples.length} expert result(s), ${graphResult.graphResults.length} project context(s).`,
          }, null, 2) }] };
        }

        const sourceType = detectResultSourceType(prioritized);

        const structured = await processResults(args.query, prioritized, reasoningMode, {
          maxPrinciples: args.limit ?? 3,
          file: args.file,
          sourceType,
          apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
          apiProvider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
          ollamaModel,
        });
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
      }

      case "review":
      case "review_file":
      case "audit_content": {
        const skillPath = path.join(skillsPath, args.skill_name);
        const auditReport = await auditor.audit(skillPath, args.file_path);
        return { content: [{ type: "text", text: auditReport }] };
      }

      // brief: demoted from MCP tool list but still works as alias → lookup with file context
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

      // recalled: demoted from MCP tool list but still works as alias
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

      // connect: demoted from MCP tool list but still works as alias
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

      case "save":
      case "save_progress":
      case "save_session_state": {
        handoff.saveState(args);
        return { content: [{ type: "text", text: `Session state saved successfully for ${args.name || 'current branch'}.` }] };
      }

      case "verify":
      case "check_imports": {
        const { ImportChecker } = await import('../lib/engine/import-checker.js');

        let indexMode = 'manual';
        try {
          const cfgPath = path.join(process.cwd(), 'booklib.config.json');
          if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            indexMode = cfg.importChecking ?? 'manual';
          }
        } catch { /* use default */ }

        const checker = new ImportChecker({ searcher, indexMode });
        const resolved = path.resolve(args.file_path);
        const result = await checker.checkFile(resolved, process.cwd());

        const summary = {
          file: args.file_path,
          unknown: await Promise.all(result.unknown.map(async imp => {
            const docs = await checker.resolveDocsUrl(imp);
            return { module: imp.module, language: imp.language, docsUrl: docs.url };
          })),
          known: result.known.map(i => i.module),
          skipped: result.skipped.map(i => i.module),
          counts: {
            known: result.known.length,
            unknown: result.unknown.length,
            skipped: result.skipped.length,
          },
        };

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }

      case "guard":
      case "check_decisions": {
        const { DecisionChecker } = await import('../lib/engine/decision-checker.js');
        const checker = new DecisionChecker({ searcher });
        const filePath = path.resolve(args.file_path);
        const result = await checker.checkFile(filePath);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
