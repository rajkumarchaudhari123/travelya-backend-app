/*
  Warnings:

  - You are about to alter the column `otpCode` on the `ride_bookings` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(10)`.

*/
-- AlterTable
ALTER TABLE "ride_bookings" ALTER COLUMN "otpCode" SET DATA TYPE VARCHAR(10);
