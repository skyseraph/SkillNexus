/**
 * append-notes.js — 示例插件 1：最简插件
 *
 * 功能：在 Skill 末尾追加通用注意事项段落
 * 用途：演示最小插件结构，无需 eval 历史
 *
 * 安装：复制到 {userData}/plugins/append-notes.js
 */

module.exports = {
  id: 'append-notes',
  name: '追加注意事项',
  description: '在 Skill 末尾自动添加通用注意事项段落',
  version: '1.0.0',

  evolve: async ({ skillContent }) => {
    const notes = `

## 注意事项

- 输出应简洁、结构清晰，避免冗余内容
- 遇到模糊输入时，先明确需求再执行，不要自行假设
- 不要在输出中包含免责声明或过度警告
- 如有多个可行方案，列出对比并给出推荐
`
    return {
      evolvedContent: skillContent.trimEnd() + notes
    }
  }
}
