/**
 * Telemetry event definitions — the single source of truth for all tracked events.
 *
 * Rules:
 *  - Never include user content (Skill text, prompts, outputs, API keys, file paths)
 *  - Always use snake_case event names prefixed by domain
 *  - All properties are optional and of primitive type
 */

export type TelemetryEventName =
  // App lifecycle
  | 'app_launched'
  // Skill management
  | 'skill_installed'
  | 'skill_uninstalled'
  | 'skill_scanned'
  | 'skill_exported'
  // Studio
  | 'studio_generated'
  | 'studio_installed'
  // Eval
  | 'eval_ran'
  | 'eval_three_condition_ran'
  | 'eval_compare_ran'
  // Evolution
  | 'evo_ran'
  | 'evo_evoskill_ran'
  | 'evo_coevo_ran'
  | 'evo_skillx_ran'
  | 'evo_skillclaw_ran'
  | 'evo_transfer_ran'
  // Marketplace
  | 'marketplace_searched'
  | 'marketplace_installed'
  // Settings
  | 'provider_added'
  | 'provider_tested'

export interface TelemetryEventProperties {
  // app_launched
  platform?: string
  version?: string

  // skill_installed
  skill_type?: 'single' | 'agent'
  install_source?: 'file' | 'dir' | 'marketplace' | 'scan' | 'studio'

  // skill_exported
  export_mode?: 'copy' | 'symlink'

  // studio_generated
  generation_mode?: 'describe' | 'examples' | 'extract' | 'evolve' | 'stream'

  // eval_ran
  test_case_count?: number
  judge_types?: string           // comma-separated, e.g. "llm,grep"
  skill_type_eval?: 'single' | 'agent'
  success?: boolean

  // evo_ran
  engine?: string
  paradigm?: string

  // evo_evoskill_ran / evo_coevo_ran
  iterations?: number

  // marketplace_searched
  has_results?: boolean

  // marketplace_installed
  source?: string                // repo owner (no repo name to avoid content)

  // provider_added
  provider_category?: string     // 'official' | 'cn_official' | 'aggregator' | 'local' | 'custom'
  is_preset?: boolean

  // provider_tested
  test_ok?: boolean
}

export interface TelemetryEvent {
  name: TelemetryEventName
  properties?: TelemetryEventProperties
}
