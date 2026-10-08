import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { mediaUploadRateLimit } from '../../middlewares/rateLimit.middleware';
import { storiesController } from './stories.controller';

export const storiesRouter = Router();
storiesRouter.get('/feed', authenticate, storiesController.feed);
storiesRouter.get('/user/:userId', optionalAuthenticate, storiesController.userStories);
storiesRouter.get('/:id/viewers', authenticate, storiesController.viewers);
storiesRouter.post('/', authenticate, mediaUploadRateLimit, uploadMiddleware, storiesController.create);
storiesRouter.post('/:id/view', authenticate, storiesController.view);
storiesRouter.delete('/:id', authenticate, storiesController.delete);
