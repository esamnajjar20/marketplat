import { z } from 'zod';
import { StoreMemberRole, StoreMemberStatus } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

export const inviteStoreMemberSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    email: z.string().email().max(255),
    role: z.nativeEnum(StoreMemberRole),
  }),
});

export const updateStoreMemberRoleSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    memberId: z.string().cuid(),
  }),
  body: z.object({
    role: z.nativeEnum(StoreMemberRole),
  }),
});

export const storeMemberIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    memberId: z.string().cuid(),
  }),
});

export const listStoreMembersSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(100)),
    limit: optionalQueryNumber(z.number().int().min(1).max(50)),
    status: z.nativeEnum(StoreMemberStatus).optional(),
  }),
});

export const acceptStoreMemberInviteSchema = z.object({
  params: z.object({
    memberId: z.string().cuid(),
  }),
});

export type InviteStoreMemberInput = z.infer<typeof inviteStoreMemberSchema>['body'];
export type UpdateStoreMemberRoleInput = z.infer<typeof updateStoreMemberRoleSchema>['body'];
export type ListStoreMembersQuery = z.infer<typeof listStoreMembersSchema>['query'];
