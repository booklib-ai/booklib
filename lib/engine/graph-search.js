import { listNodes, loadNode, parseNodeFrontmatter, loadEdges, traverseEdges } from './graph.js';
import { extractKeywords } from './query-expander.js';

/**
 * Multi-dimensional graph-activated search.
 * Parses query into concepts, activates graph subregions for each,
 * scores nodes by how many concepts they connect to, merges with text search results.
 *
 * @param {string} query
 * @param {Array} textSearchResults - results from BookLibSearcher.search()
 * @param {object} opts
 * @param {string} [opts.nodesDir] - knowledge nodes directory
 * @param {string} [opts.graphFile] - graph.jsonl path
 * @returns {object} { concepts, graphResults, mergedResults, activated }
 */
export function graphActivatedSearch(query, textSearchResults = [], opts = {}) {
  const { nodesDir, graphFile } = opts;

  const concepts = extractConcepts(query);

  // Single concept or no concepts: skip graph activation — regular search is sufficient
  if (concepts.length < 2) {
    return {
      concepts,
      graphResults: [],
      mergedResults: textSearchResults,
      activated: false,
    };
  }

  const allNodeIds = listNodes({ nodesDir });
  const edges = loadEdges({ graphFile });
  const subgraphs = new Map();

  for (const concept of concepts) {
    const activated = activateSubgraph(concept, allNodeIds, edges, { nodesDir });
    subgraphs.set(concept, activated);
  }

  const nodeScores = scoreIntersections(subgraphs);

  const graphResults = [];
  for (const [nodeId, { score: intersectionScore, matchedConcepts }] of nodeScores.entries()) {
    if (intersectionScore < 2) continue;

    const raw = loadNode(nodeId, { nodesDir });
    if (!raw) continue;
    const parsed = parseNodeFrontmatter(raw);

    graphResults.push({
      principle: parsed.title ?? nodeId,
      context: (parsed.body ?? '').slice(0, 150),
      source: `project ${parsed.type ?? 'knowledge'}: ${nodeId}`,
      section: 'knowledge',
      matchedConcepts,
      intersectionScore,
    });
  }

  graphResults.sort((a, b) => b.intersectionScore - a.intersectionScore);

  const textPrinciples = textSearchResults.map(r => ({
    principle: r.text?.slice(0, 150) ?? '',
    context: '',
    source: r.metadata?.name ?? 'unknown',
    section: r.metadata?.type ?? 'content',
    matchedConcepts: [],
    intersectionScore: 0,
    score: r.score,
  }));

  const mergedResults = [...graphResults, ...textPrinciples];

  return {
    concepts,
    graphResults,
    mergedResults,
    activated: true,
  };
}

/**
 * Extract semantic concepts from a query.
 * Groups consecutive keywords into compound concepts.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function extractConcepts(query) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  // Collect runs of consecutive keywords from the original query
  const words = query.toLowerCase().split(/\s+/);
  const runs = [];
  let current = [];

  for (const word of words) {
    const isKeyword = keywords.includes(word);
    if (isKeyword) {
      current.push(word);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    runs.push(current);
  }

  // Split runs into concepts: compound terms (max 2 words) stay grouped,
  // longer runs are split into individual concepts
  const concepts = [];
  for (const run of runs) {
    if (run.length <= 2) {
      concepts.push(run.join(' '));
    } else {
      for (const word of run) {
        concepts.push(word);
      }
    }
  }

  return [...new Set(concepts)];
}

/**
 * Activate a subgraph for a single concept.
 * Finds matching nodes + their 1-hop neighbors.
 *
 * @param {string} concept
 * @param {string[]} allNodeIds
 * @param {Array} edges
 * @param {{ nodesDir?: string }} opts
 * @returns {Set<string>} activated node IDs
 */
function activateSubgraph(concept, allNodeIds, edges, { nodesDir } = {}) {
  const activated = new Set();
  const conceptWords = concept.split(/\s+/);

  for (const nodeId of allNodeIds) {
    const raw = loadNode(nodeId, { nodesDir });
    if (!raw) continue;
    const parsed = parseNodeFrontmatter(raw);

    const nodeText = `${parsed.title ?? ''} ${parsed.body ?? ''} ${(parsed.tags ?? []).join(' ')}`.toLowerCase();

    const matches = conceptWords.some(w => w.length > 2 && nodeText.includes(w));
    if (matches) {
      activated.add(nodeId);

      const neighbors = traverseEdges(nodeId, edges, 1);
      for (const { id } of neighbors) {
        activated.add(id);
      }
    }
  }

  return activated;
}

/**
 * Score nodes by how many concept subgraphs they appear in.
 *
 * @param {Map<string, Set<string>>} subgraphs
 * @returns {Map<string, { score: number, matchedConcepts: string[] }>}
 */
function scoreIntersections(subgraphs) {
  const scores = new Map();

  for (const [concept, activated] of subgraphs.entries()) {
    for (const nodeId of activated) {
      if (!scores.has(nodeId)) {
        scores.set(nodeId, { score: 0, matchedConcepts: [] });
      }
      const entry = scores.get(nodeId);
      entry.score++;
      entry.matchedConcepts.push(concept);
    }
  }

  return scores;
}
