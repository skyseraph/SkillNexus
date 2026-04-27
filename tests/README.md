# SkillNexus — Test Suite

653 tests across 37 files. All green.

---

## Running Tests

```bash
# Run all tests once
npx vitest run

# Watch mode during development
npx vitest

# Run a specific directory
npx vitest run tests/evo/
npx vitest run tests/security/

# Run a specific file
npx vitest run tests/evo/evo-page-pure.test.ts
```

---

## Directory Structure

```
tests/
├── config/
│   ├── provider-config.test.ts       provider presets, baseURL validation, active model selection
│   └── provider-management.test.ts   saveProvider, deleteProvider, setActive (CRUD + immutability)
├── eval/
│   ├── eval-history.test.ts          SkillRankEntry construction, trend array, ranking sort
│   ├── eval-scoring.test.ts          grepScore, commandScore, 8-dim averaging, framework structure
│   ├── eval-three-condition.test.ts  validateInput, buildJobIds, computeDeltas, condition semantics
│   └── three-condition-cleanup.test.ts  skill-noskill-* / skill-gen-* 7-day cleanup predicate
├── evo/
│   ├── evo-adapters.test.ts          ElectronDataStore, ElectronSkillStorage, ElectronProgressReporter
│   ├── evo-chain.test.ts             findRoot, bfsChain, buildChainEntries, computeAvgScore
│   ├── evo-cycle-detection.test.ts   walkAncestors — linear chain, cycle breaking, depth limit
│   ├── evo-install-and-eval.test.ts  YAML frontmatter parsing, filename sanitization, install flow
│   ├── evo-page-pure.test.ts         bigramSimilarity, diffLines, avgScores, makeDefaultSession, friendlyError
│   └── evo-transfer-test.test.ts     filterValidModels, validateTransferRequest, computePassRate
├── security/
│   ├── command-injection.test.ts     commandScore exit-code, OUTPUT truncation, timeout config
│   ├── ipc-security.test.ts          SEC-R1 through SEC-R7 (path whitelist, sanitize, protocol guard)
│   ├── ipc-security-extended.test.ts SEC-R1/R2/R4/R7 edge cases (sibling prefix, vbscript, blob, ws://)
│   └── plugin-loader-security.test.ts  path containment, plugin schema validation
├── skill/
│   ├── skill-export.test.ts          TOOL_DEFAULTS (8 tools), resolveToolDir, buildExportPath
│   ├── skill-parse.test.ts           parseSkillContent, sanitizeSkillName
│   └── skill-trust-level.test.ts     validateTrustLevelUpgrade, T4 prerequisite, labels
├── studio/
│   ├── studio-agent-skill.test.ts    isAgentSkill, parseScore5D (agent vs single), clamp, fallback
│   ├── studio-analysis.test.ts       stripAnalysisBlock, parseAnalysisBlock, 5D score parsing
│   ├── studio-generation-modes.test.ts  creation modes, EvoConfig validation, extractWeakDimensions
│   └── studio-install.test.ts        sanitizeInstallName, buildInstallFilePath, validateInstallContent
├── testcase/
│   └── testcase-logic.test.ts        parseNdjsonLine, importJsonTestCases, judgeType semantics
└── trending/
    └── trending-logic.test.ts        sortByDim, getMedal, getDeltaIndicator, getDimScore

src/ (co-located tests)
├── main/db/index.test.ts             initDatabase, getDb singleton, uninitialized guard
├── main/ipc/evo.handler.test.ts      handler parameter validation, clamp ranges
├── main/services/sdk/
│   ├── base-engine.test.ts
│   ├── coevoskill-engine.test.ts     escalation levels, passedAll, maxRounds
│   ├── evoskill-engine.test.ts       frontier iteration, MAX_FRONTIER cap, bestId selection
│   ├── skillclaw-engine.test.ts      early return, failure pattern extraction, 4-step progress
│   ├── skillmoo-engine.test.ts       Pareto dominance, x/y coordinates, empty chain
│   └── skillx-engine.test.ts         retry mechanism, entry parsing, malformed JSON
├── main/services/telemetry.test.ts   dev mode no-op, consent state
├── renderer/src/api.test.ts          window.api contract (mocked IPC surface)
└── renderer/src/pages/
    ├── FileTree.test.ts              buildTree, sort order, ext detection
    └── HomePage.test.ts              skill list logic
```

---

## Architecture

All tests are pure unit tests — no Electron, no real DB, no filesystem, no network.

**Engines** (`src/main/services/sdk/`) use constructor injection (`IDataStore`, `IProgressReporter`, `ISkillStorage`, `AIProvider`). Tests pass `vi.fn()` mocks directly.

**Adapters** (`tests/evo/evo-adapters.test.ts`) mock `better-sqlite3` `Database` and `fs` at the module level.

**Handler logic** (`tests/evo/evo-install-and-eval.test.ts`, `tests/evo/evo-transfer-test.test.ts`) extracts pure computation from IPC handlers as standalone functions — no `ipcMain`, no `app`, no `getDb()`.

**Renderer pure functions** (`tests/evo/evo-page-pure.test.ts`) are copy-equivalent reimplementations of functions defined inside `EvoPage.tsx`.
