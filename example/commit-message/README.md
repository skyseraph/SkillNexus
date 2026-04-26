# 演示案例：CommitMessage Skill 全流程

本目录演示 SkillNexus 核心链路：**Studio 生成 → Eval 评测 → Evo 进化**，以 CommitMessage Skill 为例，均分从 **5.9 → 8.4**，提升 **+2.5**。

---

## 目录结构

```
example/demo/
  skills/
    commit-message-v1.0.md    ← 原始 Skill（手动编写，无格式约束）
    commit-message-v1.1.md    ← 第一轮进化（SkVM 证据驱动，+1.3）
    commit-message-v1.2.md    ← 第二轮进化（EvoSkill gen-3，+1.2，当前最优）
  eval/
    test-cases.json           ← 6 个测试用例（边界、功能、重构、文档、多文件）
    eval-results-v1.0.json    ← v1.0 评测结果（均分 5.9）
    eval-results-v1.1.json    ← v1.1 评测结果（均分 7.2，+1.3）
    eval-results-v1.2.json    ← v1.2 评测结果（均分 8.4，+1.2）
  analysis/
    round1-skvm-evidence.json ← 第一轮诊断：根因 + 泛化测试 + 回归风险
    round2-evoskill.json      ← 第二轮迭代：3 次迭代 + Frontier 演进
```

---

## 进化历史树

```
○ CommitMessage v1.0   根版本（均分 5.9）
  └── ○ CommitMessage v1.1  +1.3 ↑  [SkVM 证据驱动]
        └── ◉ CommitMessage v1.2  +1.2 ↑  [EvoSkill gen-3]  ← 当前最优
```

---

## 第一步：Studio 生成

在 Studio 页面用「描述模式」生成初始 Skill：

**输入描述**：
> 生成一个 Git 提交信息助手，输入代码 diff，输出简洁的提交信息，使用祈使语气，不超过 72 字符。

生成结果即 `skills/commit-message-v1.0.md`——一个基础版本，只有 3 条简单指令，无格式约束，无边界处理。

**5D 实时评分**（生成后自动触发）：

| 维度 | 得分 |
|------|------|
| safety | 8.5 |
| completeness | 5.5 |
| executability | 6.0 |
| maintainability | 5.5 |
| cost_awareness | 7.0 |
| **均分** | **6.5** |

---

## 第二步：TestCase 设计

为 CommitMessage Skill 设计 6 个测试用例，覆盖四类场景：

| 用例 | 场景类型 | 判断方式 | 核心验证点 |
|------|---------|---------|-----------|
| tc-cm-001 新增功能 | 正常功能 | llm | conventional commit 格式 + feat 类型 |
| tc-cm-002 Bug 修复 | 正常功能 | llm | fix 类型 + 准确描述意图 |
| tc-cm-003 空 diff 边界 | 边界守卫 | grep | 精确返回 "No diff provided." |
| tc-cm-004 大型重构 | 复杂变更 | llm | 破坏性变更标记 + body 格式 |
| tc-cm-005 文档更新 | 类型识别 | llm | docs 类型 + 简洁描述 |
| tc-cm-006 多文件变更 | 多文件摘要 | llm | 不列举文件，摘要意图 |

---

## 第三步：Eval 评测（v1.0 基线）

运行 6 个用例，得到基线评测结果（`eval/eval-results-v1.0.json`）：

| 维度 | v1.0 得分 | 主要问题 |
|------|----------|---------|
| correctness | 6.2 | 大型重构描述过于模糊 |
| instruction_following | 5.5 | 无 conventional commit 格式 |
| safety | 8.5 | — |
| completeness | 5.1 | 缺少 type rationale 输出 |
| **robustness** | **4.8** | 空输入产生幻觉提交信息 |
| executability | 6.0 | 指令模糊 |
| cost_awareness | 6.8 | — |
| maintainability | 5.4 | 结构不清晰 |
| **均分** | **5.9** | |

**最弱维度**：robustness（4.8）、completeness（5.1）

---

## 第四步：Evo 进化 — 第一轮（SkVM 证据驱动）

**诊断结果**（`analysis/round1-skvm-evidence.json`）：

