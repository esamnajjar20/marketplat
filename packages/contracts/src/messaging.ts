/** Canonical realtime contract for conversation lifecycle events.
 * Shared by API, web and native clients; the transport envelope stays SSE-neutral.
 */
export interface MessagingLiveMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl: string | null;
  audioUrl: string | null;
  fileUrl: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export type MessagingLiveEvent =
  | {
      type: 'message:new';
      conversationId: string;
      message: MessagingLiveMessage;
    }
  | {
      type: 'message:deleted';
      conversationId: string;
      messageId: string;
      deletedAt: string;
    }
  | {
      type: 'message:read';
      conversationId: string;
      readerId: string;
      messageIds: string[];
      readAt: string;
    }
  | {
      type: 'conversation:updated';
      conversationId: string;
      action: 'updated' | 'deleted';
      settings?: {
        pinnedAt: string | null;
        archivedAt: string | null;
        deletedAt: string | null;
        mutedUntil: string | null;
      };
    };
