let _demoMode = false

export function isDemoMode(): boolean {
  return _demoMode
}

export function enterDemoMode(): void {
  _demoMode = true
}

export function exitDemoMode(): void {
  _demoMode = false
}
