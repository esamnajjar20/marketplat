-- FIX (audit #21): add the NotificationType value that
-- store-members.service.ts's inviteMember was already TODO'd to use.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_MEMBER_INVITED';
