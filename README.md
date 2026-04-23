# SkillNexus

<div align="center">

**Skill Studio**

一个基于 Electron 的桌面应用，提供 AI Skill创作乐园，包括Skill生成、测试、评测、进化和管理能力

[English](#english) | [中文](#中文)

</div>

---

## 中文

### 📖 项目简介

SkillNexus 是一个专为 AI Skill 设计的全生命周期创作工具。Skill 是一种 Markdown 格式的 AI 指令文件（带 YAML frontmatter），可安装到 Claude Code、Cursor、Windsurf 等 AI 工具中，增强其能力。

**核心工作流**：
```
Home（管理）→ Studio（生成）→ TestCase（用例）→ Eval（评测）→ Evo（进化）→ Trending（榜单）
```

### ✨ 核心功能

#### 🏠 Home — Skill 管理
- 安装单文件 `.md` 或 Agent Skill 目录
- 扫描本地 AI 工具目录（Claude Code、Cursor、Windsurf 等）
- 导出 Skill 到 AI 工具（复制或符号链接模式）
- 文件树浏览和内容查看
- GitHub Marketplace 搜索与安装
- 支持 8+ AI 工具，可配置导出路径

#### 🎨 Studio — Skill 生成与创作
- **4 种生成模式**：
  - 基于提示词（流式 AI 生成）
  - 基于示例（输入/输出对）
  - 对话提取（从聊天历史中提炼）
  - 手动编辑
- **发现面板**：浏览 SkillNet、GitHub 仓库、个人库
- **外部方法**：Skill Creator、PromptPerfect、自定义 URL
- **内联验证**：5 维度评分（安全性/完整性/可执行性/可维护性/成本意识）
- **相似度检测**：防止重复安装
- **快速测试**：内联运行 Skill，保存测试用例
- **对比进化**：并排查看原始版本 vs 进化版本

#### 🧪 TestCase — 测试用例管理
- 手动 CRUD 测试用例
- AI 自动生成（1-20 个用例，NDJSON 格式）
- 3 种评判类型：LLM、grep、command
- 按 Skill 组织

#### 📊 Eval — 多维度评测
- **4 个评测维度**：正确性、清晰度、完整性、安全性（0-10 分制）
- **2 种模式**：
  - 单次评测：针对测试用例运行 Skill
  - 三条件对比：基线（无 Skill）vs 当前版本 vs AI 生成版本
- 实时进度跟踪
- 评测历史（每个 Skill 最近 50 条记录）
- 支持并发评测

#### 🧬 Evo — Skill 进化
- 基于评测反馈自动改进 Skill
- 4 种进化策略：improve_weak、expand、simplify、add_examples
- 将进化版本安装为新 Skill
- 原始版本 vs 进化版本并行评测
- 量化改进指标

#### 🏆 Trending — 排行榜
- 多维度 Skill 排名
- 按总分或单个维度排序
- 从评测历史聚合统计数据

#### ⚙️ Settings — LLM 提供商配置
- 支持 12+ AI 提供商（Anthropic、DeepSeek、Kimi、MiniMax、Ollama 等）
- 自定义提供商设置（baseURL + API Key + 模型）
- 预设提供商配置
- API Key 安全存储（electron-store 加密）

### 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **桌面框架** | Electron 31.0.0 + electron-vite 2.3.0 |
| **前端** | React 18.3.0 + TypeScript 5.5.0 |
| **主进程存储** | better-sqlite3 11.0.0（业务数据）+ electron-store 8.2.0（LLM 配置） |
| **AI Provider** | Anthropic SDK 0.39.0（主要），兼容 OpenAI 格式（via baseURL），支持 12+ 预设 |
| **IPC** | contextBridge + ipcMain.handle / ipcRenderer.invoke |
| **测试** | Vitest 2.0.0（单元测试）+ Playwright（E2E，待接入） |
| **构建工具** | Vite 5.3.0, electron-rebuild 3.6.0 |

### 🚀 快速开始

#### 前置要求
- Node.js 18+
- npm 或 yarn

#### 安装依赖
```bash
npm install
```

#### 重建原生模块（首次运行或依赖更新后）
```bash
npm run rebuild
```

#### 开发模式
```bash
npm run dev
```

#### 构建生产版本
```bash
npm run build
```

#### 运行测试
```bash
npm test              # 运行一次
npm run test:watch    # 监听模式
```

### 📁 项目结构

```
SkillNexus/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 应用入口
│   │   ├── db/                  # SQLite 数据库
│   │   ├── ipc/                 # IPC 处理器
│   │   └── services/            # AI Provider、评测引擎
│   ├── renderer/                # React 前端
│   │   └── src/
│   │       ├── App.tsx          # 主路由
│   │       ├── pages/           # 6 个主页面
│   │       └── components/
│   ├── preload/                 # Electron preload（contextBridge）
│   └── shared/                  # 共享类型与工具
├── openspec/                    # Spec 驱动开发文档
│   ├── config.yaml              # 项目上下文
│   ├── specs/                   # 永久功能规格
│   └── changes/                 # 活跃变更提案
├── CLAUDE.md                    # 项目规范与编码准则
└── package.json
```

### 🔒 安全架构

项目遵循 **7 条 IPC 安全不变量**（详见 `openspec/specs/01-ipc-security.md`）：

1. **SEC-R1**: 文件路径必须经白名单校验
2. **SEC-R2**: name 参数写文件前必须 sanitize
3. **SEC-R3**: API Key 不暴露给渲染进程
4. **SEC-R4**: shell.openExternal 仅接受 `https?://` 协议
5. **SEC-R5**: 所有 AI 调用 30 秒超时
6. **SEC-R6**: testCaseIds 数组长度 ≤ 50
7. **SEC-R7**: skills:readFile 验证文件在 Skill rootDir 内

违反任一规则将阻止代码合并。

### 📐 开发工作流

**Spec-First 方法论**（详见 `CLAUDE.md`）：

1. **写 Spec** → `openspec/specs/<module>.md`
2. **对齐确认** → 与用户确认方向
3. **创建变更** → `openspec/changes/<name>/`（proposal + design + tasks）
4. **实现** → 按 Spec 实现，偏差必须先更新 Spec
5. **代码审查** → 按 4 个维度验收（安全合规、产品深度、可测试性、性能）

**编码准则**（Karpathy Guidelines）：
- 先想后写（不假设，暴露权衡）
- 简单优先（最小化代码）
- 外科手术式修改（只改必须改的）
- 目标驱动执行（定义成功标准）

### 📊 数据库模型

```sql
-- Skills 元数据
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT DEFAULT 'markdown',
  version TEXT DEFAULT '1.0.0',
  tags TEXT DEFAULT '[]',
  yaml_frontmatter TEXT DEFAULT '',
  markdown_content TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  root_dir TEXT NOT NULL,
  skill_type TEXT DEFAULT 'single',
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 测试用例
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  judge_type TEXT DEFAULT 'llm',
  judge_param TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 评测历史
CREATE TABLE eval_history (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_prompt TEXT NOT NULL,
  output TEXT NOT NULL,
  scores TEXT DEFAULT '{}',
  total_score REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  created_at INTEGER NOT NULL
);
```

### 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/AmazingFeature`）
3. 遵循 Spec-First 工作流（先写 Spec，再实现）
4. 确保通过所有测试（`npm test`）
5. 遵守 7 条 IPC 安全不变量
6. 提交 Pull Request

### 📄 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证。

### 🙏 致谢

- [Andrej Karpathy](https://github.com/karpathy) - 编码准则灵感来源
- [Claude Code](https://claude.ai/code) - AI 辅助开发工具
- [SkillNet](https://github.com/skillnet) - Skill 生态系统参考
- [agent-skill-autonomous](https://skyseraph.github.io/posts/2026/agent-skill-autonomous/)

---

## English

### 📖 Overview

SkillNexus is a comprehensive lifecycle Creation platform for AI Skills. A Skill is a Markdown-formatted AI instruction file (with YAML frontmatter) that can be installed into AI tools like Claude Code, Cursor, and Windsurf to enhance their capabilities.

**Core Workflow**:
```
Home (Manage) → Studio (Generate) → TestCase (Create) → Eval (Assess) → Evo (Evolve) → Trending (Rank)
```

### ✨ Key Features

#### 🏠 Home — Skill Management
- Install single `.md` files or Agent Skill directories
- Scan local AI tool directories (Claude Code, Cursor, Windsurf, etc.)
- Export skills to AI tools (copy or symlink modes)
- Browse file trees and view content
- GitHub Marketplace search & install
- Supports 8+ AI tools with configurable export paths

#### 🎨 Studio — Skill Generation & Authoring
- **4 generation modes**:
  - Prompt-based (streaming AI generation)
  - Example-based (input/output pairs)
  - Conversation extraction (distill from chat history)
  - Manual editing
- **Discovery Panel**: Browse SkillNet, GitHub repos, personal library
- **External methods**: Skill Creator, PromptPerfect, custom URLs
- **Inline validation**: 5D scoring (safety/completeness/executability/maintainability/costAwareness)
- **Similarity detection**: Prevent duplicate installations
- **Quick test**: Run skill inline, save test cases
- **Compare evolution**: Side-by-side original vs. evolved versions

#### 🧪 TestCase — Test Case Management
- Manual CRUD for test cases
- AI auto-generation (1-20 cases, NDJSON format)
- 3 judge types: LLM, grep, command
- Per-skill organization

#### 📊 Eval — Multi-Dimensional Evaluation
- **4 evaluation dimensions**: correctness, clarity, completeness, safety (0-10 scale)
- **2 modes**:
  - Single evaluation: Run skill against test cases
  - Three-condition comparison: Baseline (no skill) vs. Current vs. AI-generated
- Real-time progress tracking
- Evaluation history (last 50 records per skill)
- Concurrent evaluation support

#### 🧬 Evo — Skill Evolution
- Auto-improve skills based on evaluation feedback
- 4 evolution strategies: improve_weak, expand, simplify, add_examples
- Install evolved version as new skill
- Parallel evaluation of original vs. evolved
- Quantified improvement metrics

#### 🏆 Trending — Rankings & Leaderboards
- Multi-dimensional skill rankings
- Sort by total score or individual dimensions
- Aggregated statistics from eval history

#### ⚙️ Settings — LLM Provider Configuration
- Support for 12+ AI providers (Anthropic, DeepSeek, Kimi, MiniMax, Ollama, etc.)
- Custom provider setup (baseURL + API key + model)
- Provider presets with sensible defaults
- API key stored securely (electron-store encryption)

### 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Framework** | Electron 31.0.0 + electron-vite 2.3.0 |
| **Frontend** | React 18.3.0 + TypeScript 5.5.0 |
| **Main Process Storage** | better-sqlite3 11.0.0 (business data) + electron-store 8.2.0 (LLM config) |
| **AI Provider** | Anthropic SDK 0.39.0 (primary), compatible with OpenAI format via baseURL, supports 12+ presets |
| **IPC** | contextBridge + ipcMain.handle / ipcRenderer.invoke |
| **Testing** | Vitest 2.0.0 (unit tests) + Playwright (E2E, pending integration) |
| **Build Tools** | Vite 5.3.0, electron-rebuild 3.6.0 |

### 🚀 Quick Start

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Install Dependencies
```bash
npm install
```

#### Rebuild Native Modules (first run or after dependency updates)
```bash
npm run rebuild
```

#### Development Mode
```bash
npm run dev
```

#### Build for Production
```bash
npm run build
```

#### Run Tests
```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

### 📁 Project Structure

```
SkillNexus/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry point
│   │   ├── db/                  # SQLite database
│   │   ├── ipc/                 # IPC handlers
│   │   └── services/            # AI Provider, eval engine
│   ├── renderer/                # React frontend
│   │   └── src/
│   │       ├── App.tsx          # Main router
│   │       ├── pages/           # 6 main pages
│   │       └── components/
│   ├── preload/                 # Electron preload (contextBridge)
│   └── shared/                  # Shared types & utilities
├── openspec/                    # Spec-driven development docs
│   ├── config.yaml              # Project context
│   ├── specs/                   # Permanent feature specs
│   └── changes/                 # Active change proposals
├── CLAUDE.md                    # Project guidelines & coding principles
└── package.json
```

### 🔒 Security Architecture

The project follows **7 IPC Security Invariants** (see `openspec/specs/01-ipc-security.md`):

1. **SEC-R1**: File paths must pass whitelist validation
2. **SEC-R2**: name parameters must be sanitized before file writes
3. **SEC-R3**: API keys never exposed to renderer process
4. **SEC-R4**: shell.openExternal only accepts `https?://` protocols
5. **SEC-R5**: All AI calls wrapped with 30s timeout
6. **SEC-R6**: testCaseIds array length ≤ 50
7. **SEC-R7**: skills:readFile validates file is within skill's rootDir

Violations of any rule will block code merges.

### 📐 Development Workflow

**Spec-First Methodology** (see `CLAUDE.md`):

1. **Write Spec** → `openspec/specs/<module>.md`
2. **Align** → Confirm direction with stakeholders
3. **Create Change** → `openspec/changes/<name>/` (proposal + design + tasks)
4. **Implement** → Follow spec, update spec if deviating
5. **Code Review** → 4 dimensions (security compliance, product depth, testability, performance)

**Coding Principles** (Karpathy Guidelines):
- Think before writing (no assumptions, expose tradeoffs)
- Simplicity first (minimal code)
- Surgical modifications (only change what's needed)
- Goal-driven execution (define success criteria)

### 📊 Database Schema

```sql
-- Skills metadata
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT DEFAULT 'markdown',
  version TEXT DEFAULT '1.0.0',
  tags TEXT DEFAULT '[]',
  yaml_frontmatter TEXT DEFAULT '',
  markdown_content TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  root_dir TEXT NOT NULL,
  skill_type TEXT DEFAULT 'single',
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Test cases
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  judge_type TEXT DEFAULT 'llm',
  judge_param TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Evaluation history
CREATE TABLE eval_history (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_prompt TEXT NOT NULL,
  output TEXT NOT NULL,
  scores TEXT DEFAULT '{}',
  total_score REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  created_at INTEGER NOT NULL
);
```

### 🤝 Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Follow Spec-First workflow (write spec before implementation)
4. Ensure all tests pass (`npm test`)
5. Comply with 7 IPC security invariants
6. Submit a Pull Request

### 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).

### 🙏 Acknowledgments

- [Andrej Karpathy](https://github.com/karpathy) - Inspiration for coding principles
- [Claude Code](https://claude.ai/code) - AI-assisted development tool
- [SkillNet](https://github.com/skillnet) - Skill ecosystem reference
- [agent-skill-autonomous](https://skyseraph.github.io/posts/2026/agent-skill-autonomous/)

---

<div align="center">

**Made with ❤️ by the SkillNexus Team**

[Report Bug](https://github.com/yourusername/SkillNexus/issues) · [Request Feature](https://github.com/yourusername/SkillNexus/issues)

</div>