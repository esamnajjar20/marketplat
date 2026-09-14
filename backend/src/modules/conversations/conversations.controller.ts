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
} from './conversations.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const conversationsController = {
  startConversation: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = startConversationSchema.parse({ body: req.body });
      const conversation = body.adId
        ? await conversationsService.startFromAd(user.userId, body.adId)
        : body.serviceRequestId
          ? await conversationsService.startFromServiceRequest(user.userId, body.serviceRequestId)
          : await conversationsService.startFromUser(user.userId, body.userId as string);
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
      const message = await conversationsService.sendMessage(user.userId, params.id, {
        body: body.body,
        imageUrl: body.imageUrl,
      });
      res.status(201).json(successResponse('Message sent', message));
    } catch (error) {
      next(error);
    }
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
        body
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
      const { uploadImage } = await import('../../config/cloudinary');
      const uploaded = await uploadImage(file.buffer, 'chat');
      const caption =
        typeof req.body?.body === 'string' ? req.body.body : undefined;
      const message = await conversationsService.sendMessage(user.userId, params.id, {
        body: caption,
        imageUrl: uploaded.url,
      });
      res.status(201).json(successResponse('Message sent', message));
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
