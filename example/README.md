# SkillNexus — 示例案例

四个完整的 Skill 案例，覆盖 Studio 生成 → Eval 评测 → Evo 进化全链路。

---

## 案例目录

| 目录 | Skill | 进化路径 | 均分提升 |
|------|-------|---------|---------:|
| [`codereview/`](codereview/README.md) | CodeReview — 代码审查助手 | SkVM 证据驱动 → EvoSkill | 6.8 → 8.1（+1.3） |
| [`commit-message/`](commit-message/README.md) | CommitMessage — 提交信息生成器 | SkVM 证据驱动 → EvoSkill | 5.9 → 8.4（+2.5） |
| [`agent-skill/`](agent-skill/README.md) | PR Review Agent — 多步骤 PR 审查 Agent | Agent Skill 示例（三子 Skill 编排） | — |
| [`deep-research/`](deep-research/README.md) | Deep Research Agent — 深度研究 Agent | SkVM 证据驱动（反幻觉强化） | 6.6 → 8.9（+2.3） |

---

## 目录结构（每个案例相同）

```
<case>/
  skills/
    *-v1.0.md     ← 原始版本（Studio 生成或手动编写）
    *-v1.1.md     ← 第一轮进化结果（SkVM 证据驱动）
    *-v1.2.md     ← 第二轮进化结果（EvoSkill，当前最优）
  eval/
    test-cases.json          ← 测试用例集
    eval-results-v1.0.json   ← 基线评测结果
    eval-results-v1.1.json   ← 第一轮进化后评测结果
    eval-results-v1.2.json   ← 第二轮进化后评测结果
  analysis/
    round1-skvm-evidence.json  ← 第一轮诊断（ROOT_CAUSE / GENERALITY_TEST / REGRESSION_RISK）
    round2-evoskill.json       ← 第二轮迭代过程（Frontier 演进）
  README.md                  ← 案例详细说明

plugins/                     ← 进化引擎插件示例（本地插件机制）
  append-notes.js
  weak-dim-boost.js
  ollama-evolve.js
```

---

## 在 SkillNexus 中复现

1. 打开 Studio，手动编辑模式粘贴 `skills/*-v1.0.md` 内容，安装 Skill
2. 在 Eval 页 TestCase Tab，导入 `eval/test-cases.json`
3. 运行 Eval，得到基线均分
4. 进入 Evo 页，选择 SkVM 证据驱动，启动第一轮进化
5. 接受进化版本后，选择 EvoSkill（maxIterations=3），启动第二轮进化
6. 查看进化历史树，对比三个版本的得分变化

---

## 测试用例设计原则

### 为什么需要"有区分度"的测试用例？

如果 judgeParam 过于宽松（如"应该能识别 SQL 注入"），LLM 裁判会给出普遍高分——即使没有 Skill 加持，基础 LLM 也能通过。这会导致：

- **三条件模式**中看不出 Skill 的实际增益
- **进化**时找不到真正的薄弱点
- 评测失去意义

**好的测试用例**应该让 v1.0（弱版本）得 5-7 分，v1.2（强版本）得 8-9 分，分差 ≥ 1.5。

### judgeParam 设计规范

所有 llm 类型的 judgeParam 遵循以下结构：

```
STRICT: Response MUST (1) <具体可验证条件>, (2) <具体可验证条件>, ...
Score 0 if <明确的零分条件>.
Score 0 if <明确的零分条件>.
Deduct N points if <扣分条件>.
```

**关键要素：**

| 要素 | 说明 | 反例 |
|------|------|------|
| `STRICT:` 前缀 | 告知裁判采用严格模式 | 无前缀 → 裁判过于宽松 |
| 明确的必须条件 | 具体到词语、标签、行号 | "should mention security" |
| 零分边界 | 触发条件 → 直接得 0 | "should probably avoid APPROVE" |
| 可量化约束 | 字数上限、字符数、评分值 | "be concise" |
| 引用原文 | 变量名、代码片段、关键字 | "the hardcoded value" |

### 用例类型覆盖矩阵

