import type { AIProvider, AIRequestOptions } from '../ai-provider/types'
import { withTimeout, AI_TIMEOUT_MS } from '../eval-job'
import type { IDataStore, IProgressReporter, ISkillStorage } from './interfaces'

export abstract class BaseEvolutionEngine<TConfig, TResult> {
  constructor(
    protected readonly ai: AIProvider,
    protected readonly model: string,
    protected readonly store: IDataStore,
    protected readonly reporter: IProgressReporter,
    protected readonly storage: ISkillStorage,
  ) {}

  abstract run(config: TConfig): Promise<TResult>

  protected async callAI(opts: Omit<AIRequestOptions, 'model'>): Promise<string> {
    const result = await withTimeout(
      this.ai.call({ ...opts, model: this.model }),
      AI_TIMEOUT_MS,
      this.constructor.name
    )
    return result.content
  }
}
