-- AlterEnum
ALTER TYPE "RideStatus" ADD VALUE 'OTP_VERIFIED';

-- AlterTable
ALTER TABLE "ride_bookings" ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otpVerifiedAt" TIMESTAMP(3);
