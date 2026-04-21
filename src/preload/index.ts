import { contextBridge, ipcRenderer } from 'electron'
import type { Skill, TestCase, EvalResult, AppConfig, AppConfigPublic } from '../shared/types'

const api = {
  skills: {
    getAll: (): Promise<Skill[]> => ipcRenderer.invoke('skills:getAll'),
    install: (filePath: string): Promise<Skill> => ipcRenderer.invoke('skills:install', filePath),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke('skills:uninstall', id)
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
    install: (content: string, name: string): Promise<Skill> =>
      ipcRenderer.invoke('studio:install', content, name)
  },
  testcases: {
    getBySkill: (skillId: string): Promise<TestCase[]> =>
      ipcRenderer.invoke('testcases:getBySkill', skillId),
    create: (tc: Omit<TestCase, 'id' | 'createdAt'>): Promise<TestCase> =>
      ipcRenderer.invoke('testcases:create', tc),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('testcases:delete', id)
  },
  config: {
    get: (): Promise<AppConfigPublic> => ipcRenderer.invoke('config:get'),
    set: (config: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke('config:set', config)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
