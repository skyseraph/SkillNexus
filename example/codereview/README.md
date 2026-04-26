# 实战案例：CodeReview Skill 进化全流程

本目录记录了一个真实的 Skill 进化案例：CodeReview Skill 经过两轮进化，均分从 **6.8 → 8.1**，提升 **+1.3**。

---

## 目录结构

```
codereview/
  skills/
    codereview-v1.0.md          ← 根版本（原始 Skill）
    codereview-v1.1.md          ← 第一轮进化结果（SkVM 证据驱动）
    codereview-v1.2.md          ← 第二轮进化结果（EvoSkill gen-3，当前最优）
  eval/
    test-cases.json             ← 6 个测试用例（覆盖边界、安全、正常、无问题场景）
    eval-results-v1.0.json      ← v1.0 评测结果（均分 6.8）
    eval-results-v1.1.json      ← v1.1 评测结果（均分 7.4，+0.6）
    eval-results-v1.2.json      ← v1.2 评测结果（均分 8.1，+0.7）
    transfer-test-v1.2.json     ← v1.2 跨模型迁移测试（Haiku / GPT-4o-mini / Qwen-72B）
  analysis/
    round1-skvm-evidence.json   ← 第一轮诊断：根因 + 泛化测试 + 回归风险
    round2-evoskill.json        ← 第二轮迭代过程：3 次迭代 + Frontier 演进
```

---

## 进化历史树

```
○ CodeReview v1.0   根版本（均分 6.8）
  └── ○ CodeReview v1.1  +0.6 ↑  [SkVM 证据驱动]
        └── ◉ CodeReview v1.2  +0.7 ↑  [EvoSkill gen-3]  ← 当前最优
```

---

## 第一轮：SkVM 证据驱动

### 问题诊断

v1.0 在 **Completeness（5.9）** 和 **Robustness（6.2）** 两个维度表现最差。

最弱的两个测试用例：

| 用例 | 得分 | 问题 |
|------|------|------|
| 空输入边界 | 5.1 | 应返回 "No code provided for review." 但模型给出了不同措辞 |
| 单行代码 | 4.8 | 应触发 < 3 行边界守卫，但模型当作正常代码处理 |

### 诊断结果（`analysis/round1-skvm-evidence.json`）

```
ROOT_CAUSE: Skill 缺少对"空输入"和"单行代码"边界场景的明确处理指令，
  导致模型在输入为空或极短时产生幻觉输出，而非返回规范的边界响应。
  同时缺少结构化输出格式要求，导致 completeness 和 instruction_following 普遍偏低。

GENERALITY_TEST: 任何需要处理"零结果"场景的聚合类 Skill（如搜索、列表过滤）
  均可从此修复中获益。

REGRESSION_RISK: 仅在 Input Validation 小节增加边界说明，并补充结构化输出格式。
  不修改核心审查逻辑，不影响已通过的 Safety（8.1）和 Executability（7.5）。
```

### 进化结果

v1.1 新增：
- `## Input Validation` 小节，明确空输入和 < 3 行的边界响应措辞
- `## Output Format` 要求 Summary / Issues（含 severity）/ Suggestions 三段式结构

| 维度 | v1.0 | v1.1 | Delta |
|------|------|------|-------|
| correctness | 6.8 | 7.6 | +0.8 |
| instruction_following | 7.2 | 7.8 | +0.6 |
| safety | 8.1 | 8.2 | +0.1 |
| completeness | 5.9 | 7.1 | **+1.2** |
| robustness | 6.2 | 7.3 | **+1.1** |
| executability | 7.5 | 8.0 | +0.5 |
| cost_awareness | 7.8 | 7.9 | +0.1 |
| maintainability | 6.5 | 7.4 | +0.9 |
| **均分** | **6.8** | **7.4** | **+0.6 ✅** |

决策：**接受**。

---

## 第二轮：EvoSkill 多代迭代

以 v1.1（均分 7.4）为基础，启动 EvoSkill（maxIterations=3）。

### 迭代过程（`analysis/round2-evoskill.json`）

