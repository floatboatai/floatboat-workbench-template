// ABOUTME: 工作台可交付服务声明与 Host 授权结果，不包含供应商凭据。
import { z } from 'zod';
export const workbenchServiceDeclarationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/u),
  provider: z.string().regex(/^connector:[a-z0-9][a-z0-9_-]{0,99}$/u),
}).strict();
export interface WorkbenchConnectionReference {
  provider: string;
  accountId: string;
  displayName: string;
  connectionId: string;
}
export type WorkbenchConnectionResult = {
  requestId: string;
  status: 'requested' | 'connected' | 'cancelled' | 'failed' | 'expired';
  connection?: WorkbenchConnectionReference;
  error?: string;
};
export const workbenchConnectionCompletionSchema = z.discriminatedUnion('status', [
  z.object({ requestId: z.string().uuid(), status: z.literal('connected'), connectionName: z.string().min(1).max(256) }).strict(),
  z.object({ requestId: z.string().uuid(), status: z.literal('cancelled') }).strict(),
  z.object({ requestId: z.string().uuid(), status: z.literal('failed') }).strict(),
]);
export type WorkbenchConnectionCompletion = z.infer<typeof workbenchConnectionCompletionSchema>;
