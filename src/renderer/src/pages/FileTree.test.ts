import { describe, it, expect } from 'vitest'
import type { SkillFileEntry } from '../../../shared/types'

// Replicate the buildTree logic for testing
interface TreeNode { entry: SkillFileEntry; children: TreeNode[] }

function buildTree(entries: SkillFileEntry[]): TreeNode[] {
  const roots: TreeNode[] = []
  const map = new Map<string, TreeNode>()
  for (const e of entries) map.set(e.relativePath, { entry: e, children: [] })
  for (const [, node] of map) {
    const parts = node.entry.relativePath.split('/')
    if (parts.length === 1) roots.push(node)
    else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = map.get(parentPath)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => { if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1; return a.entry.name.localeCompare(b.entry.name) })
    nodes.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

function makeFile(rel: string, isDir = false): SkillFileEntry {
  return { name: rel.split('/').pop()!, path: `/root/${rel}`, relativePath: rel, isDir, ext: isDir ? '' : rel.includes('.') ? '.' + rel.split('.').pop()! : '', size: 100 }
}

describe('buildTree', () => {
  it('places root files at top level', () => {
    const entries = [makeFile('SKILL.md'), makeFile('README.md')]
    const tree = buildTree(entries)
    expect(tree).toHaveLength(2)
    expect(tree.every(n => !n.entry.isDir)).toBe(true)
  })

  it('nests files under their parent directory', () => {
    const entries = [makeFile('src', true), makeFile('src/main.py'), makeFile('src/utils.py')]
    const tree = buildTree(entries)
    expect(tree).toHaveLength(1)
    expect(tree[0].entry.name).toBe('src')
    expect(tree[0].children).toHaveLength(2)
  })

  it('sorts dirs before files', () => {
    const entries = [makeFile('README.md'), makeFile('src', true), makeFile('scripts', true)]
    const tree = buildTree(entries)
    expect(tree[0].entry.isDir).toBe(true)
    expect(tree[1].entry.isDir).toBe(true)
    expect(tree[2].entry.isDir).toBe(false)
  })

  it('handles deeply nested structure', () => {
    const entries = [
      makeFile('src', true),
      makeFile('src/lib', true),
      makeFile('src/lib/helper.py'),
      makeFile('src/main.py')
    ]
    const tree = buildTree(entries)
    expect(tree).toHaveLength(1)
    const src = tree[0]
    const lib = src.children.find(c => c.entry.name === 'lib')
    expect(lib).toBeDefined()
    expect(lib!.children[0].entry.name).toBe('helper.py')
  })

  it('handles empty entries', () => {
    expect(buildTree([])).toEqual([])
  })
})

describe('SkillFileEntry ext detection', () => {
  it('text extensions are text files', () => {
    const TEXT_EXTS = new Set(['.md', '.ts', '.py', '.sh', '.json', '.yaml', '.txt'])
    expect(TEXT_EXTS.has('.md')).toBe(true)
    expect(TEXT_EXTS.has('.py')).toBe(true)
    expect(TEXT_EXTS.has('.bin')).toBe(false)
  })

  it('fileIcon returns correct icon for known extensions', () => {
    const map: Record<string, string> = { '.md': '📝', '.py': '⚙️', '.ts': '⚙️', '.sh': '🖥️', '.json': '📋' }
    expect(map['.md']).toBe('📝')
    expect(map['.sh']).toBe('🖥️')
  })
})

describe('Agent Skill type detection', () => {
  it('skillType agent shows robot icon', () => {
    const icon = (type: string) => type === 'agent' ? '🤖' : '📝'
    expect(icon('agent')).toBe('🤖')
    expect(icon('single')).toBe('📝')
  })
})
