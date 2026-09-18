// ABOUTME: 工作台 ASR 仅传音频与公开转写，不承载 Host 凭据或窗口身份。

export interface AsrStartInput {
  sampleRate: 16000;
  format: 'pcm';
  semanticPunctuationEnabled?: boolean;
  speakerDiarizationEnabled?: boolean;
  hotwords?: string[];
}

export interface AsrUtterance {
  text: string;
  definite?: boolean;
  speakerId?: string | number;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface AsrSession {
  streamId: string;
  status: 'running' | 'stopping' | 'completed' | 'failed' | 'cancelled';
  text: string;
  errorCode: string | null;
  nextSequence: number;
}

export interface AsrProgress {
  type: 'started' | 'partial' | 'final' | 'stopped' | 'error';
  text?: string;
  speakerId?: string | number;
  utterances?: AsrUtterance[];
  isSentenceEnd?: boolean;
  errorCode?: string;
  recoverable?: boolean;
}

export type AsrEvent =
  | { type: 'event'; cursor: number; event: AsrProgress }
  | { type: 'result'; cursor: number; session: AsrSession }
  | { type: 'done'; requestId: string };