每个 Skill 的测试集应覆盖以下类型：

| 类型 | 目的 | judge 类型 |
|------|------|-----------|
| 核心功能（正向） | 验证 Skill 主要价值 | `llm` |
| 核心功能（负向） | 不捏造不存在的问题 | `llm` |
| 边界守卫（空输入） | 确保不崩溃 | `grep` |
| 边界守卫（非法输入） | 拒绝而非猜测 | `llm` / `grep` |
| 输出格式约束 | 结构/章节/字段完整性 | `llm` |
| Cost Awareness | 简洁输出，不废话 | `llm`（含字数限制） |
| Robustness | 混合/歧义/边缘输入 | `llm` |

### 各案例预期分数区间

#### CodeReview（10 个用例）

| 用例 | v1.0 预期 | v1.2 预期 | 关键区分点 |
|------|-----------|-----------|-----------|
| tc-001 Python IndexError | 6–7 | 8–9 | 是否给出具体修复代码 |
| tc-002 SQL 注入 | 5–6 | 9–10 | 是否标 Critical + 参数化查询 |
| tc-003 空输入 | 9–10 | 9–10 | 边界稳定（无区分） |
| tc-004 单行赋值 | 9–10 | 9–10 | 边界稳定（无区分） |
| tc-005 JS 类型转换 | 6–7 | 8–9 | 是否有结构化章节 |
| tc-006 干净代码不捏造 | 6–8 | 9–10 | 是否正确报告无问题 |
| tc-007 非代码文本拒绝 | 5–7 | 9–10 | 是否明确拒绝而非乱审查 |
| tc-008 完美代码简洁输出 | 5–7 | 8–9 | 是否 ≤200 词，不重复 |
| tc-009 混合语言边界 | 5–7 | 8–9 | 是否识别 // 和 null 的语法错误 |
| tc-010 硬编码密钥 | 6–7 | 9–10 | 是否标 Critical + env var 方案 |

#### CommitMessage（8 个用例）

| 用例 | v1.0 预期 | v1.2 预期 | 关键区分点 |
|------|-----------|-----------|-----------|
| tc-cm-001 新增功能 | 6–7 | 8–9 | `feat(<scope>):` 格式 + imperative |
| tc-cm-002 Bug 修复 | 6–8 | 8–9 | `fix:` 类型 + 无多余 body |
| tc-cm-003 空 diff | 9–10 | 9–10 | 边界稳定 |
| tc-cm-004 重大重构 | 4–6 | 8–9 | 是否有 `!` 标记 + body 说明 |
| tc-cm-005 文档更新 | 6–7 | 8–9 | `docs:` 类型 + 无 body |
| tc-cm-006 多文件 | 6–7 | 8–9 | subject 描述意图而非列文件 |
| tc-cm-007 仅格式变更 | 4–6 | 8–9 | 是否用 `style:` 而非 `fix:` |
| tc-cm-008 单行常量 | 5–7 | 9–10 | 是否只有一行，无 body |

#### PR Review Agent（8 个用例）

| 用例 | v1.0 预期 | v1.2 预期 | 关键区分点 |
|------|-----------|-----------|-----------|
| tc-ag-001 SQL 注入 | 6–7 | 9–10 | CRITICAL + REQUEST_CHANGES |
| tc-ag-002 无安全问题 | 6–8 | 9–10 | APPROVE + 不捏造 |
| tc-ag-003 硬编码 API Key | 6–7 | 9–10 | CRITICAL + env var |
| tc-ag-004 硬编码密码 | 5–7 | 9–10 | CRITICAL + REQUEST_CHANGES |
| tc-ag-005 空 diff | 9–10 | 9–10 | 边界稳定 |
| tc-ag-006 三章节结构 | 6–7 | 8–9 | 三节完整 + Verdict 存在 |
| tc-ag-007 XSS 漏洞 | 5–7 | 9–10 | innerHTML + textContent 替代 |
| tc-ag-008 Cost Awareness | 5–7 | 8–9 | APPROVE + ≤200 词 |
