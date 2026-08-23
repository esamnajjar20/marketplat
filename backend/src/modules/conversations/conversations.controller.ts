import { Request, Response, NextFunction } from 'express';
import { conversationsService } from './conversations.service';
import {
  startConversationSchema,
  conversationIdSchema,
  getConversationsSchema,
  sendMessageSchema,
  getMessagesSchema,
  deleteMessageSchema,
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
      const message = await conversationsService.sendMessage(user.userId, params.id, body.body);
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
};
