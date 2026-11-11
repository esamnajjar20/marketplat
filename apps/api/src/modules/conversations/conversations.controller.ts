import { sendApiError } from '../../shared/errors/errorResponse';
import { ErrorCode } from '../../shared/errors/errorCodes';

import { Request, Response, NextFunction } from 'express';
import { conversationsService } from './conversations.service';
import {
  startConversationSchema,
  conversationIdSchema,
  getConversationsSchema,
  sendMessageSchema,
  getMessagesSchema,
  deleteMessageSchema,
  setConversationFlagsSchema,
  messageMarkSchema,
  mediaQuerySchema,
} from './conversations.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/auth/requireUser';
import { uploadAudio, uploadImage, uploadRawFile } from '../../config/cloudinary';
import { deleteCloudinaryAsset } from '../../shared/media/cloudinaryHelpers';
import { env } from '../../config/env';
import { parseTrustedCloudinaryMediaUrl } from './cloudinaryMediaUrl';

const MAX_MESSAGE_MEDIA_BYTES = 15 * 1024 * 1024;
const MEDIA_PROXY_TIMEOUT_MS = 12_000;

function isAllowedMediaContentType(kind: 'image' | 'audio' | 'file', value: string): boolean {
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (kind === 'image') return /^image\/(?:avif|gif|jpeg|png|webp)$/.test(mimeType);
  if (kind === 'audio') return /^audio\/(?:aac|mpeg|mp4|ogg|wav|webm)$/.test(mimeType);
  return new Set([
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-7z-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
  ]).has(mimeType);
}

