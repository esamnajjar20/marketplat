import type { Message } from '@/types/conversation.types';

export type DisplayMessage = Message & {
  clientStatus?: 'sending' | 'queued' | 'failed' | 'cancelled';
  queueId?: number;
  lastError?: { status: number; message?: string };
  clientHasImage?: boolean;
  clientHasAudio?: boolean;
  clientHasFile?: boolean;
  clientFileName?: string;
};
