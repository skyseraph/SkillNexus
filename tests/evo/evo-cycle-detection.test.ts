/**
 * tests/evo/evo-cycle-detection.test.ts
 *
 * Tests for studio:evolve ancestor chain cycle detection (MED-5 fix):
 * - Normal linear chain walks correctly
 * - Cycle in parent_skill_id chain is detected and breaks early
 * - Self-referencing skill is handled
 * - Long chain within limit is fully traversed
 * Pure logic — mirrors the visitedChain guard in studio.handler.ts.
 */

import { describe, it, expect } from 'vitest'

// ── Mirror ancestor walk from studio.handler.ts ───────────────────────────────

interface SkillNode {
  id: string
  parent_skill_id: string | null
  markdown_content: string
}

function walkAncestors(
  startId: string,
  getSkill: (id: string) => SkillNode | undefined,
  maxDepth = 20
): string[] {
  const visited: string[] = []
  const visitedChain = new Set<string>()
  let currentId: string | null = startId

  while (currentId && visited.length < maxDepth) {
    if (visitedChain.has(currentId)) break
    visitedChain.add(currentId)
    const skill = getSkill(currentId)
    if (!skill) break
    visited.push(currentId)
    currentId = skill.parent_skill_id
  }

  return visited
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(nodes: SkillNode[]): (id: string) => SkillNode | undefined {
  const map = new Map(nodes.map(n => [n.id, n]))
  return (id) => map.get(id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evo cycle detection — linear chain', () => {
  it('walks a simple 3-node chain', () => {
    const store = makeStore([
      { id: 'c', parent_skill_id: 'b', markdown_content: '' },
      { id: 'b', parent_skill_id: 'a', markdown_content: '' },
      { id: 'a', parent_skill_id: null, markdown_content: '' },
    ])
    const chain = walkAncestors('c', store)
    expect(chain).toEqual(['c', 'b', 'a'])
  })

  it('stops at root (null parent)', () => {
    const store = makeStore([
      { id: 'root', parent_skill_id: null, markdown_content: '' },
    ])
    const chain = walkAncestors('root', store)
    expect(chain).toEqual(['root'])
  })

  it('stops when skill not found', () => {
    const store = makeStore([
      { id: 'child', parent_skill_id: 'missing-parent', markdown_content: '' },
    ])
    const chain = walkAncestors('child', store)
    expect(chain).toEqual(['child'])
  })
})

describe('evo cycle detection — cycle handling', () => {
  it('breaks on direct cycle (A → B → A)', () => {
    const store = makeStore([
      { id: 'a', parent_skill_id: 'b', markdown_content: '' },
      { id: 'b', parent_skill_id: 'a', markdown_content: '' },
    ])
    const chain = walkAncestors('a', store)
    // Should visit a, b, then detect cycle back to a and stop
    expect(chain).toEqual(['a', 'b'])
    expect(chain.length).toBe(2)
  })

  it('breaks on self-reference (A → A)', () => {
    const store = makeStore([
      { id: 'a', parent_skill_id: 'a', markdown_content: '' },
    ])
    const chain = walkAncestors('a', store)
    expect(chain).toEqual(['a'])
  })

  it('breaks on 3-node cycle (A → B → C → A)', () => {
    const store = makeStore([
      { id: 'a', parent_skill_id: 'c', markdown_content: '' },
      { id: 'b', parent_skill_id: 'a', markdown_content: '' },
      { id: 'c', parent_skill_id: 'b', markdown_content: '' },
    ])
    const chain = walkAncestors('a', store)
    expect(chain.length).toBe(3)
    expect(new Set(chain).size).toBe(3) // no duplicates
  })
})

describe('evo cycle detection — depth limit', () => {
  it('stops at maxDepth even without a cycle', () => {
    const nodes: SkillNode[] = []
    for (let i = 0; i < 30; i++) {
      nodes.push({ id: `s${i}`, parent_skill_id: i < 29 ? `s${i + 1}` : null, markdown_content: '' })
    }
    const store = makeStore(nodes)
    const chain = walkAncestors('s0', store, 10)
    expect(chain.length).toBe(10)
  })
})
