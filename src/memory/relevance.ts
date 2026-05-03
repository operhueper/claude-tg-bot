/**
 * Keyword-based relevance scoring for memory graph nodes.
 * Used to rank nodes by how relevant they are to a given query/message.
 */

import type { MemoryGraph, MemoryNode } from "./types";

// Russian + English stopwords to skip during tokenization
const STOPWORDS = new Set([
  // Russian
  "и", "в", "не", "на", "с", "что", "а", "по", "к", "из", "за", "то", "как",
  "это", "но", "от", "же", "для", "до", "все", "они", "или", "бы", "так",
  "при", "есть", "уже", "его", "её", "их", "мне", "мы", "вы", "он", "она",
  "я", "ты", "вот", "тут", "там", "когда", "если", "чтобы", "потому", "хочу",
  "нужно", "надо", "можно", "нет", "да", "ещё", "только", "очень", "был",
  "были", "было", "будет", "буду", "просто", "тоже", "мой", "моя", "моё",
  "твой", "твоя", "свой", "меня", "тебя", "него", "неё", "этот", "эта",
  "были", "этого", "этой", "который", "которые", "которая", "которого",
  // English
  "the", "a", "an", "is", "it", "in", "on", "at", "to", "for", "of", "and",
  "or", "but", "not", "with", "by", "from", "be", "are", "was", "were", "do",
  "can", "will", "have", "has", "had", "this", "that", "these", "those", "my",
  "your", "his", "her", "its", "our", "their", "i", "you", "he", "she", "we",
  "they", "me", "him", "us", "them", "if", "so", "as", "up", "out", "about",
  "what", "how", "when", "where", "who", "which", "all", "also", "just", "than",
]);

/**
 * Tokenize a string: lowercase, split by non-word chars, filter stopwords and short tokens.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\W]+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t))
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Score a node against a query, combining:
 * - keyword match on label + tags + data values
 * - base score from importance + recency + mention count
 */
function scoreNode(node: MemoryNode, queryTokens: Set<string>, now: number): number {
  // Base score: importance (0.5) + recency decay (0.3) + log-mentions (0.2)
  const recencyMs = now - new Date(node.last_mentioned_at).getTime();
  const recencyDays = recencyMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-recencyDays / 30); // 30-day half-life
  const mentionScore = Math.min(Math.log(node.mention_count + 1) / 5, 1);
  const baseScore = node.importance * 0.5 + recencyScore * 0.3 + mentionScore * 0.2;

  if (queryTokens.size === 0) return baseScore;

  // Keyword match score
  const labelTokens = tokenize(node.label);
  const labelMatch = jaccard(queryTokens, labelTokens);

  // Tag match
  const tagTokens = new Set<string>();
  for (const tag of node.tags) {
    for (const t of tokenize(tag)) tagTokens.add(t);
  }
  const tagMatch = tagTokens.size > 0 ? jaccard(queryTokens, tagTokens) : 0;

  // Data value match (check string values in data object)
  let dataMatch = 0;
  const dataText = Object.values(node.data)
    .filter(v => typeof v === "string")
    .join(" ");
  if (dataText) {
    const dataTokens = tokenize(dataText);
    dataMatch = jaccard(queryTokens, dataTokens) * 0.5; // lower weight
  }

  // Exact partial match bonus: if any query token appears in the label
  let partialBonus = 0;
  const labelLower = node.label.toLowerCase();
  for (const t of queryTokens) {
    if (labelLower.includes(t)) {
      partialBonus = 0.2;
      break;
    }
  }

  const keywordScore = Math.min(labelMatch * 0.7 + tagMatch * 0.2 + dataMatch + partialBonus, 1.0);

  // Combine: if query provided, keyword match boosts score significantly
  return baseScore * 0.4 + keywordScore * 0.6;
}

/**
 * Rank nodes by relevance to a query string.
 * Returns top `limit` nodes sorted by score descending.
 */
export function rankNodesByQuery(
  graph: MemoryGraph,
  query: string,
  opts: { limit: number }
): MemoryNode[] {
  const queryTokens = tokenize(query);
  const now = Date.now();
  const nodes = Object.values(graph.nodes);

  return nodes
    .map(node => ({ node, score: scoreNode(node, queryTokens, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit)
    .map(x => x.node);
}