```
ROOT_CAUSE: Skill 缺少两类关键指令：
  (1) 空输入边界守卫——模型在无 diff 时产生幻觉提交信息
  (2) Conventional Commit 格式约束——未要求 <type>(<scope>): <subject> 格式

GENERALITY_TEST: 任何生成类 Skill（摘要、解释、变更日志）均可从
  明确的边界守卫指令中获益。

REGRESSION_RISK: 新增 Input Validation 和 Conventional Commit Format 小节，
  不修改核心生成逻辑，Safety 和 cost_awareness 不受影响。
```

**进化结果**（v1.1，`eval/eval-results-v1.1.json`）：

| 维度 | v1.0 | v1.1 | Delta |
|------|------|------|-------|
| correctness | 6.2 | 7.5 | +1.3 |
| instruction_following | 5.5 | 7.8 | **+2.3** |
| safety | 8.5 | 8.8 | +0.3 |
| completeness | 5.1 | 6.8 | **+1.7** |
| robustness | 4.8 | 7.5 | **+2.7** |
| executability | 6.0 | 7.2 | +1.2 |
| cost_awareness | 6.8 | 6.5 | -0.3 |
| maintainability | 5.4 | 6.8 | +1.4 |
| **均分** | **5.9** | **7.2** | **+1.3 ✅** |

决策：**接受**。

---

## 第五步：Evo 进化 — 第二轮（EvoSkill 多代迭代）

以 v1.1（均分 7.2）为基础，启动 EvoSkill（maxIterations=3）。

**迭代过程**（`analysis/round2-evoskill.json`）：

| 迭代 | 基础版本 | 候选均分 | 是否新最优 | 主要改进 |
|------|---------|---------|-----------|---------|
| Iter 1 | v1.1（7.2） | 7.8 | ★ 是 | 增加 scope suggestion 输出 + 破坏性变更 ! 标记规则 |
| Iter 2 | v1.1（7.2） | 7.5 | 否 | 增加 style 类型 + body ≤ 5 items 约束 |
| Iter 3 | gen-1（7.8） | **8.4** | ★ 是 | 合并两轮改进 + WHY vs WHAT body 原则 + perf/chore 类型 |

**进化结果**（v1.2，`eval/eval-results-v1.2.json`）：

| 维度 | v1.1 | v1.2 | Delta |
|------|------|------|-------|
| correctness | 7.5 | 8.7 | +1.2 |
| instruction_following | 7.8 | 9.0 | **+1.2** |
| safety | 8.8 | 9.0 | +0.2 |
| completeness | 6.8 | 8.5 | **+1.7** |
| robustness | 7.5 | 9.2 | **+1.7** |
| executability | 7.2 | 8.5 | +1.3 |
| cost_awareness | 6.5 | 7.2 | +0.7 |
| maintainability | 6.8 | 8.3 | +1.5 |
| **均分** | **7.2** | **8.4** | **+1.2 ✅** |

决策：**接受**。

---

## 最终结果

两轮进化，均分从 **5.9 → 8.4**，提升 **+2.5**，全程无人工干预，每步均有量化验证。

**关键结论**：

1. **边界守卫是最高 ROI 的改进**：两行空输入说明将 robustness 从 4.8 提升至 9.2（+4.4）。
2. **格式约束驱动 instruction_following 提升**：Conventional Commit 格式要求使该维度从 5.5 升至 9.0（+3.5）。
3. **结构化输出要求提升 completeness**：要求 type rationale + scope suggestion 后，completeness 从 5.1 升至 8.5（+3.4）。
4. **EvoSkill 的 Frontier 机制防止局部最优**：Iter 2 的候选（7.5）未超越 Iter 1（7.8），被保留但不成为新基础；Iter 3 从 Iter 1 出发，最终突破至 8.4。

---

## 在 SkillNexus 中复现

1. 打开 Studio，选择「手动编辑」模式，粘贴 `skills/commit-message-v1.0.md` 内容，安装为 `CommitMessage`
2. 在 Eval 页 TestCase Tab，导入 `eval/test-cases.json`
3. 运行 Eval，验证均分约为 5.9（LLM 输出有随机性，±0.5 属正常）
4. 进入 Evo 页，选择 SkVM 证据驱动，启动进化
5. 审查诊断面板和 Diff 视图，点击「安装并评测」
6. 查看 deciding 阶段的 Delta 对比，点击「接受」
7. 重复步骤 4-6，选择 EvoSkill（maxIterations=3）进行第二轮进化
