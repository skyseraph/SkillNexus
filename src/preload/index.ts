import { contextBridge, ipcRenderer } from 'electron'
import type { Skill, SkillFileEntry, TestCase, EvalResult, EvalHistoryPage, EvalExport, AppConfigPublic, AppConfig, ScannedSkill, ScanResult, ToolTarget, MarketSkill, EvoRunResult, LLMProvider, ThreeConditionResult, SkillRankEntry, SkillScore5D, GithubSkillResult } from '../shared/types'

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
    setTrustLevel: (id: string, level: 1 | 2 | 3 | 4): Promise<void> => ipcRenderer.invoke('skills:setTrustLevel', id, level)
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
    exportHistory: (skillId: string): Promise<EvalExport> =>
      ipcRenderer.invoke('eval:exportHistory', skillId),
    historyAll: (): Promise<SkillRankEntry[]> =>
      ipcRenderer.invoke('eval:historyAll'),
    startThreeCondition: (skillId: string, testCaseIds: string[]): Promise<ThreeConditionResult> =>
      ipcRenderer.invoke('eval:startThreeCondition', skillId, testCaseIds),
    onProgress: (cb: (data: { jobId: string; progress: number; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { jobId: string; progress: number; message: string }) => cb(data)
      ipcRenderer.on('eval:progress', handler)
      return () => ipcRenderer.removeListener('eval:progress', handler)
    }
  },
  studio: {
    generate: (prompt: string): Promise<string> => ipcRenderer.invoke('studio:generate', prompt),
    generateStream: (prompt: string): Promise<void> => ipcRenderer.invoke('studio:generateStream', prompt),
    evolve: (skillId: string, strategy: string): Promise<void> => ipcRenderer.invoke('studio:evolve', skillId, strategy),
    generateFromExamples: (examples: Array<{ input: string; output: string }>, description?: string): Promise<void> =>
      ipcRenderer.invoke('studio:generateFromExamples', examples, description),
    install: (content: string, name: string): Promise<Skill> =>
      ipcRenderer.invoke('studio:install', content, name),
    extract: (conversation: string): Promise<void> =>
      ipcRenderer.invoke('studio:extract', conversation),
    scoreSkill: (content: string): Promise<SkillScore5D> =>
      ipcRenderer.invoke('studio:scoreSkill', content),
    similarSkills: (content: string): Promise<Skill[]> =>
      ipcRenderer.invoke('studio:similarSkills', content),
    searchGithub: (query: string): Promise<GithubSkillResult[]> =>
      ipcRenderer.invoke('studio:searchGithub', query),
    fetchGithubContent: (rawUrl: string): Promise<string> =>
      ipcRenderer.invoke('studio:fetchGithubContent', rawUrl),
    recentEvalHistory: (limit: number): Promise<{ skillName: string; inputPrompt: string; output: string; createdAt: number }[]> =>
      ipcRenderer.invoke('studio:recentEvalHistory', limit),
    onChunk: (cb: (data: { chunk: string; done: boolean; noSkill?: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { chunk: string; done: boolean; noSkill?: boolean }) => cb(data)
      ipcRenderer.on('studio:chunk', handler)
      return () => ipcRenderer.removeListener('studio:chunk', handler)
    }
  },
  testcases: {
    getBySkill: (skillId: string): Promise<TestCase[]> =>
      ipcRenderer.invoke('testcases:getBySkill', skillId),
    create: (tc: Omit<TestCase, 'id' | 'createdAt'>): Promise<TestCase> =>
      ipcRenderer.invoke('testcases:create', tc),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('testcases:delete', id),
    generate: (skillId: string, count: number): Promise<TestCase[]> =>
      ipcRenderer.invoke('testcases:generate', skillId, count)
  },
  evo: {
    installAndEval: (originalSkillId: string, evolvedContent: string): Promise<EvoRunResult> =>
      ipcRenderer.invoke('evo:installAndEval', originalSkillId, evolvedContent)
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
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
