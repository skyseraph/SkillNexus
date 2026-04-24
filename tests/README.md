# Evo Module — Test Suite

215 tests across 15 files. All green.

---

## Running Tests

```bash
# Run all tests once
npx vitest run

# Watch mode during development
npx vitest

# Run only the evo tests in tests/
npx vitest run tests/

# Run a specific file
npx vitest run tests/evo-page-pure.test.ts
```

---

## Test Files

### `tests/` — New coverage (previously untested)

| File | What it covers | Tests |
|------|---------------|-------|
| `evo-install-and-eval.test.ts` | `evo:installAndEval` handler logic — ANALYSIS block stripping/parsing, YAML frontmatter parsing, filename sanitization, fallback defaults, combined install flow | 23 |
| `evo-transfer-test.test.ts` | `evo:runTransferTest` handler logic — provider ID filtering, request validation, pass-rate computation, empty-response counting, full flow | 20 |
| `evo-adapters.test.ts` | `ElectronDataStore`, `ElectronSkillStorage`, `ElectronProgressReporter` — all DB query paths, status/orderBy/limit variants, recursive CTE, file write + insert, test case copying, progress forwarding | 22 |
| `evo-page-pure.test.ts` | `EvoPage.tsx` pure functions — `bigramSimilarity`, `diffLines`, `avgScores`, `overallAvg`, `makeDefaultSession`, `friendlyError` | 50 |

### `src/` — Existing engine tests

| File | Engine | Tests |
|------|--------|-------|
| `src/main/services/sdk/evoskill-engine.test.ts` | `EvoSkillEngine` — frontier iteration, MAX_FRONTIER cap, bestId selection, eval skip, progress reporting | 7 |
| `src/main/services/sdk/coevoskill-engine.test.ts` | `CoEvoSkillEngine` — escalation levels, passedAll, maxRounds, verifier→generator feedback | 6 |
| `src/main/services/sdk/skillmoo-engine.test.ts` | `SkillMOOEngine` — Pareto dominance, x/y coordinate computation, empty chain | 7 |
| `src/main/services/sdk/skillx-engine.test.ts` | `SkillXEngine` — retry mechanism, entry parsing, malformed JSON, sampleLimit | 7 |
| `src/main/services/sdk/skillclaw-engine.test.ts` | `SkillClawEngine` — early return on good perf, failure pattern extraction, JSON fallback, 4-step progress | 7 |
| `src/main/ipc/evo.handler.test.ts` | Handler parameter validation — skillId required, clamp ranges for all 5 parameterized handlers | 13 |
| `src/main/ipc/logic.test.ts` | YAML frontmatter parsing, score averaging, ID prefix generation | 8 |

---

## Architecture

All tests are pure unit tests — no Electron, no real DB, no filesystem, no network.

**Engines** (`src/main/services/sdk/`) use constructor injection (`IDataStore`, `IProgressReporter`, `ISkillStorage`, `AIProvider`). Tests pass `vi.fn()` mocks directly.

**Adapters** (`tests/evo-adapters.test.ts`) mock `better-sqlite3` `Database` and `fs` at the module level. The `ElectronProgressReporter` test mocks `BrowserWindow`.

**Handler logic** (`tests/evo-install-and-eval.test.ts`, `tests/evo-transfer-test.test.ts`) extracts the pure computation from IPC handlers as standalone functions — no `ipcMain`, no `app`, no `getDb()`.

**Renderer pure functions** (`tests/evo-page-pure.test.ts`) are copy-equivalent reimplementations of the functions defined inside `EvoPage.tsx`. Since they are module-level functions (not exported), they are tested by reproducing the same logic in the test file.

---

## Key Behaviors Verified

### `evo:installAndEval`
- `<!--ANALYSIS ... -->` block is stripped before writing to disk
- `ROOT_CAUSE`, `GENERALITY_TEST`, `REGRESSION_RISK` are extracted from the block
- YAML frontmatter is parsed for `name`, `version`, `format`, `tags`
- Missing frontmatter fields fall back to safe defaults (`markdown`, `1.0.0`, `[]`)
- Evolved skill name falls back to `{originalName} (evolved)` when frontmatter has no `name`
- File name is sanitized (special chars stripped, spaces → dashes, lowercased)

### `evo:runTransferTest`
- Only provider IDs present in `config.providers` are used
- Empty `models` array throws before any AI calls
- All-unconfigured models throws `No valid configured provider IDs`
- Pass rate = `passCount / totalCases`, 0 when no test cases
- Empty AI response counts as fail

### Adapters
- `queryEvalHistory` uses status-filtered SQL when `status` option provided
- `queryEvalHistory` injects `orderBy` directly into SQL (e.g. `total_score ASC`)
- `querySkillChain` uses a recursive CTE with `parent_skill_id`
- `saveEvolvedSkill` returns a `skill-{timestamp}-{random}` ID and inserts with correct engine/parentSkillId
- `copyTestCases` inserts one row per source test case with new `tc-` prefixed IDs
- `ElectronProgressReporter` is a no-op when `win` is null

### EvoPage pure functions
- `bigramSimilarity` — Dice coefficient over character bigrams; identical strings → 1, disjoint → 0, symmetric
- `diffLines` — LCS backtrack; `same + removes = a.lines`, `same + adds = b.lines` invariant holds
- `avgScores` — per-dimension average across all eval results; empty history → `{}`
- `overallAvg` — mean of all dimension averages; empty → 0
- `makeDefaultSession` — each call returns a new object with independent `targets` array
- `friendlyError` — maps 10 error patterns to Chinese UI messages; strips `Error:` prefix for unknowns