function encodeRfc5987FileName(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getSafeMediaContentType(
  kind: 'image' | 'audio' | 'file',
  storedType: string,
  remoteType: string | null,
): string {
  if (isAllowedMediaContentType(kind, storedType)) return storedType.split(';', 1)[0]!.trim().toLowerCase();
  if (remoteType && isAllowedMediaContentType(kind, remoteType)) {
    return remoteType.split(';', 1)[0]!.trim().toLowerCase();
  }
  if (kind === 'image') return 'image/jpeg';
  if (kind === 'audio') return 'audio/mpeg';
  return 'application/octet-stream';
}

export const conversationsController = {
  startConversation: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = startConversationSchema.parse({ body: req.body });
      const conversation = body.adId
        ? await conversationsService.startFromAd(user.userId, body.adId)
        : body.serviceRequestId
          ? await conversationsService.startFromServiceRequest(user.userId, body.serviceRequestId)
          : await conversationsService.startFromUser(
              user.userId,
              body.userId as string,
              body.context
            );
      res.status(201).json(successResponse('Conversation ready', conversation));
    } catch (error) {
      next(error);
    }
  },

  getMyConversations: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getConversationsSchema.parse({ query: req.query });
      const result = await conversationsService.getMyConversations(user.userId, query);
      res
        .status(200)
        .json(successResponse('Conversations fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getUnreadCount: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const result = await conversationsService.getUnreadCount(user.userId);
      res.status(200).json(successResponse('Unread conversation count', result));
    } catch (error) {
      next(error);
    }
  },

  getConversationById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      const conversation = await conversationsService.getConversationById(user.userId, params.id);
      res.status(200).json(successResponse('Conversation fetched', conversation));
    } catch (error) {
      next(error);
    }
  },

  getMessages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, query } = getMessagesSchema.parse({ params: req.params, query: req.query });
      const result = await conversationsService.getMessages(user.userId, params.id, query);
      res
        .status(200)
        .json(successResponse('Messages fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  sendMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = sendMessageSchema.parse({ params: req.params, body: req.body });
      // FIX N2-MSG-IDEMPOTENCY: accept X-Offline-Op-Id so offline queue
      // replays do not create duplicate messages when the first attempt
      // committed but the response never reached the client.
      // FIX N2-HEADERS-CLEANUP: Node lowercases req.headers keys, so the
      // uppercase lookup was unreachable dead code.
      const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
      const message = await conversationsService.sendMessage(
        user.userId,
        params.id,
        {
          body: body.body,
          imageUrl: body.imageUrl,
        },
        offlineOperationId
      );
      res.status(201).json(successResponse('Message sent', message));
    } catch (error) {
      next(error);
    }
  },

  getMedia: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, query } = mediaQuerySchema.parse({ params: req.params, query: req.query });
      const media = await conversationsService.getMedia(user.userId, params.id, query.limit);
      res.status(200).json(successResponse('Conversation media fetched', media));
    } catch (error) {
      next(error);
    }
  },

  getMediaAsset: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const conversationId = String(req.params.id || '');
      const messageId = String(req.params.messageId || '');
      const kind = req.params.kind as 'image' | 'audio' | 'file';
      if (!conversationId || !messageId || !['image', 'audio', 'file'].includes(kind)) {
        sendApiError(req, res, 400, ErrorCode.BAD_REQUEST, 'Invalid media request');
        return;
      }

      const asset = await conversationsService.getMediaAsset(
        user.userId,
        conversationId,
        messageId,
        kind
      );
      const trustedUrl = parseTrustedCloudinaryMediaUrl(asset.url, env.cloudinary.cloudName);
      if (!trustedUrl) {
        sendApiError(req, res, 404, ErrorCode.MESSAGE_MEDIA_PROVIDER_UNSUPPORTED, 'Message media provider is not supported');
        return;
      }
      if (asset.fileSize !== null && asset.fileSize > MAX_MESSAGE_MEDIA_BYTES) {
        sendApiError(req, res, 413, ErrorCode.BAD_REQUEST, 'Media file exceeds the allowed size');
        return;
      }

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), MEDIA_PROXY_TIMEOUT_MS);
      let remote: globalThis.Response;
      try {
        // A delivery URL must never be allowed to redirect this privileged
        // server-side fetch to another host or an internal address.
        remote = await fetch(trustedUrl.href, {
          redirect: 'error',
          signal: abortController.signal,
        });
      } catch {
        clearTimeout(timeout);
        sendApiError(req, res, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Media provider unavailable');
        return;
      }

      if (!remote.ok || !remote.body) {
        clearTimeout(timeout);
        await remote.body?.cancel().catch(() => undefined);
        sendApiError(req, res, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Media provider unavailable');
        return;
      }

      const contentLengthHeader = remote.headers.get('content-length');
      const declaredLength = contentLengthHeader && /^\d+$/.test(contentLengthHeader)
        ? Number(contentLengthHeader)
        : null;
      if (declaredLength !== null && declaredLength > MAX_MESSAGE_MEDIA_BYTES) {
        clearTimeout(timeout);
        await remote.body.cancel().catch(() => undefined);
        sendApiError(req, res, 413, ErrorCode.BAD_REQUEST, 'Media file exceeds the allowed size');
        return;
      }

      const contentType = getSafeMediaContentType(kind, asset.mimeType, remote.headers.get('content-type'));
      const safeFileName = (asset.fileName || `message-${messageId}`)
        .replace(/[\u0000-\u001f\u007f\/\\"]/g, '_')
        .slice(0, 180);
      res.status(200);
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Content-Disposition', kind === 'file'
        ? `attachment; filename="download"; filename*=UTF-8''${encodeRfc5987FileName(safeFileName)}`
        : 'inline');

      const reader = remote.body.getReader();
      let sentBytes = 0;
      const onClientClose = () => {
        if (!res.writableEnded) abortController.abort();
      };
      res.once('close', onClientClose);
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!chunk.value) continue;
          sentBytes += chunk.value.byteLength;
          if (sentBytes > MAX_MESSAGE_MEDIA_BYTES) {
            await reader.cancel().catch(() => undefined);
            if (!res.headersSent) {
              sendApiError(req, res, 413, ErrorCode.BAD_REQUEST, 'Media file exceeds the allowed size');
            } else {
              res.destroy();
            }
            return;
          }
          if (!res.write(Buffer.from(chunk.value))) {
            await new Promise<void>((resolve, reject) => {
              const onDrain = () => { cleanup(); resolve(); };
              const onError = (error: Error) => { cleanup(); reject(error); };
              const onClose = () => { cleanup(); reject(new Error('Client disconnected while streaming media')); };
              const cleanup = () => {
                res.off('drain', onDrain);
                res.off('error', onError);
                res.off('close', onClose);
              };
              res.once('drain', onDrain);
              res.once('error', onError);
              res.once('close', onClose);
            });
          }
        }
        res.end();
      } catch (streamError) {
        if (!res.headersSent) {
          sendApiError(req, res, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Media provider unavailable');
        } else if (!res.destroyed) {
          // Do not attach provider/upstream error objects to the outgoing response;
          // the error may contain internal URLs or transport details.
          res.destroy();
        }
      } finally {
        clearTimeout(timeout);
        res.off('close', onClientClose);
        reader.releaseLock();
      }
    } catch (error) {
      next(error);
    }
  },

  pinMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessagePin(user.userId, params.id, params.messageId, true);
      res.status(200).json(successResponse('Message pinned'));
    } catch (error) {
      next(error);
    }
  },

  unpinMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessagePin(user.userId, params.id, params.messageId, false);
      res.status(200).json(successResponse('Message unpinned'));
    } catch (error) {
      next(error);
    }
  },

  starMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessageStar(user.userId, params.id, params.messageId, true);
      res.status(200).json(successResponse('Message starred'));
    } catch (error) {
      next(error);
    }
  },

  unstarMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessageStar(user.userId, params.id, params.messageId, false);
      res.status(200).json(successResponse('Message unstarred'));
    } catch (error) {
      next(error);
    }
  },

  deleteMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = deleteMessageSchema.parse({ params: req.params });
      const message = await conversationsService.deleteMessage(
        user.userId,
        params.id,
        params.messageId
      );
      res.status(200).json(successResponse('Message deleted', message));
    } catch (error) {
      next(error);
    }
  },

  deleteConversation: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      await conversationsService.deleteConversationForUser(user.userId, params.id);
      res.status(200).json(successResponse('Conversation deleted'));
    } catch (error) {
      next(error);
    }
  },

  setFlags: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = setConversationFlagsSchema.parse({
        params: req.params,
        body: req.body,
      });
      const conversation = await conversationsService.setConversationFlags(user.userId, params.id, {
        ...body,
        mutedUntil:
          body.mutedUntil === undefined
            ? undefined
            : body.mutedUntil
              ? new Date(body.mutedUntil)
              : null,
      });
      res.status(200).json(successResponse('Conversation updated', conversation));
    } catch (error) {
      next(error);
    }
  },

  sendMessageImage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      const file = req.file;
      if (!file) {
        sendApiError(req, res, 400, ErrorCode.IMAGE_REQUIRED, 'Image required');
        return;
      }
      const uploaded = await uploadImage(file.buffer, 'chat');
      const caption = typeof req.body?.body === 'string' ? req.body.body : undefined;

      try {
        const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(
          user.userId,
          params.id,
          {
            body: caption,
            imageUrl: uploaded.url,
          },
          offlineOperationId
        );
        // A durable idempotency hit can happen after the upload itself.
        // If PostgreSQL returned an older message, discard this newly uploaded
        // asset instead of leaving an orphan in Cloudinary.
        if (message.imageUrl !== uploaded.url) {
          await deleteCloudinaryAsset(uploaded.publicId, 'image');
        }
        res.status(201).json(successResponse('Message sent', message));
      } catch (err) {
        // Best-effort cleanup prevents an uploaded image from becoming an
        // orphaned Cloudinary asset when message creation fails.
        // error is what the client should see, so a cleanup failure
        // is logged rather than propagated.
        await deleteCloudinaryAsset(uploaded.publicId, 'image');
        throw err;
      }
    } catch (error) {
      next(error);
    }
  },

  sendMessageFile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      const file = req.file;
      if (!file) {
        sendApiError(req, res, 400, ErrorCode.NO_FILE_ATTACHED, 'File required');
        return;
      }
      const uploaded = await uploadRawFile(file.buffer, 'chat-files', file.originalname);
      try {
        const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(
          user.userId,
          params.id,
          {
            body: typeof req.body?.body === 'string' ? req.body.body : undefined,
            file: {
              url: uploaded.url,
              name: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
            },
          },
          offlineOperationId
        );
        if (message.fileUrl !== uploaded.url) {
          await deleteCloudinaryAsset(uploaded.publicId, 'raw');
        }
        res.status(201).json(successResponse('File message sent', message));
      } catch (err) {
        await deleteCloudinaryAsset(uploaded.publicId, 'raw');
        throw err;
      }
    } catch (error) {
      next(error);
    }
  },

  sendMessageAudio: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      const file = req.file;
      if (!file) {
        sendApiError(req, res, 400, ErrorCode.NO_FILE_ATTACHED, 'Audio required');
        return;
      }
      const uploaded = await uploadAudio(file.buffer, 'chat');
      try {
        const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(
          user.userId,
          params.id,
          {
            body: typeof req.body?.body === 'string' ? req.body.body : undefined,
            audioUrl: uploaded.url,
          },
          offlineOperationId
        );
        if (message.audioUrl !== uploaded.url && uploaded.publicId) {
          await deleteCloudinaryAsset(uploaded.publicId, 'video');
        }
        res.status(201).json(successResponse('Voice message sent', message));
      } catch (err) {
        const publicId = uploaded.publicId;
        if (publicId)
          await deleteCloudinaryAsset(publicId, 'video');
        throw err;
      }
    } catch (error) {
      next(error);
    }
  },


};
