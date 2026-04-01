import fs from 'node:fs';
import path from 'node:path';
import {
  listNodes, loadNode, parseNodeFrontmatter,
  appendEdge, loadEdges,
} from './graph.js';

/**
 * Auto-links a newly created knowledge node to:
 * 1. Matching project components (by keyword in title/content)
 * 2. Related existing knowledge nodes (by semantic similarity via search)
 *
 * @param {object} opts
 * @param {string} opts.nodeId - the new node's ID
 * @param {string} opts.title - node title
 * @param {string} [opts.content] - node content
 * @param {string[]} [opts.tags] - node tags
 * @param {string} [opts.nodesDir] - knowledge nodes directory
 * @param {string} [opts.graphFile] - graph.jsonl path
 * @returns {Promise<Array<{from: string, to: string, type: string, reason: string}>>}
 */
export async function autoLink({ nodeId, title, content = '', tags = [], nodesDir, graphFile }) {
  const links = [];
  const existingEdges = loadEdges({ graphFile });
  const allNodeIds = listNodes({ nodesDir });
  const today = new Date().toISOString().split('T')[0];

  // Step 1: Component matching — find components whose name appears in title/content
  const searchText = `${title} ${content} ${tags.join(' ')}`.toLowerCase();

  for (const id of allNodeIds) {
    if (id === nodeId) continue;
    const raw = loadNode(id, { nodesDir });
    if (!raw) continue;
    const parsed = parseNodeFrontmatter(raw);

    // Only match against components
    if (parsed.type !== 'component') continue;

    const componentName = (parsed.title ?? '').toLowerCase();
    if (!componentName) continue;

    // Check if component name (or significant words from it) appears in the new node's text
    const nameWords = componentName.split(/[\s\-_]+/).filter(w => w.length > 2);
    const matches = nameWords.some(word => searchText.includes(word));

    if (matches && !edgeExists(existingEdges, nodeId, id)) {
      const edge = { from: nodeId, to: id, type: 'applies-to', weight: 1.0, created: today };
      appendEdge(edge, { graphFile });
      links.push({ from: nodeId, to: id, type: 'applies-to', reason: `component name match: "${parsed.title}"` });
    }
  }

  // Step 2: Knowledge matching — find related existing notes by title similarity
  // Simple approach: check if significant words from the new title appear in existing node titles
  const titleWords = title.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3);

  for (const id of allNodeIds) {
    if (id === nodeId) continue;
    if (links.length >= 3) break; // cap at 3 auto-links

    const raw = loadNode(id, { nodesDir });
    if (!raw) continue;
    const parsed = parseNodeFrontmatter(raw);

    // Skip components (already handled above)
    if (parsed.type === 'component') continue;

    const existingTitle = (parsed.title ?? '').toLowerCase();
    if (!existingTitle) continue;

    // Check for word overlap between titles
    const existingWords = existingTitle.split(/[\s\-_]+/).filter(w => w.length > 3);
    const overlap = titleWords.filter(w => existingWords.includes(w));

    if (overlap.length >= 1 && !edgeExists(existingEdges, nodeId, id)) {
      const edge = { from: nodeId, to: id, type: 'see-also', weight: 1.0, created: today };
      appendEdge(edge, { graphFile });
      links.push({ from: nodeId, to: id, type: 'see-also', reason: `related knowledge: "${parsed.title}"` });
    }
  }

  return links;
}

/**
 * Reverse auto-link: when a new component is created, find existing notes
 * that mention the component name and link them.
 */
export async function autoLinkReverse({ componentId, componentTitle, nodesDir, graphFile }) {
  const links = [];
  const existingEdges = loadEdges({ graphFile });
  const allNodeIds = listNodes({ nodesDir });
  const today = new Date().toISOString().split('T')[0];
  const nameWords = componentTitle.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 2);

  for (const id of allNodeIds) {
    if (id === componentId) continue;
    const raw = loadNode(id, { nodesDir });
    if (!raw) continue;
    const parsed = parseNodeFrontmatter(raw);
    if (parsed.type === 'component') continue;

    const nodeText = `${parsed.title ?? ''} ${parsed.body ?? ''}`.toLowerCase();
    const matches = nameWords.some(word => nodeText.includes(word));

    if (matches && !edgeExists(existingEdges, id, componentId)) {
      const edge = { from: id, to: componentId, type: 'applies-to', weight: 1.0, created: today };
      appendEdge(edge, { graphFile });
      links.push({ from: id, to: componentId, type: 'applies-to', reason: `mentions component: "${componentTitle}"` });
    }
  }

  return links;
}

function edgeExists(edges, from, to) {
  return edges.some(e =>
    (e.from === from && e.to === to) ||
    (e.from === to && e.to === from)
  );
}