| 迭代 | 基础版本 | 候选均分 | 是否新最优 | 主要改进 |
|------|---------|---------|-----------|---------|
| Iter 1 | v1.1（7.4） | 7.7 | ★ 是 | 增加有序审查流程（静态→逻辑→安全→风格）+ Score 字段 |
| Iter 2 | v1.1（7.4） | 7.5 | 否 | 增加语言检测回退 + max-5 建议约束 |
| Iter 3 | gen-1（7.7） | **8.1** | ★ 是 | 合并有序流程与 severity 标签，补充"无问题"明确措辞，收紧约束 |

Frontier 最终保留 3 个变体，最优版本 v1.2 均分 **8.1**。

### 进化结果

v1.2 相对 v1.1 的主要变化：
- `## Review Process` 新增四步有序审查流程（静态分析 → 逻辑 → 安全 → 风格）
- `## Severity Levels` 明确 Critical / Warning / Info 定义
- `## Output Format` 新增第 4 项 Score 字段
- `## Constraints` 新增"无问题时明确说明"和"最多 5 条建议"约束

| 维度 | v1.1 | v1.2 | Delta |
|------|------|------|-------|
| correctness | 7.6 | 8.5 | +0.9 |
| instruction_following | 7.8 | 8.7 | +0.9 |
| safety | 8.2 | 8.8 | +0.6 |
| completeness | 7.1 | 8.2 | **+1.1** |
| robustness | 7.3 | 8.3 | **+1.0** |
| executability | 8.0 | 8.6 | +0.6 |
| cost_awareness | 7.9 | 7.6 | -0.3 ⚠️ |
| maintainability | 7.4 | 8.4 | +1.0 |
| **均分** | **7.4** | **8.1** | **+0.7 ✅** |

> ⚠️ cost_awareness 下降 0.3：有序审查流程和 Score 字段使输出略长。Delta < 1.0，不触发防回归警告。

决策：**接受**。

---

## 跨模型迁移验证（`eval/transfer-test-v1.2.json`）

v1.2 在 claude-sonnet-4-6 上进化，迁移至三个模型验证：

| 模型 | 均分 | 迁移率 | 说明 |
|------|------|--------|------|
| claude-haiku-4-5 | 7.9 | 74% | 边界用例 100% 通过，JS 分析略简 |
| gpt-4o-mini | 7.5 | 59% | 边界用例通过，Score 字段偶尔缺失 |
| qwen-72b-instruct | 8.0 | 79% | 强迁移，有序流程遵循良好 |
| **综合** | — | **71%** | 良好迁移性 |

边界守卫指令（空输入 / 单行代码）在所有模型上 **100% 迁移**，结构化输出格式在弱模型上有 20-30% 的遵循率下降。

---

## 测试用例设计说明（`eval/test-cases.json`）

6 个用例覆盖四类场景：

| 用例 | 场景类型 | 判断方式 | 核心验证点 |
|------|---------|---------|-----------|
| tc-001 Python 空列表边界 | 逻辑 bug | llm | 识别 IndexError + 提供修复代码 |
| tc-002 SQL 注入风险 | 安全漏洞 | llm | 标记 Critical + 参数化查询建议 |
| tc-003 空输入边界 | 边界守卫 | grep | 精确返回 "No code provided for review." |
| tc-004 单行代码 | 边界守卫 | grep | < 3 行触发边界守卫 |
| tc-005 正常 JS 函数 | 正常代码 | llm | 结构化输出 + 识别类型隐患 |
| tc-006 无问题代码 | 干净代码 | llm | 明确说明无问题，不捏造 |

---

## 关键结论

1. **边界守卫指令是最高 ROI 的改进**：两行明确的边界说明将 robustness 从 6.2 提升至 8.3（+2.1）。
2. **结构化输出格式驱动 completeness 提升**：要求 Summary/Issues/Suggestions 三段式后，completeness 从 5.9 升至 8.2（+2.3）。
3. **有序审查流程提升 correctness**：静态→逻辑→安全→风格的顺序让模型不遗漏安全类问题。
4. **迁移性验证不可跳过**：GPT-4o-mini 的 59% 迁移率提示结构化格式指令对弱模型需要更强的约束措辞。
