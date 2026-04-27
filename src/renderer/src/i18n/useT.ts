import { useState, useEffect, useCallback } from 'react'
import { zh } from './zh'
import { en } from './en'
import type { Lang } from './types'

export function useT() {
  const [lang, setLang] = useState<Lang>('zh')

  useEffect(() => {
    window.api.config.get().then(c => setLang((c.language ?? 'zh') as Lang))
  }, [])

  return useCallback((key: string, vars?: Record<string, string | number>) => {
    const dict = lang === 'en' ? en : zh
    let str = dict[key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      })
    }
    return str
  }, [lang])
}
