import type { SkillScore5D } from '../../../shared/types'

export interface DiscoverySkill {
  id: string
  name: string
  description: string
  stars: number
  tags: string[]
  score5D: SkillScore5D
  content: string
}

export interface DiscoveryRepo {
  id: string
  name: string
  description: string
  stars: number
  author: string
  url: string
  tags: string[]
}

export const SKILLNET_SKILLS: DiscoverySkill[] = [
  {
    id: 'meeting-action-items',
    name: 'Meeting Action Items',
    description: '将会议记录整理为结构化行动项，含负责人和截止日期',
    stars: 342,
    tags: ['productivity', 'meeting', 'structured-output'],
    score5D: { safety: 8.5, completeness: 9.0, executability: 9.2, maintainability: 8.0, costAwareness: 7.5 },
    content: `---
name: Meeting Action Items
version: 1.0.0
format: markdown
tags: [productivity, meeting, structured-output]
---

# Meeting Action Items Extractor

从会议记录或对话中提取可执行的行动项。

## 输出格式

对每个行动项输出：
- **任务**: 具体要做的事
- **负责人**: 明确的责任人（如无法确定写"待定"）
- **截止日期**: 明确的日期或相对时间（如无则写"未指定"）
- **优先级**: 高/中/低

## 规则

1. 只提取明确承诺的行动，不推断隐含任务
2. 每个行动项独立成行，使用 checkbox 格式
3. 如果没有行动项，输出"本次会议无明确行动项"
4. 保持原始表述，不过度解读`
  },
  {
    id: 'code-review-security',
    name: 'Code Security Reviewer',
    description: '专注安全漏洞的代码审查，覆盖 OWASP Top 10',
    stars: 289,
    tags: ['security', 'code-review', 'owasp'],
    score5D: { safety: 9.5, completeness: 8.8, executability: 9.0, maintainability: 8.5, costAwareness: 8.0 },
    content: `---
name: Code Security Reviewer
version: 1.2.0
format: markdown
tags: [security, code-review, owasp]
---

# Code Security Reviewer

对代码进行以安全为核心的审查，重点识别 OWASP Top 10 及常见安全缺陷。

## 审查维度

1. **注入攻击** (SQL, Command, LDAP injection)
2. **认证与会话管理** 缺陷
3. **敏感数据暴露** (硬编码密钥、日志泄漏)
4. **XSS / CSRF** 跨站攻击
5. **不安全的反序列化**
6. **依赖组件漏洞**
7. **路径穿越** 文件操作

## 输出格式

对每个问题：
- 🔴 严重 / 🟡 中等 / 🟢 低风险
- 位置（文件名:行号）
- 问题描述（一句话）
- 修复建议（代码示例）`
  },
  {
    id: 'tech-blog-writer',
    name: 'Tech Blog Writer',
    description: '将技术概念转化为面向开发者的清晰博文',
    stars: 218,
    tags: ['writing', 'technical', 'blog'],
    score5D: { safety: 7.5, completeness: 8.5, executability: 8.8, maintainability: 7.8, costAwareness: 6.5 },
    content: `---
name: Tech Blog Writer
version: 1.0.0
format: markdown
tags: [writing, technical, blog]
---

# Tech Blog Writer

将技术主题或代码示例转化为面向开发者读者的高质量博客文章。

## 写作风格

- 开门见山，第一段说明读者能学到什么
- 用具体代码示例支撑每个论点
- 避免过度使用行话；必要术语给出简短定义
- 每节不超过 300 字
- 结尾给出可操作的下一步

## 结构模板

1. 标题（含核心关键词）
2. 引言（问题/场景）
3. 核心概念（2-4节）
4. 完整示例
5. 总结 + 延伸阅读`
  },
  {
    id: 'sql-query-optimizer',
    name: 'SQL Query Optimizer',
    description: '分析并优化 SQL 查询，给出索引建议和重写方案',
    stars: 176,
    tags: ['database', 'sql', 'performance'],
    score5D: { safety: 8.0, completeness: 8.5, executability: 9.5, maintainability: 8.0, costAwareness: 8.5 },
    content: `---
name: SQL Query Optimizer
version: 1.1.0
format: markdown
tags: [database, sql, performance]
---

# SQL Query Optimizer

分析 SQL 查询的性能问题，提供优化建议和重写方案。

## 分析步骤

1. **识别问题模式**: N+1 查询、全表扫描、无索引 JOIN、SELECT *
2. **评估影响**: 估算数据量和查询复杂度
3. **提出优化**:
   - 索引建议（哪个列，为什么）
   - 查询重写（提供改写后的 SQL）
   - 架构建议（如需要）

## 输出格式

\`\`\`
原始查询分析:
- 问题: [描述]
- 影响: [估算]

优化后:
\`\`\`sql
[改写后的 SQL]
\`\`\`
索引建议: CREATE INDEX ...
预期提升: [描述]
\`\`\``
  },
  {
    id: 'pr-description-writer',
    name: 'PR Description Writer',
    description: '根据 diff 或描述生成标准化 PR 描述，含测试计划',
    stars: 155,
    tags: ['git', 'engineering', 'documentation'],
    score5D: { safety: 7.8, completeness: 8.2, executability: 8.9, maintainability: 8.0, costAwareness: 7.0 },
    content: `---
name: PR Description Writer
version: 1.0.0
format: markdown
tags: [git, engineering, documentation]
---

# PR Description Writer

根据代码变更、提交信息或简要描述，生成规范的 Pull Request 描述。

## 模板

### Summary
[1-3 个要点，说明做了什么]

### Why
[解释变更的动机或背景]

### Changes
- [具体变更列表]

### Test Plan
- [ ] 单元测试已覆盖新逻辑
- [ ] 手动测试步骤: [具体步骤]
- [ ] 边界情况已考虑: [列举]

### Screenshots (if applicable)

## 规则

- 标题控制在 70 字符内
- 使用祈使语气（"Add", "Fix", "Update"，不用 "Added"）
- 不解释显而易见的内容`
  },
  {
    id: 'data-analysis-guide',
    name: 'Data Analysis Guide',
    description: '引导结构化数据分析，生成洞察和可视化建议',
    stars: 143,
    tags: ['data', 'analysis', 'visualization'],
    score5D: { safety: 7.5, completeness: 9.0, executability: 8.5, maintainability: 7.5, costAwareness: 7.0 },
    content: `---
name: Data Analysis Guide
version: 1.0.0
format: markdown
tags: [data, analysis, visualization]
---

# Data Analysis Guide

引导对数据集进行系统性分析，识别模式、异常和业务洞察。

## 分析框架

1. **数据概览**: 维度、类型、缺失值分布
2. **描述性统计**: 均值、中位数、标准差、百分位
3. **分布分析**: 识别偏态、多峰、异常值
4. **相关性**: 变量间的相关系数和潜在因果关系
5. **趋势**: 时间序列趋势（如适用）

## 输出

- 关键发现（3-5条）
- 可视化建议（图表类型 + 数据轴）
- 后续分析问题（深挖方向）`
  },
  {
    id: 'api-doc-writer',
    name: 'API Documentation Writer',
    description: '从代码或描述生成标准 OpenAPI 风格的接口文档',
    stars: 132,
    tags: ['api', 'documentation', 'openapi'],
    score5D: { safety: 8.0, completeness: 9.2, executability: 8.8, maintainability: 8.5, costAwareness: 7.5 },
    content: `---
name: API Documentation Writer
version: 1.0.0
format: markdown
tags: [api, documentation, openapi]
---

# API Documentation Writer

从代码片段、函数签名或自然语言描述生成完整的 API 文档。

## 文档结构

### Endpoint
\`METHOD /path\`

### Description
[一句话说明用途]

### Parameters
| 名称 | 类型 | 必填 | 描述 |
|------|------|------|------|

### Request Body (if applicable)
\`\`\`json
{ "example": "value" }
\`\`\`

### Response
| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误 |

### Example
\`\`\`curl
curl -X POST ...
\`\`\``
  },
  {
    id: 'refactor-advisor',
    name: 'Refactor Advisor',
    description: '分析代码重构机会，提供安全、渐进的重构计划',
    stars: 121,
    tags: ['refactoring', 'engineering', 'code-quality'],
    score5D: { safety: 8.5, completeness: 8.0, executability: 8.5, maintainability: 9.0, costAwareness: 7.5 },
    content: `---
name: Refactor Advisor
version: 1.0.0
format: markdown
tags: [refactoring, engineering, code-quality]
---

# Refactor Advisor

识别代码中的重构机会，提供安全且可分步执行的重构建议。

## 重构检查项

1. **重复代码** (DRY): 抽取公共逻辑
2. **过长函数**: 超过 30 行的函数分解
3. **过多参数**: 超过 4 个参数用对象封装
4. **条件复杂度**: 嵌套超过 3 层则重构
5. **命名不清**: 变量/函数名不表达意图

## 输出

对每个重构机会:
- 问题描述（一句话）
- 重构前 vs 重构后代码
- 风险评估（低/中/高）
- 建议的执行顺序`
  },
  {
    id: 'commit-message-writer',
    name: 'Commit Message Writer',
    description: '根据 diff 生成符合 Conventional Commits 规范的提交信息',
    stars: 118,
    tags: ['git', 'commit', 'conventional-commits'],
    score5D: { safety: 7.5, completeness: 8.0, executability: 9.5, maintainability: 8.0, costAwareness: 8.5 },
    content: `---
name: Commit Message Writer
version: 1.0.0
format: markdown
tags: [git, commit, conventional-commits]
---

# Commit Message Writer

从代码变更或描述生成符合 Conventional Commits 规范的提交信息。

## 格式

\`\`\`
<type>(<scope>): <description>

[optional body]

[optional footer]
\`\`\`

## Types

- feat: 新功能
- fix: 修复 bug
- docs: 文档变更
- refactor: 重构（无新功能/修复）
- test: 测试相关
- chore: 构建/工具链

## 规则

- description 使用祈使语气，不加句号，≤72 字符
- scope 为受影响的模块名（可选）
- body 解释"为什么"，不解释"做了什么"
- 重大变更在 footer 加 BREAKING CHANGE:`
  },
  {
    id: 'test-case-generator',
    name: 'Test Case Generator',
    description: '根据函数或需求描述生成全面的测试用例，含边界情况',
    stars: 107,
    tags: ['testing', 'qa', 'unit-test'],
    score5D: { safety: 8.0, completeness: 9.0, executability: 9.0, maintainability: 8.5, costAwareness: 7.8 },
    content: `---
name: Test Case Generator
version: 1.0.0
format: markdown
tags: [testing, qa, unit-test]
---

# Test Case Generator

根据函数签名、需求描述或代码片段生成全面的测试用例。

## 测试维度

1. **正常路径**: 典型输入的预期行为
2. **边界值**: 最小值、最大值、空值、零值
3. **异常路径**: 无效输入、类型错误、超限
4. **并发/副作用**: 重复调用、状态变化

## 输出格式

\`\`\`
测试用例 #N: [简短描述]
输入: [具体输入值]
预期输出: [期望结果]
测试类型: 正常/边界/异常
\`\`\`

## 规则

- 每个维度至少 2 个用例
- 边界情况优先于重复的正常用例
- 说明为什么这个用例重要`
  },
  {
    id: 'architecture-reviewer',
    name: 'Architecture Reviewer',
    description: '从可扩展性、维护性、安全性角度审查系统架构设计',
    stars: 98,
    tags: ['architecture', 'system-design', 'review'],
    score5D: { safety: 8.8, completeness: 8.5, executability: 8.0, maintainability: 9.0, costAwareness: 7.5 },
    content: `---
name: Architecture Reviewer
version: 1.0.0
format: markdown
tags: [architecture, system-design, review]
---

# Architecture Reviewer

审查系统架构设计，评估可扩展性、维护性和安全性风险。

## 评审维度

1. **单点故障**: 是否存在无冗余的关键路径
2. **数据流**: 数据从哪来、如何流转、存在哪
3. **接口契约**: 服务间边界是否清晰
4. **安全边界**: 认证/授权在哪层处理
5. **可观测性**: 日志、指标、告警是否完整
6. **成本效率**: 是否存在明显的过度设计

## 输出

- 总体评价（1段）
- 风险项（优先级排序）
- 改进建议（具体可操作）
- 保留的好设计（正向反馈）`
  },
  {
    id: 'email-professionalizer',
    name: 'Email Professionalizer',
    description: '将草稿邮件润色为专业、清晰的商务沟通',
    stars: 87,
    tags: ['writing', 'email', 'professional'],
    score5D: { safety: 7.5, completeness: 8.0, executability: 9.2, maintainability: 7.5, costAwareness: 8.0 },
    content: `---
name: Email Professionalizer
version: 1.0.0
format: markdown
tags: [writing, email, professional]
---

# Email Professionalizer

将随意的草稿邮件改写为专业、有礼且目的明确的商务邮件。

## 改写原则

1. **主题行**: 清晰说明邮件目的，不超过 50 字符
2. **开场**: 简短友好，直接说明来意
3. **正文**: 一个段落一个要点，去除冗余
4. **行动项**: 明确说明期望的回复或动作
5. **结尾**: 礼貌但简洁

## 语气调整

- 正式商务 → 专业但不生硬
- 内部沟通 → 简洁直接
- 客户沟通 → 礼貌且聚焦价值

## 保留原意

不改变核心意思，只改善表达方式`
  },
  {
    id: 'debug-assistant',
    name: 'Debug Assistant',
    description: '系统化分析错误信息和堆栈跟踪，定位根因并提供修复方向',
    stars: 76,
    tags: ['debugging', 'troubleshooting', 'engineering'],
    score5D: { safety: 8.0, completeness: 8.8, executability: 9.0, maintainability: 8.0, costAwareness: 8.0 },
    content: `---
name: Debug Assistant
version: 1.0.0
format: markdown
tags: [debugging, troubleshooting, engineering]
---

# Debug Assistant

系统化分析错误信息、堆栈跟踪和异常现象，帮助定位根本原因。

## 分析步骤

1. **识别错误类型**: 分类（运行时/逻辑/环境/配置）
2. **读取堆栈**: 从最底层 frame 开始，找到首次出现问题的代码
3. **假设根因**: 列出 2-3 个可能原因（按可能性排序）
4. **验证方法**: 对每个假设给出验证步骤
5. **修复建议**: 针对最可能的原因给出修复代码

## 信息收集

如果信息不足，主动询问：
- 完整错误信息（含堆栈）
- 触发条件（什么操作导致）
- 环境信息（版本、OS）
- 最近的变更`
  },
  {
    id: 'requirement-clarifier',
    name: 'Requirement Clarifier',
    description: '分析需求文档，识别歧义和缺失信息，生成澄清问题列表',
    stars: 65,
    tags: ['product', 'requirements', 'analysis'],
    score5D: { safety: 7.5, completeness: 8.5, executability: 8.5, maintainability: 8.0, costAwareness: 7.5 },
    content: `---
name: Requirement Clarifier
version: 1.0.0
format: markdown
tags: [product, requirements, analysis]
---

# Requirement Clarifier

分析需求文档或用户故事，识别歧义、缺失信息和潜在冲突。

## 分析维度

1. **歧义词汇**: "快速"、"简单"、"尽快"等需量化
2. **缺失场景**: 错误处理、边界情况、并发情况
3. **假设暴露**: 隐含但未明确的前提条件
4. **冲突检测**: 不同需求间的矛盾
5. **范围蔓延**: 超出核心目标的隐含需求

## 输出

**澄清问题列表**（按优先级排序）:
1. [问题] — 原因: [为什么需要澄清]

**假设清单**（如果直接回答）:
- 假设 X 意味着 Y

**风险提示**: [实现前需确认的关键点]`
  },
  {
    id: 'changelog-writer',
    name: 'Changelog Writer',
    description: '将 PR 列表或提交记录转化为面向用户的版本更新日志',
    stars: 54,
    tags: ['documentation', 'release', 'changelog'],
    score5D: { safety: 7.5, completeness: 8.0, executability: 9.0, maintainability: 8.0, costAwareness: 8.5 },
    content: `---
name: Changelog Writer
version: 1.0.0
format: markdown
tags: [documentation, release, changelog]
---

# Changelog Writer

将 PR 列表、提交记录或功能描述转化为面向用户的版本更新日志。

## 格式（Keep a Changelog）

\`\`\`markdown
## [版本号] - YYYY-MM-DD

### Added
- 新功能描述（用户视角）

### Changed
- 变更描述

### Fixed
- Bug 修复描述

### Removed
- 移除功能（如有）
\`\`\`

## 规则

- 从用户视角描述，不是开发者视角
- 避免技术实现细节
- 每条变更不超过一行
- 重大变更放在最前
- 合并同类项（不要每个小 fix 都单独列出）`
  },
  {
    id: 'interview-question-gen',
    name: 'Interview Question Generator',
    description: '根据职位和技能栈生成分层次的技术面试题库',
    stars: 48,
    tags: ['hiring', 'interview', 'hr'],
    score5D: { safety: 7.8, completeness: 8.5, executability: 8.8, maintainability: 7.5, costAwareness: 7.0 },
    content: `---
name: Interview Question Generator
version: 1.0.0
format: markdown
tags: [hiring, interview, hr]
---

# Interview Question Generator

根据职位描述和技能要求生成分层次的技术面试题，含参考答案要点。

## 题目层次

- **基础 (L1)**: 验证基本概念是否掌握
- **应用 (L2)**: 能否在实际场景中应用
- **深度 (L3)**: 对底层原理和边界的理解
- **设计 (L4)**: 系统设计和权衡思考

## 输出格式

### [技能领域]

**L2 - [题目]**
参考答案要点:
- 要点1
- 要点2
追问: [深入挖掘的问题]

## 规则

- 每个核心技能至少 2 道题
- 优先实际问题而非死记硬背
- 给出评分维度（什么样的回答是好的）`
  },
  {
    id: 'translation-localizer',
    name: 'Technical Translation',
    description: '技术文档翻译，保留代码块，适配目标语言技术术语习惯',
    stars: 43,
    tags: ['translation', 'localization', 'technical'],
    score5D: { safety: 7.5, completeness: 8.0, executability: 9.0, maintainability: 7.5, costAwareness: 8.0 },
    content: `---
name: Technical Translation
version: 1.0.0
format: markdown
tags: [translation, localization, technical]
---

# Technical Translation

翻译技术文档，保留代码块和格式，使用目标语言社区约定的技术术语。

## 规则

1. **代码块不翻译**: 保留原始代码，只翻译注释
2. **术语一致性**: 相同术语在全文使用统一译法
3. **本地化术语**: 使用目标语言社区惯用词（如 "函数" 而非 "功能"）
4. **保留格式**: Markdown 格式、标题层级、列表结构不变
5. **专有名词**: 库名、框架名、品牌名保留英文

## 术语处理

遇到无约定译法的术语，使用 "中文（English）" 格式首次出现时标注`
  },
  {
    id: 'incident-postmortem',
    name: 'Incident Postmortem Writer',
    description: '从事件描述生成标准化的 postmortem 文档，含根因分析和改进项',
    stars: 38,
    tags: ['devops', 'incident', 'postmortem'],
    score5D: { safety: 8.5, completeness: 9.0, executability: 8.5, maintainability: 8.5, costAwareness: 7.5 },
    content: `---
name: Incident Postmortem Writer
version: 1.0.0
format: markdown
tags: [devops, incident, postmortem]
---

# Incident Postmortem Writer

从事件描述、时间线或对话记录生成标准化的事后分析文档。

## 文档结构

### 事件摘要
- 影响范围、持续时间、严重等级

### 时间线
| 时间 | 事件 | 操作人 |
|------|------|--------|

### 根因分析
- 直接原因
- 根本原因（5 Why）

### 影响评估
- 用户影响
- 业务影响

### 恢复步骤
- 实际采取的步骤

### 改进措施
| 改进项 | 负责人 | 截止日期 | 优先级 |
|--------|--------|----------|--------|

## 语气规范

- 对事不对人，不指责个人
- 聚焦系统性问题
- 用"我们"而非"某人"`
  },
  {
    id: 'user-story-writer',
    name: 'User Story Writer',
    description: '将功能需求转化为标准格式的用户故事，含验收标准',
    stars: 32,
    tags: ['agile', 'product', 'user-story'],
    score5D: { safety: 7.5, completeness: 8.5, executability: 8.8, maintainability: 8.0, costAwareness: 7.5 },
    content: `---
name: User Story Writer
version: 1.0.0
format: markdown
tags: [agile, product, user-story]
---

# User Story Writer

将功能描述或需求转化为标准格式的用户故事，附带验收标准和故事点估算建议。

## 格式

**作为** [用户角色]，
**我希望** [完成某件事]，
**以便** [达到某个目标/价值]。

### 验收标准 (Given-When-Then)

- Given [前提条件]
- When [用户执行操作]
- Then [预期结果]

## 规则

- 一个故事只描述一个用户需求
- "以便"部分强调业务价值，不是技术实现
- 验收标准要可测试、可验证
- 故事点估算: 1/2/3/5/8（斐波那契）`
  },
  {
    id: 'system-prompt-optimizer',
    name: 'System Prompt Optimizer',
    description: '分析并优化 LLM System Prompt，提升指令清晰度和执行效果',
    stars: 28,
    tags: ['prompt-engineering', 'llm', 'optimization'],
    score5D: { safety: 8.5, completeness: 8.8, executability: 9.0, maintainability: 8.5, costAwareness: 9.0 },
    content: `---
name: System Prompt Optimizer
version: 1.0.0
format: markdown
tags: [prompt-engineering, llm, optimization]
---

# System Prompt Optimizer

分析 LLM System Prompt 的结构和质量，提供改进建议和优化版本。

## 评估维度

1. **目标清晰度**: 角色和任务是否明确
2. **约束完整性**: 禁止项、边界是否覆盖
3. **格式指令**: 输出格式是否具体
4. **示例质量**: few-shot 示例是否有代表性
5. **成本意识**: 是否有不必要的冗余

## 常见问题

- 角色定义过于宽泛
- 指令用词模糊（"helpful", "professional"）
- 缺少边界情况处理
- 重复内容浪费 token

## 输出

1. 当前 Prompt 评分（各维度 1-10）
2. 问题列表
3. 优化版本（附改动说明）`
  }
]

