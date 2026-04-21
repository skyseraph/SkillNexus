import { contextBridge, ipcRenderer } from 'electron'
import type { Skill, SkillFileEntry, TestCase, EvalResult, AppConfigPublic, AppConfig, ScannedSkill, ToolTarget, MarketSkill, EvoRunResult, LLMProvider } from '../shared/types'

const api = {
  skills: {
    getAll: (): Promise<Skill[]> => ipcRenderer.invoke('skills:getAll'),
    install: (filePath: string): Promise<Skill> => ipcRenderer.invoke('skills:install', filePath),
    installDir: (dirPath: string): Promise<Skill> => ipcRenderer.invoke('skills:installDir', dirPath),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke('skills:uninstall', id),
    listFiles: (skillId: string): Promise<SkillFileEntry[]> => ipcRenderer.invoke('skills:listFiles', skillId),
    readFile: (filePath: string, skillId: string): Promise<string> => ipcRenderer.invoke('skills:readFile', filePath, skillId),
    openDialog: (mode: 'file' | 'dir'): Promise<string | null> => ipcRenderer.invoke('skills:openDialog', mode),
    scan: (): Promise<ScannedSkill[]> => ipcRenderer.invoke('skills:scan'),
    importScanned: (filePath: string): Promise<Skill> => ipcRenderer.invoke('skills:importScanned', filePath),
    export: (skillId: string, toolId: string, mode: 'copy' | 'symlink'): Promise<void> =>
      ipcRenderer.invoke('skills:export', skillId, toolId, mode),
    getToolTargets: (): Promise<ToolTarget[]> => ipcRenderer.invoke('skills:getToolTargets')
  },
  marketplace: {
    search: (query: string): Promise<MarketSkill[]> => ipcRenderer.invoke('marketplace:search', query),
    install: (skill: MarketSkill): Promise<Skill> => ipcRenderer.invoke('marketplace:install', skill)
  },
  eval: {
    start: (skillId: string, testCaseIds: string[]): Promise<string> =>
      ipcRenderer.invoke('eval:start', skillId, testCaseIds),
    history: (skillId: string): Promise<EvalResult[]> =>
      ipcRenderer.invoke('eval:history', skillId),
    onProgress: (cb: (data: { jobId: string; progress: number; message: string }) => void) => {
      ipcRenderer.on('eval:progress', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('eval:progress')
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
    onChunk: (cb: (data: { chunk: string; done: boolean }) => void) => {
      ipcRenderer.on('studio:chunk', (_event, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('studio:chunk')
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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
