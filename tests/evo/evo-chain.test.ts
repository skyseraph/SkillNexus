/**
 * tests/evo/evo-chain.test.ts
 *
 * Pure logic tests for skills:getEvoChain handler:
 * - BFS traversal from root to all descendants
 * - Root node identification (no parent_skill_id)
 * - Walk-up to find root from any descendant
 * - avgScore computation from eval history
 * - Cycle detection (max 50 nodes guard)
 * - Chain ordering (BFS = breadth-first, installedAt ascending)
 * No Electron / DB.
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkillNode {
  id: string
  name: string
  version: string
  installedAt: number
  parentSkillId: string | null
  evolutionNotes: string | null
}

interface EvoChainEntry {
  id: string
  name: string
  version: string
  installedAt: number
  paradigm?: string
  avgScore?: number
  evolutionNotes?: { rootCause: string; generalityTest: string; regressionRisk: string }
  isRoot: boolean
}

// ── Mirrors skills.handler.ts getEvoChain logic ───────────────────────────────

function buildSkillGraph(nodes: SkillNode[]): Map<string, SkillNode> {
  return new Map(nodes.map(n => [n.id, n]))
}

function buildChildrenMap(nodes: SkillNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parentSkillId) {
      const children = map.get(node.parentSkillId) ?? []
      children.push(node.id)
      map.set(node.parentSkillId, children)
    }
  }
  return map
}

function findRoot(startId: string, graph: Map<string, SkillNode>): string {
  let rootId = startId
  const visited = new Set<string>()
  let cursor = graph.get(startId)
  while (cursor?.parentSkillId && !visited.has(cursor.parentSkillId)) {
    visited.add(cursor.id)
    rootId = cursor.parentSkillId
    cursor = graph.get(cursor.parentSkillId)
  }
  return rootId
}

function bfsChain(
  rootId: string,
  graph: Map<string, SkillNode>,
  childrenMap: Map<string, string[]>,
  maxNodes = 50
): SkillNode[] {
  const chain: SkillNode[] = []
  const queue: string[] = [rootId]
  const seen = new Set<string>()

  while (queue.length > 0 && chain.length < maxNodes) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = graph.get(id)
    if (!node) continue
    chain.push(node)
    const children = (childrenMap.get(id) ?? []).sort((a, b) => {
      const na = graph.get(a)!.installedAt
      const nb = graph.get(b)!.installedAt
      return na - nb
    })
    for (const c of children) queue.push(c)
  }
  return chain
}

function parseEvolutionNotes(notes: string | null): { paradigm?: string; evolutionNotes?: EvoChainEntry['evolutionNotes'] } {
  if (!notes) return {}
  try {
    const p = JSON.parse(notes) as Record<string, string>
    return {
      paradigm: p.paradigm,
      evolutionNotes: {
        rootCause: p.rootCause ?? '',
        generalityTest: p.generalityTest ?? '',
        regressionRisk: p.regressionRisk ?? ''
      }
    }
  } catch { return {} }
}

function computeAvgScore(scores: Record<string, { score: number }>): number {
  const vals = Object.values(scores).map(v => v.score)
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function buildChainEntries(
  nodes: SkillNode[],
  avgScoreMap: Map<string, number>
): EvoChainEntry[] {
  return nodes.map(node => {
    const { paradigm, evolutionNotes } = parseEvolutionNotes(node.evolutionNotes)
    return {
      id: node.id,
      name: node.name,
      version: node.version,
      installedAt: node.installedAt,
      paradigm,
      avgScore: avgScoreMap.get(node.id),
      evolutionNotes,
      isRoot: !node.parentSkillId
    }
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NODE_V10: SkillNode = { id: 'skill-v10', name: 'CodeReview', version: '1.0.0', installedAt: 1000, parentSkillId: null, evolutionNotes: null }
const NODE_V11: SkillNode = { id: 'skill-v11', name: 'CodeReview', version: '1.1.0', installedAt: 2000, parentSkillId: 'skill-v10', evolutionNotes: JSON.stringify({ paradigm: 'evidence', rootCause: 'Missing boundary guard', generalityTest: 'Any generative skill', regressionRisk: 'None' }) }
const NODE_V12: SkillNode = { id: 'skill-v12', name: 'CodeReview', version: '1.2.0', installedAt: 3000, parentSkillId: 'skill-v11', evolutionNotes: JSON.stringify({ paradigm: 'evoskill', rootCause: 'Weak completeness', generalityTest: 'Structured output skills', regressionRisk: 'cost_awareness may increase' }) }

// ── findRoot ──────────────────────────────────────────────────────────────────

describe('findRoot — walk up to root node', () => {
  const graph = buildSkillGraph([NODE_V10, NODE_V11, NODE_V12])

  it('returns self when node has no parent (is root)', () => {
    expect(findRoot('skill-v10', graph)).toBe('skill-v10')
  })

  it('returns root when starting from direct child', () => {
    expect(findRoot('skill-v11', graph)).toBe('skill-v10')
  })

  it('returns root when starting from grandchild', () => {
    expect(findRoot('skill-v12', graph)).toBe('skill-v10')
  })

  it('handles single-node graph', () => {
    const singleGraph = buildSkillGraph([NODE_V10])
    expect(findRoot('skill-v10', singleGraph)).toBe('skill-v10')
  })

  it('handles unknown id gracefully (returns the id itself)', () => {
    expect(findRoot('nonexistent', graph)).toBe('nonexistent')
  })
})

// ── bfsChain ──────────────────────────────────────────────────────────────────

describe('bfsChain — BFS traversal from root', () => {
  const graph = buildSkillGraph([NODE_V10, NODE_V11, NODE_V12])
  const childrenMap = buildChildrenMap([NODE_V10, NODE_V11, NODE_V12])

  it('returns all nodes in BFS order (root first)', () => {
    const chain = bfsChain('skill-v10', graph, childrenMap)
    expect(chain).toHaveLength(3)
    expect(chain[0].id).toBe('skill-v10')
  })

  it('root is always first in chain', () => {
    const chain = bfsChain('skill-v10', graph, childrenMap)
    expect(chain[0].id).toBe('skill-v10')
  })

  it('linear chain preserves version order', () => {
    const chain = bfsChain('skill-v10', graph, childrenMap)
    expect(chain.map(n => n.id)).toEqual(['skill-v10', 'skill-v11', 'skill-v12'])
  })

  it('respects maxNodes limit', () => {
    const chain = bfsChain('skill-v10', graph, childrenMap, 2)
    expect(chain).toHaveLength(2)
  })

  it('handles single-node graph', () => {
    const singleGraph = buildSkillGraph([NODE_V10])
    const singleChildren = buildChildrenMap([NODE_V10])
    const chain = bfsChain('skill-v10', singleGraph, singleChildren)
    expect(chain).toHaveLength(1)
    expect(chain[0].id).toBe('skill-v10')
  })

  it('handles branching tree (two children of root)', () => {
    const branchA: SkillNode = { id: 'branch-a', name: 'S', version: '1.1.0', installedAt: 2000, parentSkillId: 'skill-v10', evolutionNotes: null }
    const branchB: SkillNode = { id: 'branch-b', name: 'S', version: '1.1.1', installedAt: 2100, parentSkillId: 'skill-v10', evolutionNotes: null }
    const g = buildSkillGraph([NODE_V10, branchA, branchB])
    const cm = buildChildrenMap([NODE_V10, branchA, branchB])
    const chain = bfsChain('skill-v10', g, cm)
    expect(chain).toHaveLength(3)
    expect(chain[0].id).toBe('skill-v10')
    // branchA (installedAt 2000) should come before branchB (installedAt 2100)
    expect(chain[1].id).toBe('branch-a')
    expect(chain[2].id).toBe('branch-b')
  })

  it('does not revisit nodes (cycle guard via seen set)', () => {
    // Simulate a cycle by manually creating a circular reference in graph
    const cycleNode: SkillNode = { id: 'cycle', name: 'C', version: '1.0.0', installedAt: 4000, parentSkillId: 'skill-v10', evolutionNotes: null }
    const g = buildSkillGraph([NODE_V10, cycleNode])
    // Manually add cycle-v10 as child of cycle (not possible via buildChildrenMap, inject directly)
    const cm = new Map<string, string[]>([
      ['skill-v10', ['cycle']],
      ['cycle', ['skill-v10']]  // artificial cycle
    ])
    const chain = bfsChain('skill-v10', g, cm, 50)
    // Should not loop infinitely; seen set prevents revisit
    expect(chain.length).toBeLessThanOrEqual(2)
  })
})

// ── buildChainEntries ─────────────────────────────────────────────────────────

describe('buildChainEntries — EvoChainEntry construction', () => {
  const avgScoreMap = new Map([['skill-v10', 6.8], ['skill-v11', 7.4], ['skill-v12', 8.1]])

  it('marks root node with isRoot = true', () => {
    const entries = buildChainEntries([NODE_V10, NODE_V11, NODE_V12], avgScoreMap)
    expect(entries[0].isRoot).toBe(true)
  })

  it('marks non-root nodes with isRoot = false', () => {
    const entries = buildChainEntries([NODE_V10, NODE_V11, NODE_V12], avgScoreMap)
    expect(entries[1].isRoot).toBe(false)
    expect(entries[2].isRoot).toBe(false)
  })

  it('includes avgScore from map', () => {
    const entries = buildChainEntries([NODE_V10, NODE_V11, NODE_V12], avgScoreMap)
    expect(entries[0].avgScore).toBe(6.8)
    expect(entries[1].avgScore).toBe(7.4)
    expect(entries[2].avgScore).toBe(8.1)
  })

  it('avgScore is undefined when not in map', () => {
    const entries = buildChainEntries([NODE_V10], new Map())
    expect(entries[0].avgScore).toBeUndefined()
  })

  it('parses paradigm from evolutionNotes', () => {
    const entries = buildChainEntries([NODE_V11], avgScoreMap)
    expect(entries[0].paradigm).toBe('evidence')
  })

  it('parses rootCause from evolutionNotes', () => {
    const entries = buildChainEntries([NODE_V11], avgScoreMap)
    expect(entries[0].evolutionNotes?.rootCause).toBe('Missing boundary guard')
  })

  it('paradigm and evolutionNotes are undefined for root with no notes', () => {
    const entries = buildChainEntries([NODE_V10], avgScoreMap)
    expect(entries[0].paradigm).toBeUndefined()
    expect(entries[0].evolutionNotes).toBeUndefined()
  })

  it('handles malformed evolutionNotes JSON gracefully', () => {
    const badNode: SkillNode = { ...NODE_V11, evolutionNotes: '{broken json' }
    const entries = buildChainEntries([badNode], avgScoreMap)
    expect(entries[0].paradigm).toBeUndefined()
  })
})

// ── computeAvgScore ───────────────────────────────────────────────────────────

describe('computeAvgScore — eval history aggregation for chain', () => {
  it('averages 8 dimension scores correctly', () => {
    const scores = {
      correctness:           { score: 8 },
      instruction_following: { score: 7 },
      safety:                { score: 9 },
      completeness:          { score: 6 },
      robustness:            { score: 7 },
      executability:         { score: 8 },
      cost_awareness:        { score: 7 },
      maintainability:       { score: 8 }
    }
    // (8+7+9+6+7+8+7+8)/8 = 60/8 = 7.5
    expect(computeAvgScore(scores)).toBe(7.5)
  })

  it('returns 0 for empty scores', () => {
    expect(computeAvgScore({})).toBe(0)
  })

  it('returns 10 for all-perfect scores', () => {
    const scores = Object.fromEntries(
      ['correctness', 'instruction_following', 'safety', 'completeness', 'robustness', 'executability', 'cost_awareness', 'maintainability']
        .map(d => [d, { score: 10 }])
    )
    expect(computeAvgScore(scores)).toBe(10)
  })
})
