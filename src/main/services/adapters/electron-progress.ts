import type { BrowserWindow } from 'electron'
import type { IProgressReporter } from '../sdk/interfaces'

export class ElectronProgressReporter implements IProgressReporter {
  constructor(private readonly win: BrowserWindow | null) {}

  report(event: string, data: Record<string, unknown>): void {
    this.win?.webContents.send(event, data)
  }
}
