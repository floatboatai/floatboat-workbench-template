// ABOUTME: 工作台文件音频能力的公开类型，使用逻辑资源引用隔离本机路径。

export interface AudioResourceReference {
  resourceId: string;
  relativePath: string;
}

export type AudioInputFormat = 'mp3' | 'm4a' | 'aac' | 'wav' | 'flac' | 'ogg' | 'webm';

export interface AudioProbe {
  format: AudioInputFormat;
  durationMs: number;
  encodedByteCount: number;
  sampleRate: number;
  channelCount: number;
}

export type AudioJobKind = 'denoise' | 'transcribeFile';
export type AudioJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AudioUtterance {
  text: string;
  speakerId?: string | number;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface AudioJob {
  jobId: string;
  kind: AudioJobKind;
  status: AudioJobStatus;
  processedMs: number;
  durationMs: number;
  text: string;
  utterances: AudioUtterance[];
  output: (AudioResourceReference & { format: 'm4a' | 'wav' | 'mp3' }) | null;
  errorCode: string | null;
}

export type AudioProgress =
  | { type: 'progress'; stage: 'probe' | 'denoise' | 'decode' | 'transcribe'; processedMs: number; durationMs: number }
  | { type: 'partial' | 'final'; text: string; utterances?: AudioUtterance[] }
  | { type: 'error'; errorCode: string };

/** 与 ASR、Agent 事件流一致，流末尾固定追加一条 done 帧。 */
export type AudioEvent =
  | { type: 'event'; cursor: number; event: AudioProgress }
  | { type: 'result'; cursor: number; job: AudioJob }
  | { type: 'done'; requestId: string };
