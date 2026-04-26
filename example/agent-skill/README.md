# PR Review Agent — Agent Skill 示例

> 类型: Agent Skill（多步骤编排）  
> 版本: 1.0.0  
> 子 Skill 数: 3

---

## 案例说明

这是 SkillNexus 的 **Agent Skill** 示例，演示如何将多个单一 Skill 编排为一个完整的工作流。

PR Review Agent 协调三个子 Skill，完成完整的 Pull Request 审查：

```
PR diff 输入
    │
    ├─→ diff-analyzer      ← 解析变更类型、风险等级
    ├─→ security-scanner   ← 扫描 OWASP Top 10 漏洞
    └─→ quality-assessor   ← 评估可读性、测试覆盖、文档
            │
            └─→ 结构化 PR Review Report（含 Verdict）
```

---

## 目录结构

```
agent-skill/
  skills/
    pr-review-agent-v1.0.md          ← Agent 主 Skill（编排逻辑）
    sub-skills/
      diff-analyzer-v1.0.md          ← 子 Skill 1：Diff 分析
      security-scanner-v1.0.md       ← 子 Skill 2：安全扫描
      quality-assessor-v1.0.md       ← 子 Skill 3：质量评估
  eval/
    test-cases.json                  ← 6 个测试用例
  README.md
```

---

## 测试用例覆盖

| 用例 | 类型 | 覆盖点 |
|------|------|--------|
| SQL 注入漏洞 PR | grep | 安全扫描能识别注入风险 |
| 新功能 PR — 无安全问题 | llm | 低风险 PR 正确分类 |
| 硬编码 API Key | grep | CRITICAL 级别漏洞检测 |
| 输出包含 Verdict 字段 | grep | 报告格式完整性 |
| 空 diff 边界处理 | llm | 边界输入鲁棒性 |
| 报告包含三个必要章节 | llm | 完整工作流执行 |

---

## 在 SkillNexus 中使用

1. Studio → 手动编辑模式，粘贴 `skills/pr-review-agent-v1.0.md`，安装为 Agent Skill
2. 分别安装三个子 Skill（`sub-skills/` 目录下）
3. Eval 页 TestCase Tab → 导入 `eval/test-cases.json`
4. 运行评测，观察 Agent 编排输出

---

## 与单一 Skill 的区别

| | 单一 Skill | Agent Skill |
|---|---|---|
| `skill_type` | `single` | `agent` |
| 执行方式 | 单次 LLM 调用 | 多步骤编排，可调用子 Skill |
| 5D 评分 | 含 `costAwareness` | 含 `orchestration`（编排质量） |
| 文件结构 | 单个 `.md` 文件 | 主 Skill + 子 Skill 目录 |
