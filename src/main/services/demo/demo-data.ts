import type { EvoSkillResult, SkillClawResult, CoEvoResult, SkillXResult, EvoRunResult, ParetoPoint, TransferReport, Skill } from '../../../shared/types'

export const DEMO_SKILL_ID = 'demo-skill-codereview'

export const DEMO_SKILL_ORIGINAL = `---
name: CodeReview
version: 1.0.0
format: markdown
tags: [code, review, quality]
---

# Code Review Assistant

You are a code review assistant. Review the provided code and identify issues.

## Instructions
- Check for syntax errors
- Identify logic bugs
- Suggest improvements
`

// Full streamed content including ANALYSIS block (stripped before install)
export const DEMO_EVOLVED_STREAM = `<!--ANALYSIS
ROOT_CAUSE: Skill 缺少对"空输入"和"单行代码"边界场景的明确处理指令，导致模型在输入为空或极短时产生幻觉输出。
GENERALITY_TEST: 任何需要处理"零结果"场景的聚合类 Skill（如搜索、列表过滤）均可从此修复中获益。
REGRESSION_RISK: 仅在"输入验证"小节增加一条边界说明，不影响已通过的 Safety、Instruction Following 维度。
-->
---
name: CodeReview
version: 1.1.0
format: markdown
tags: [code, review, quality]
---

# Code Review Assistant

You are a code review assistant. Review the provided code and identify issues.

## Input Validation
- If input is empty or fewer than 3 lines, respond: "No code provided for review."
- If input is not code (plain text), respond: "Input does not appear to be code."

## Instructions
- Check for syntax errors and report line numbers
- Identify logic bugs with specific examples
- Suggest concrete improvements with code snippets
- Rate severity: Critical / Warning / Info

## Output Format
Always structure output as:
1. Summary (1-2 sentences)
2. Issues found (bulleted, with severity)
3. Suggestions (numbered)
`

export const DEMO_EVOLVED_CONTENT = DEMO_EVOLVED_STREAM.replace(/<!--ANALYSIS[\s\S]*?-->\s*/m, '')

export const DEMO_ORIG_SCORES: Record<string, number> = {
  correctness: 6.8, instruction_following: 7.2, safety: 8.1,
  completeness: 5.9, robustness: 6.2, executability: 7.5,
  cost_awareness: 7.8, maintainability: 6.5
}

export const DEMO_EVOLVED_SCORES: Record<string, number> = {
  correctness: 7.6, instruction_following: 7.8, safety: 8.2,
  completeness: 7.1, robustness: 7.3, executability: 8.0,
  cost_awareness: 7.9, maintainability: 7.4
}

const now = Date.now()

export const DEMO_EVOLVED_SKILL: Skill = {
  id: 'demo-skill-codereview-v1',
  name: 'CodeReview',
  format: 'markdown',
  version: '1.1.0',
  tags: ['code', 'review', 'quality'],
  yamlFrontmatter: 'name: CodeReview\nversion: 1.1.0\nformat: markdown\ntags: [code, review, quality]',
  markdownContent: DEMO_EVOLVED_CONTENT,
  filePath: '/demo/codereview-evolved.md',
  rootDir: '/demo',
  skillType: 'single',
  trustLevel: 1,
  installedAt: now,
  updatedAt: now
}

export const DEMO_EVO_RUN_RESULT: EvoRunResult = {
  evolvedSkill: DEMO_EVOLVED_SKILL,
  originalJobId: 'demo-orig-job',
  evolvedJobId: 'demo-evol-job'
}

export const DEMO_EVOSKILL_RESULT: EvoSkillResult = {
  frontierIds: ['demo-skill-codereview', 'demo-skill-codereview-v1', 'demo-skill-codereview-v2'],
  bestId: 'demo-skill-codereview-v2',
  iterations: 3,
  finalAvgScore: 8.1
}

export const DEMO_COEVO_RESULT: CoEvoResult = {
  evolvedContent: DEMO_EVOLVED_CONTENT,
  escalationLevel: 2,
  rounds: 4,
  passedAll: false
}

export const DEMO_SKILLX_RESULT: SkillXResult = {
  entries: [
    { level: 1, levelName: 'planning', content: '代码审查应先静态分析，再运行测试，最后生成报告', sourceCount: 4 },
    { level: 2, levelName: 'functional', content: '安全扫描子程序：grep → 过滤规则 → 格式化输出', sourceCount: 3 },
    { level: 3, levelName: 'atomic', content: '使用 read_file 时必须验证路径白名单', sourceCount: 5 }
  ],
  evolvedSkillId: 'demo-skill-codereview-v1',
  evolvedContent: DEMO_EVOLVED_CONTENT,
  totalSourceSamples: 8
}

export const DEMO_SKILLCLAW_RESULT: SkillClawResult = {
  sessionsAnalyzed: 20,
  commonFailures: [
    '空输入时产生幻觉输出，未按规范返回"No code provided"',
    '嵌套结构输出格式不一致，缺少 severity 标注'
  ],
  evolvedSkillId: 'demo-skill-codereview-v1',
  evolvedContent: DEMO_EVOLVED_CONTENT,
  improvementSummary: '针对两个高频失败模式进行了定向修复，预计 Completeness 和 Robustness 维度提升 1.0+ 分。'
}

export const DEMO_PARETO_POINTS: ParetoPoint[] = [
  { id: 'demo-skill-codereview', label: 'CodeReview v1.0', x: 7.0, y: 7.8 },
  { id: 'demo-skill-codereview-v1', label: 'CodeReview v1.1', x: 7.6, y: 7.9 },
  { id: 'demo-skill-codereview-v2', label: 'CodeReview v1.2', x: 8.1, y: 7.5 }
]

export const DEMO_TRANSFER_REPORT: TransferReport = {
  results: {
    'demo-provider-haiku': 0.74,
    'demo-provider-gpt4o': 0.59,
    'demo-provider-qwen': 0.79
  }
}
