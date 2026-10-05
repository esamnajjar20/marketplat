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
  typingSchema,
  messageMarkSchema,
  mediaQuerySchema,
} from './conversations.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { uploadRawFile, deleteMedia } from '../../config/cloudinary';
import { extractCloudinaryPublicId } from '../../shared/utils/cloudinaryHelpers';

export const conversationsController = {
  startConversation: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = startConversationSchema.parse({ body: req.body });
      const conversation = body.adId
        ? await conversationsService.startFromAd(user.userId, body.adId)
        : body.serviceRequestId
          ? await conversationsService.startFromServiceRequest(user.userId, body.serviceRequestId)
          : await conversationsService.startFromUser(user.userId, body.userId as string, body.context);
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
      const offlineOperationId =
        (req.headers['x-offline-op-id'] as string | undefined) || null;
      const message = await conversationsService.sendMessage(
        user.userId,
        params.id,
        {
          body: body.body,
          imageUrl: body.imageUrl,
        },
        offlineOperationId,
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
        res.status(400).json({ success: false, message: 'Invalid media request' });
        return;
      }

      const asset = await conversationsService.getMediaAsset(user.userId, conversationId, messageId, kind);
      const remote = await fetch(asset.url, { redirect: 'follow' });
      if (!remote.ok || !remote.body) {
        res.status(502).json({ success: false, message: 'Media provider unavailable' });
        return;
      }

      const contentType = remote.headers.get('content-type') || asset.mimeType || 'application/octet-stream';
      const contentLength = remote.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', kind === 'file' && asset.fileName
        ? `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`
        : 'inline');
      const arrayBuffer = await remote.arrayBuffer();
      res.status(200).send(Buffer.from(arrayBuffer));
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
    } catch (error) { next(error); }
  },

  unpinMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessagePin(user.userId, params.id, params.messageId, false);
      res.status(200).json(successResponse('Message unpinned'));
    } catch (error) { next(error); }
  },

  starMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessageStar(user.userId, params.id, params.messageId, true);
      res.status(200).json(successResponse('Message starred'));
    } catch (error) { next(error); }
  },

  unstarMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = messageMarkSchema.parse({ params: req.params });
      await conversationsService.setMessageStar(user.userId, params.id, params.messageId, false);
      res.status(200).json(successResponse('Message unstarred'));
    } catch (error) { next(error); }
  },

  deleteMessage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = deleteMessageSchema.parse({ params: req.params });
      const message = await conversationsService.deleteMessage(user.userId, params.id, params.messageId);
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
    } catch (error) { next(error); }
  },

  setFlags: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = setConversationFlagsSchema.parse({
        params: req.params,
        body: req.body,
      });
      const conversation = await conversationsService.setConversationFlags(
        user.userId,
        params.id,
        { ...body, mutedUntil: body.mutedUntil === undefined ? undefined : body.mutedUntil ? new Date(body.mutedUntil) : null }
      );
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
        res.status(400).json({ success: false, message: 'Image required' });
        return;
      }
      // Static import — a dynamic import inside a hot path served no
      // purpose (this module is already loaded by the time any
      // handler runs), and its await inside the try block only
      // obscured the exact call ordering.
      const { uploadImage, deleteImage } = await import('../../config/cloudinary');
      const { extractCloudinaryPublicId } = await import('../../shared/utils/cloudinaryHelpers');
      const uploaded = await uploadImage(file.buffer, 'chat');
      const caption =
        typeof req.body?.body === 'string' ? req.body.body : undefined;

      try {
        const offlineOperationId =
          (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(
          user.userId,
          params.id,
          {
            body: caption,
            imageUrl: uploaded.url,
          },
          offlineOperationId,
        );
        res.status(201).json(successResponse('Message sent', message));
      } catch (err) {
        // FIX CHAT-IMG-ORPHAN: previously, if sendMessage threw (the
        // caller is not a participant in the conversation, the
        // conversation was soft-deleted for them, a rate limit tripped
        // between upload and send, ...), the freshly-uploaded image
        // was left behind on Cloudinary with no DB row referencing
        // it. Every failed attempt — whether an honest retry or a
        // scripted probe against other users' conversation ids — grew
        // the operator's Cloudinary bill without leaving a trace in
        // the application. Same cleanup pattern ads/products/
        // service-listings already use after their own upload step
        // succeeds but the DB write fails. Best-effort: the original
        // error is what the client should see, so a cleanup failure
        // is logged rather than propagated.
        const publicId = extractCloudinaryPublicId(uploaded.url);
        if (publicId) {
          deleteImage(publicId).catch(() => undefined);
        }
        throw err;
      }
    } catch (error) {
      next(error);
    }
  },

  sendMessageFile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req); const { params } = conversationIdSchema.parse({ params: req.params }); const file = req.file;
      if (!file) { res.status(400).json({ success: false, message: 'File required' }); return; }
      const uploaded = await uploadRawFile(file.buffer, 'chat-files', file.originalname);
      try {
        const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(user.userId, params.id, { body: typeof req.body?.body === 'string' ? req.body.body : undefined, file: { url: uploaded.url, name: file.originalname, mimeType: file.mimetype, size: file.size } }, offlineOperationId);
        res.status(201).json(successResponse('File message sent', message));
      } catch (err) { const publicId = extractCloudinaryPublicId(uploaded.url); if (publicId) deleteMedia(publicId, 'raw').catch(() => undefined); throw err; }
    } catch (error) { next(error); }
  },

  sendMessageAudio: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = conversationIdSchema.parse({ params: req.params });
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'Audio required' });
        return;
      }
      const { uploadAudio, deleteMedia } = await import('../../config/cloudinary');
      const uploaded = await uploadAudio(file.buffer, 'chat');
      try {
        const offlineOperationId = (req.headers['x-offline-op-id'] as string | undefined) || null;
        const message = await conversationsService.sendMessage(
          user.userId,
          params.id,
          { body: typeof req.body?.body === 'string' ? req.body.body : undefined, audioUrl: uploaded.url },
          offlineOperationId,
        );
        res.status(201).json(successResponse('Voice message sent', message));
      } catch (err) {
        const publicId = uploaded.publicId;
        if (publicId) deleteMedia(publicId, 'video').catch(() => undefined);
        throw err;
      }
    } catch (error) {
      next(error);
    }
  },

  typing: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = typingSchema.parse({ params: req.params, body: req.body });
      await conversationsService.signalTyping(user.userId, params.id, body.isTyping);
      res.status(200).json(successResponse('Typing signal sent'));
    } catch (error) {
      next(error);
    }
  },
};
