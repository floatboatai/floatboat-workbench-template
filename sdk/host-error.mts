// ABOUTME: Host SDK 的公开错误契约，可由 Node 与浏览器传输适配器共同使用。

export interface HostFailure {
  code: string;
  message?: string;
  requestId?: string;
  execution?: 'not-executed' | 'executed' | 'unknown';
}

export class WorkbenchHostError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly execution: 'not-executed' | 'executed' | 'unknown';
  readonly status?: number;

  constructor(error: HostFailure, status?: number) {
    super(error.message ?? error.code ?? 'WORKBENCH_HOST_ERROR');
    this.name = 'WorkbenchHostError';
    this.code = error.code ?? 'WORKBENCH_HOST_ERROR';
    this.requestId = error.requestId;
    this.execution = error.execution ?? 'not-executed';
    this.status = status;
  }
}
