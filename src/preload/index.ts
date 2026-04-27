import { contextBridge, ipcRenderer } from 'electron'
import type { Skill, SkillFileEntry, TestCase, EvalResult, EvalHistoryPage, EvalExport, AppConfigPublic, AppConfig, ScannedSkill, ScanResult, ToolTarget, MarketSkill, EvoRunResult, LLMProvider, ThreeConditionResult, SkillRankEntry, SkillScore5D, GithubSkillResult, EvoAnalysis, EvoConfig, EvoChainEntry, EvoSkillResult, ParetoPoint, CoEvoResult, TransferReport, SkillXResult, SkillClawResult, JobEntry, PluginManifest } from '../shared/types'
import type { TelemetryEventName, TelemetryEventProperties } from '../shared/telemetry-events'

const api = {
  skills: {
    getAll: (): Promise<Skill[]> => ipcRenderer.invoke('skills:getAll'),
    getEvolved: (): Promise<Skill[]> => ipcRenderer.invoke('skills:getEvolved'),
    install: (filePath: string): Promise<Skill> => ipcRenderer.invoke('skills:install', filePath),
    installDir: (dirPath: string): Promise<Skill> => ipcRenderer.invoke('skills:installDir', dirPath),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke('skills:uninstall', id),
    listFiles: (skillId: string): Promise<SkillFileEntry[]> => ipcRenderer.invoke('skills:listFiles', skillId),
    readFile: (filePath: string, skillId: string): Promise<string> => ipcRenderer.invoke('skills:readFile', filePath, skillId),
    openDialog: (mode: 'file' | 'dir'): Promise<string | null> => ipcRenderer.invoke('skills:openDialog', mode),
    scan: (): Promise<ScanResult> => ipcRenderer.invoke('skills:scan'),
    importScanned: (filePath: string): Promise<Skill> => ipcRenderer.invoke('skills:importScanned', filePath),
    export: (skillId: string, toolId: string, mode: 'copy' | 'symlink'): Promise<void> =>
      ipcRenderer.invoke('skills:export', skillId, toolId, mode),
    getToolTargets: (): Promise<ToolTarget[]> => ipcRenderer.invoke('skills:getToolTargets'),
    setTrustLevel: (id: string, level: 1 | 2 | 3 | 4): Promise<void> => ipcRenderer.invoke('skills:setTrustLevel', id, level),
    getEvoChain: (skillId: string): Promise<EvoChainEntry[]> => ipcRenderer.invoke('skills:getEvoChain', skillId),
    getContent: (skillId: string): Promise<string> => ipcRenderer.invoke('skills:getContent', skillId),
    getUninstallInfo: (id: string): Promise<{ evalCount: number; tcCount: number; evolvedCount: number }> =>
      ipcRenderer.invoke('skills:getUninstallInfo', id)
  },
  marketplace: {
    search: (query: string): Promise<MarketSkill[]> => ipcRenderer.invoke('marketplace:search', query),
    install: (skill: MarketSkill): Promise<Skill> => ipcRenderer.invoke('marketplace:install', skill)
  },
  eval: {
    start: (skillId: string, testCaseIds: string[]): Promise<string> =>
      ipcRenderer.invoke('eval:start', skillId, testCaseIds),
    history: (skillId: string, limit = 20, offset = 0): Promise<EvalHistoryPage> =>
      ipcRenderer.invoke('eval:history', skillId, limit, offset),
    getById: (evalId: string): Promise<EvalResult | null> =>
      ipcRenderer.invoke('eval:getById', evalId),
    exportHistory: (skillId: string): Promise<EvalExport> =>
      ipcRenderer.invoke('eval:exportHistory', skillId),
    historyAll: (): Promise<SkillRankEntry[]> =>
      ipcRenderer.invoke('eval:historyAll'),
    startThreeCondition: (skillId: string, testCaseIds: string[]): Promise<ThreeConditionResult> =>
      ipcRenderer.invoke('eval:startThreeCondition', skillId, testCaseIds),
    deleteRecord: (evalId: string): Promise<void> =>
      ipcRenderer.invoke('eval:delete', evalId),
    getByJobId: (jobId: string): Promise<import('../shared/types').EvalResult[]> =>
      ipcRenderer.invoke('eval:getByJobId', jobId),
    deleteByJobId: (jobId: string): Promise<void> =>
      ipcRenderer.invoke('eval:deleteByJobId', jobId),
    setLabel: (historyId: string, label: string | null): Promise<void> =>
      ipcRenderer.invoke('eval:setLabel', historyId, label),
    onProgress: (cb: (data: { jobId: string; progress: number; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { jobId: string; progress: number; message: string }) => cb(data)
      ipcRenderer.on('eval:progress', handler)
      return () => ipcRenderer.removeListener('eval:progress', handler)
    }
  },
  studio: {
    generate: (prompt: string): Promise<string> => ipcRenderer.invoke('studio:generate', prompt),
    generateStream: (prompt: string): Promise<void> => ipcRenderer.invoke('studio:generateStream', prompt),
    evolve: (skillId: string, config: EvoConfig): Promise<void> => ipcRenderer.invoke('studio:evolve', skillId, config),
    generateFromExamples: (examples: Array<{ input: string; output: string }>, description?: string): Promise<void> =>
      ipcRenderer.invoke('studio:generateFromExamples', examples, description),
    install: (content: string, name: string, parentSkillId?: string): Promise<Skill> =>
      ipcRenderer.invoke('studio:install', content, name, parentSkillId),
    extract: (conversation: string, sourceSkillId?: string, sourceSkillContent?: string): Promise<void> =>
      ipcRenderer.invoke('studio:extract', conversation, sourceSkillId, sourceSkillContent),
    scoreSkill: (content: string): Promise<SkillScore5D> =>
      ipcRenderer.invoke('studio:scoreSkill', content),
    similarSkills: (content: string): Promise<Skill[]> =>
      ipcRenderer.invoke('studio:similarSkills', content),
    searchGithub: (query: string): Promise<GithubSkillResult[]> =>
      ipcRenderer.invoke('studio:searchGithub', query),
    fetchGithubContent: (rawUrl: string): Promise<string> =>
      ipcRenderer.invoke('studio:fetchGithubContent', rawUrl),
    recentEvalHistory: (limit: number, skillId?: string, labels?: string[]): Promise<{ id: string; skillName: string; skillContent: string; inputPrompt: string; output: string; label: string | null; totalScore: number; createdAt: number }[]> =>
      ipcRenderer.invoke('studio:recentEvalHistory', limit, skillId, labels),
    onChunk: (cb: (data: { chunk: string; done: boolean; noSkill?: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { chunk: string; done: boolean; noSkill?: boolean }) => cb(data)
      ipcRenderer.on('studio:chunk', handler)
      return () => ipcRenderer.removeListener('studio:chunk', handler)
    },
    onAnalysis: (cb: (data: EvoAnalysis) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: EvoAnalysis) => cb(data)
      ipcRenderer.on('studio:analysis', handler)
      return () => ipcRenderer.removeListener('studio:analysis', handler)
    },
    onProgress: (cb: (data: { stage: string; iteration: number; total: number; done?: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; iteration: number; total: number; done?: boolean }) => cb(data)
      ipcRenderer.on('studio:progress', handler)
      return () => ipcRenderer.removeListener('studio:progress', handler)
    }
  },
  testcases: {
    getBySkill: (skillId: string): Promise<TestCase[]> =>
      ipcRenderer.invoke('testcases:getBySkill', skillId),
    create: (tc: Omit<TestCase, 'id' | 'createdAt'>): Promise<TestCase> =>
      ipcRenderer.invoke('testcases:create', tc),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('testcases:delete', id),
    generate: (skillId: string, count: number): Promise<TestCase[]> =>
      ipcRenderer.invoke('testcases:generate', skillId, count),
    importJson: (skillId: string, items: unknown[]): Promise<{ imported: TestCase[]; errors: string[] }> =>
      ipcRenderer.invoke('testcases:importJson', skillId, items)
  },
  evo: {
    installAndEval: (originalSkillId: string, evolvedContent: string): Promise<EvoRunResult> =>
      ipcRenderer.invoke('evo:installAndEval', originalSkillId, evolvedContent),
    runEvoSkill: (config: { skillId: string; maxIterations?: number }): Promise<EvoSkillResult> =>
      ipcRenderer.invoke('evo:runEvoSkill', config),
    getParetoFrontier: (skillId: string): Promise<ParetoPoint[]> =>
      ipcRenderer.invoke('evo:getParetoFrontier', skillId),
    runCoEvo: (config: { skillId: string; maxRounds?: number }): Promise<CoEvoResult> =>
      ipcRenderer.invoke('evo:runCoEvo', config),
    runTransferTest: (skillId: string, models: string[]): Promise<TransferReport> =>
      ipcRenderer.invoke('evo:runTransferTest', skillId, models),
    runSkillX: (config: { skillId: string; minScore?: number; sampleLimit?: number }): Promise<SkillXResult> =>
      ipcRenderer.invoke('evo:runSkillX', config),
    runSkillClaw: (config: { skillId: string; windowSize?: number }): Promise<SkillClawResult> =>
      ipcRenderer.invoke('evo:runSkillClaw', config),
    listPlugins: (): Promise<PluginManifest[]> =>
      ipcRenderer.invoke('evo:listPlugins'),
    runPlugin: (config: { skillId: string; pluginId: string }): Promise<{ evolvedContent: string; engine: string }> =>
      ipcRenderer.invoke('evo:runPlugin', config)
  },
  config: {
    get: (): Promise<AppConfigPublic> => ipcRenderer.invoke('config:get'),
    set: (config: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke('config:set', config),
    test: (providerId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:test', providerId),
    saveProvider: (p: LLMProvider): Promise<void> =>
      ipcRenderer.invoke('config:saveProvider', p),
    deleteProvider: (id: string): Promise<void> =>
      ipcRenderer.invoke('config:deleteProvider', id),
    setActive: (id: string): Promise<void> =>
      ipcRenderer.invoke('config:setActive', id)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', filePath)
  },
  jobs: {
    list: (filter?: 'all' | 'eval' | 'evo'): Promise<JobEntry[]> =>
      ipcRenderer.invoke('jobs:list', filter)
  },
  demo: {
    enter: (): Promise<void> => ipcRenderer.invoke('demo:enter'),
    exit: (): Promise<void> => ipcRenderer.invoke('demo:exit'),
    isActive: (): Promise<boolean> => ipcRenderer.invoke('demo:isActive')
  },
  telemetry: {
    track: (name: TelemetryEventName, properties?: TelemetryEventProperties): Promise<void> =>
      ipcRenderer.invoke('telemetry:track', name, properties),
    getConsent: (): Promise<{ enabled: boolean; asked: boolean }> =>
      ipcRenderer.invoke('telemetry:getConsent'),
    setConsent: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('telemetry:setConsent', enabled)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
