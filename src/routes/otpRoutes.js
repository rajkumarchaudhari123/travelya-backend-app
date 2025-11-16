// routes/otpRoutes.js - FIXED VERSION

import express from 'express';
import {
  generateBookingOTP,
  verifyRideOTP,
  resendOTP,
  getOTPStatus  // ✅ NOW THIS WILL WORK
} from '../controllers/otpController.js';

const router = express.Router();

// ✅ Generate OTP for booking
router.post('/generate', generateBookingOTP);

// ✅ Verify OTP
router.post('/verify', verifyRideOTP);

// ✅ Resend OTP
router.post('/resend', resendOTP);

// ✅ Get OTP status
router.get('/status/:bookingId', getOTPStatus);

export default router;