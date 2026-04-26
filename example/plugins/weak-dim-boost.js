/**
 * weak-dim-boost.js — 示例插件 2：基于 eval 历史的弱维度增强
 *
 * 功能：分析最近 eval 记录，找出最低分维度，在 Skill 指令中注入专项改进要求
 * 用途：有 eval 历史后，自动针对弱点做定向优化
 *
 * 安装：复制到 {userData}/plugins/weak-dim-boost.js
 * 前提：需要至少 1 条 eval 历史记录（先在 Eval 页面运行评测）
 */

module.exports = {
  id: 'weak-dim-boost',
  name: '弱维度增强',
  description: '分析 eval 历史找出最弱维度，自动注入改进指令。需要 eval 历史。',
  version: '1.1.0',

  evolve: async ({ skillContent, evalHistory }) => {
    if (evalHistory.length === 0) {
      throw new Error('需要至少 1 条 eval 记录。请先在 Eval 页面运行评测。')
    }

    // 计算各维度平均分
    const dimSums = {}
    const dimCounts = {}
    for (const record of evalHistory) {
      for (const [dim, { score }] of Object.entries(record.scores)) {
        dimSums[dim] = (dimSums[dim] || 0) + score
        dimCounts[dim] = (dimCounts[dim] || 0) + 1
      }
    }

    // 找最弱维度
    let weakDim = null
    let weakScore = Infinity
    for (const dim of Object.keys(dimSums)) {
      const avg = dimSums[dim] / dimCounts[dim]
      if (avg < weakScore) { weakScore = avg; weakDim = dim }
    }

    if (!weakDim) {
      throw new Error('无法从 eval 历史中提取维度数据')
    }

    // 维度 → 中文改进提示
    const improvements = {
      correctness:           '确保输出在事实、逻辑、计算上准确无误。对不确定内容明确标注，避免hallucination。',
      instruction_following: '严格遵循用户指定的格式、范围、字数和约束。不要增加未被要求的内容或改变指定格式。',
      safety:                '输出必须安全、中立，不含有害、歧视、误导性内容。敏感话题给出平衡视角。',
      completeness:          '确保输出涵盖任务的所有必要部分，不遗漏关键步骤、要点或边界情况。',
      robustness:            '对模糊、边界或异常输入保持稳健——给出合理处理方式或明确说明局限。',
      executability:         '指令应具体、可操作，避免过于抽象。每一步都应该能被普通用户理解并执行。',
      cost_awareness:        '输出应简洁，避免冗余重复；在保证质量的前提下控制 token 消耗，不加无意义填充。',
      maintainability:       '结构清晰，使用标题/列表/代码块组织内容，便于后续修改、扩展和理解。',
    }

    const hint = improvements[weakDim] || `重点改进 ${weakDim} 维度的表现。`
    const avgStr = weakScore.toFixed(1)
    const injection = `\n\n> **质量重点（${weakDim} 维度，当前均分 ${avgStr}/10，需改进）**\n> ${hint}\n`

    // 在 frontmatter 后插入（避免破坏 YAML frontmatter 解析）
    const fmEnd = skillContent.indexOf('\n---\n', 4)
    if (fmEnd !== -1) {
      const before = skillContent.slice(0, fmEnd + 5)
      const after = skillContent.slice(fmEnd + 5)
      return { evolvedContent: before + injection + after }
    }

    // 无 frontmatter，直接追加到开头
    return { evolvedContent: injection + skillContent }
  }
}
