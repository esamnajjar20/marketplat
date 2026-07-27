import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import { updateProfileSchema, getUserByIdSchema, changePasswordSchema, updateNotificationPreferencesSchema } from './users.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { BadRequestError } from '../../shared/errors/BadRequestError';

export const usersController = {
  getMe: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const result = await usersService.getMe(user.userId);
      res.status(200).json(successResponse('Profile fetched', result));
    } catch (error) {
      next(error);
    }
  },

  getUserById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = getUserByIdSchema.parse({ params: req.params });
      const result = await usersService.getUserById(params.id);
      res.status(200).json(successResponse('User fetched', result));
    } catch (error) {
      next(error);
    }
  },

  getUserAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = getUserByIdSchema.parse({ params: req.params });
      // A-03: use shared pagination schema instead of inline definition
      const query = paginationQuerySchema.parse(req.query);
      const result = await usersService.getUserAds(params.id, query);
      res
        .status(200)
        .json(successResponse('User ads fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  updateMe: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = updateProfileSchema.parse({ body: req.body });
      const result = await usersService.updateMe(user.userId, body);
      res.status(200).json(successResponse('Profile updated', result));
    } catch (error) {
      next(error);
    }
  },

  deleteMe: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      await usersService.deleteMe(user.userId);
      res.status(200).json(successResponse('Account deactivated'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * FIX FEAT-02: PATCH /users/me/notifications — previously the
   * frontend's save button had no corresponding endpoint to call.
   */
  updateNotificationPreferences: async (
    req: Request, res: Response, next: NextFunction
  ): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = updateNotificationPreferencesSchema.parse({ body: req.body });
      const result = await usersService.updateNotificationPreferences(user.userId, body);
      res.status(200).json(successResponse('Notification preferences updated', result));
    } catch (error) {
      next(error);
    }
  },


  changePassword: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = changePasswordSchema.parse({ body: req.body });
      // FIX SEC-07: pass the current access token so changePassword can
      // blacklist it — same extraction pattern as authController.logoutAll.
      const accessToken = req.headers.authorization?.split(' ')[1];
      await usersService.changePassword(user.userId, body.currentPassword, body.newPassword, accessToken);
      res.status(200).json(successResponse('تم تغيير كلمة المرور بنجاح'));
    } catch (error) {
      next(error);
    }
  },

  uploadAvatar: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      if (!req.file) throw new BadRequestError('لم يتم إرفاق أي صورة');

      const result = await usersService.uploadAvatar(user.userId, req.file);
      res.status(200).json(successResponse('تم تحديث الصورة الشخصية', result));
    } catch (error) {
      next(error);
    }
  },
};