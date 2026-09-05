import { Request, Response, NextFunction } from 'express';
import { storeMembersService } from './store-members.service';
import {
  inviteStoreMemberSchema,
  updateStoreMemberRoleSchema,
  storeMemberIdSchema,
  listStoreMembersSchema,
  acceptStoreMemberInviteSchema,
} from './store-members.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const storeMembersController = {
  inviteMember: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = inviteStoreMemberSchema.parse({
        params: req.params,
        body: req.body,
      });
      const member = await storeMembersService.invite(user.userId, params.id, body);
      res.status(201).json(successResponse('Member invited', member));
    } catch (error) {
      next(error);
    }
  },

  listMembers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, query } = listStoreMembersSchema.parse({
        params: req.params,
        query: req.query,
      });
      const result = await storeMembersService.list(user.userId, params.id, query);
      res
        .status(200)
        .json(successResponse('Store members fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  updateMemberRole: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateStoreMemberRoleSchema.parse({
        params: req.params,
        body: req.body,
      });
      const member = await storeMembersService.updateRole(
        user.userId,
        params.id,
        params.memberId,
        body
      );
      res.status(200).json(successResponse('Member role updated', member));
    } catch (error) {
      next(error);
    }
  },

  removeMember: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = storeMemberIdSchema.parse({ params: req.params });
      await storeMembersService.remove(user.userId, params.id, params.memberId);
      res.status(200).json(successResponse('Member removed'));
    } catch (error) {
      next(error);
    }
  },

  acceptInvite: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = acceptStoreMemberInviteSchema.parse({ params: req.params });
      const member = await storeMembersService.acceptInvite(user.userId, params.memberId);
      res.status(200).json(successResponse('Invitation accepted', member));
    } catch (error) {
      next(error);
    }
  },

  listMyPendingInvites: async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = requireUser(req);
      const invites = await storeMembersService.listMyPendingInvites(user.userId);
      res.status(200).json(successResponse('Pending invites fetched', invites));
    } catch (error) {
      next(error);
    }
  },
};
