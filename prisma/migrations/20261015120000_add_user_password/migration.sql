-- Add password hash to app users so the platform can require sign-in.
ALTER TABLE "AppUser" ADD COLUMN "passwordHash" TEXT;