export const GITHUB_REPOS: DiscoveryRepo[] = [
  {
    id: 'awesome-claude-skills',
    name: 'awesome-claude-skills',
    description: '精选的 Claude Skill 集合，涵盖生产力、代码、写作等场景',
    stars: 1240,
    author: 'anthropics-community',
    url: 'https://github.com/anthropics-community/awesome-claude-skills',
    tags: ['collection', 'curated', 'productivity']
  },
  {
    id: 'forrestchang-karpathy-skills',
    name: 'andrej-karpathy-skills',
    description: 'Karpathy 编码准则的 Skill 实现，强调简洁和审慎',
    stars: 834,
    author: 'forrestchang',
    url: 'https://github.com/forrestchang/andrej-karpathy-skills',
    tags: ['engineering', 'best-practices', 'karpathy']
  },
  {
    id: 'skill-creator-toolkit',
    name: 'skill-creator-toolkit',
    description: '用于批量生成和测试 Skill 的工具链，含评测脚本',
    stars: 412,
    author: 'skillnexus-labs',
    url: 'https://github.com/skillnexus-labs/skill-creator-toolkit',
    tags: ['tooling', 'automation', 'testing']
  },
  {
    id: 'enterprise-skill-pack',
    name: 'enterprise-skill-pack',
    description: '企业场景 Skill 包：合规审查、报告生成、数据治理',
    stars: 287,
    author: 'enterprise-ai',
    url: 'https://github.com/enterprise-ai/enterprise-skill-pack',
    tags: ['enterprise', 'compliance', 'reporting']
  },
  {
    id: 'dev-workflow-skills',
    name: 'dev-workflow-skills',
    description: '开发工作流 Skill 集：代码审查、提交信息、文档生成',
    stars: 198,
    author: 'devtools-community',
    url: 'https://github.com/devtools-community/dev-workflow-skills',
    tags: ['development', 'workflow', 'git']
  }
]
