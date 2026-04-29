# Windows 安装问题排查记录

> 对应 GitHub Issue #3

## 问题现象

在企业网络（代理）环境下，Windows 机器执行 `npm install && npm run dev` 后报错：

```
Error: Cannot find module 'better-sqlite3'
    at out/main/index.js:5
```

或者安装成功但启动时报：

```
App failed to initialize: Error: The module '...\resources\win32-x64\better_sqlite3.node'
was compiled against a different Node.js version using NODE_MODULE_VERSION 128.
This version of Node.js requires NODE_MODULE_VERSION 125.
```

---

## 根本原因分析

### 原因一：better-sqlite3 被 npm 跳过

`better-sqlite3` 是 `optionalDependencies`，企业代理环境下 npm 安装失败时会静默跳过，不报错。

vite 将 `better-sqlite3` externalize，构建产物 `out/main/index.js` 第 5 行直接是：

```js
const Database = require("better-sqlite3")
```

`node_modules/better-sqlite3` 不存在时，这行代码在任何 in-code fallback 执行之前就崩溃了。

### 原因二：Electron 版本与预编译二进制不匹配

`better_sqlite3.node` 是原生模块，编译时绑定特定的 Node Module Version (NMV)：

| Electron 版本 | NMV |
|---|---|
| 30.x | 125 |
| 31.x | 128 |
| 32.x | 130 |

企业环境下 npm 可能跳过 `electron` 安装（同样是 optionalDependency），导致系统使用全局安装的 Electron（版本可能与项目不同），NMV 不匹配。

---

## 解决方案

### 方案一：vendor copy（解决 module not found）

`scripts/rebuild-sqlite.js` 在 `node_modules/better-sqlite3` 缺失时，将 `vendor/better-sqlite3`（仓库内置的 JS wrapper）复制到 `out/node_modules/better-sqlite3`。

Node 模块解析顺序：`out/main/node_modules/` → `out/node_modules/` → `node_modules/`，所以 `out/node_modules/` 足够。

### 方案二：运行时 NMV 选择（解决版本不匹配）

放弃在构建时猜测 Electron 版本，改为：

1. `rebuild-sqlite.js` 扫描 `prebuilds/` 目录，提取当前平台所有可用的预编译包，按 ABI 命名：
   - `resources/win32-x64/better_sqlite3_v125.node`
   - `resources/win32-x64/better_sqlite3_v128.node`

2. `db/index.ts` 在运行时用 `process.versions.modules`（实际 NMV）选择正确的文件：
   ```ts
   const nmv = process.versions.modules
   // 优先找 better_sqlite3_v{nmv}.node，回退到 better_sqlite3.node
   ```

这样无论实际运行的是哪个 Electron 版本，只要 `prebuilds/` 里有对应的 tarball，就能正常启动。

---

## 修复提交记录

| 提交 | 内容 |
|---|---|
| `38a3b2b` | vendor copy：`out/node_modules/better-sqlite3` 解决 module not found |
| `7a7983d` | 新增 Electron 30 (NMV 125) win32-x64 预编译包 |
| `966bcc8` | 去掉"已存在跳过"逻辑，每次覆盖提取确保二进制正确 |
| `b37f575` | 运行时 NMV 选择：扫描所有 tarball 按 ABI 命名，`process.versions.modules` 选文件 |
| `e0108a6` | README 更新安装说明；`dist:mac/win/all` 脚本加入 `rebuild-sqlite.js` |

---

## 修复涉及的文件

| 文件 | 改动 |
|---|---|
| `scripts/rebuild-sqlite.js` | 扫描所有 tarball 并按 ABI 命名提取；vendor copy 逻辑；去掉"已存在跳过"逻辑 |
| `src/main/db/index.ts` | 运行时用 `process.versions.modules` 选 NMV 对应的 `.node` 文件 |
| `package.json` | `build` / `dist:*` 脚本在 vite build 之后调用 `rebuild-sqlite.js` |
| `prebuilds/` | 新增 `better-sqlite3-v11.10.0-electron-v125-win32-x64.tar.gz` |

---

## 添加新 Electron 版本支持

当升级 Electron 时，需要：

1. 从 [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases) 下载对应平台的 tarball，放入 `prebuilds/`。
2. 无需修改任何代码——`rebuild-sqlite.js` 自动扫描所有 tarball，`db/index.ts` 运行时自动选择。

NMV 对照表（供参考）：

| Electron | NMV |
|---|---|
| 30 | 125 |
| 31 | 128 |
| 32 | 130 |
| 33 | 132 |
| 34 | 134 |

---

## Windows 安装步骤（企业代理环境）

```bat
git clone https://github.com/skyseraph/SkillNexus.git
cd SkillNexus
npm install
npm run dev
```

`npm install` 触发 `postinstall`，自动执行 `rebuild-sqlite.js`：
- 提取所有可用的预编译二进制（按 NMV 命名）
- 若 `better-sqlite3` 被跳过，自动 vendor copy

如果之前安装过旧版本，`resources\win32-x64\` 里有旧二进制，需要先清理：

```bat
rmdir /s /q resources\win32-x64
npm install
```

---

## 排查清单

| 症状 | 原因 | 解决 |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | npm 跳过安装，vendor copy 未执行 | 确认 `vendor/better-sqlite3/` 存在；重新 `npm install` |
| `NODE_MODULE_VERSION X ... requires Y` | prebuilds/ 缺少对应 NMV 的 tarball | 下载对应版本 tarball 放入 `prebuilds/`，重新 `npm install` |
| 启动后立即崩溃，无错误信息 | `resources/` 路径错误 | 检查 `getNativeBindingPath()` 返回值是否为 `undefined` |
