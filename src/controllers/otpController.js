// controllers/otpController.js - ES MODULE VERSION

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// In-memory storage for OTP (temporary solution)
const otpStorage = new Map();

export const generateBookingOTP = async (req, res) => {
  try {
    const { bookingId, driverId } = req.body;

    console.log('🔐 [OTP GENERATE] Request received:', { bookingId, driverId });

    if (!bookingId || !driverId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID and Driver ID are required"
      });
    }

    // Verify booking and driver authorization - WITHOUT OTP FIELDS
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        driverId: true,
        status: true,
        rider: { select: { phone: true, fullName: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (!booking.driverId) {
      return res.status(400).json({
        success: false,
        message: "No driver assigned to this booking"
      });
    }

    if (booking.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "Driver not authorized for this booking"
      });
    }

    // ✅ FIXED: Allow both ACCEPTED and STARTED status
    const allowedStatuses = ['ACCEPTED', 'STARTED'];
    if (!allowedStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot generate OTP. Booking status must be 'ACCEPTED' or 'STARTED'. Current status: '${booking.status}'`
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    console.log('🔢 [OTP GENERATE] Generated OTP:', otpCode);

    // Store OTP in memory (temporary solution)
    otpStorage.set(bookingId, {
      otpCode,
      otpExpiresAt: otpExpires,
      otpVerified: false,
      otpAttempts: 0,
      driverId: driverId
    });

    // Update booking status ONLY (don't try to update OTP fields)
    try {
      const updateData = {};
      
      // Only update to STARTED if currently ACCEPTED
      if (booking.status === 'ACCEPTED') {
        updateData.status = 'STARTED';
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.rideBooking.update({
          where: { id: bookingId },
          data: updateData
        });
        console.log('✅ [OTP GENERATE] Booking status updated to STARTED');
      }

    } catch (dbError) {
      console.log('⚠️ [OTP GENERATE] Status update failed, but OTP stored in memory:', dbError.message);
    }

    console.log('✅ [OTP GENERATE] OTP stored in memory successfully');

    res.json({
      success: true,
      message: "OTP generated successfully",
      data: {
        bookingId: bookingId,
        otpExpiresAt: otpExpires,
      }
    });

  } catch (error) {
    console.error('❌ [OTP GENERATE] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
      error: error.message
    });
  }
};

export const verifyRideOTP = async (req, res) => {
  try {
    const { bookingId, otp, driverId } = req.body;

    console.log('🔐 [OTP VERIFY] Verifying OTP:', { bookingId, otp, driverId });

    if (!bookingId || !otp || !driverId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID, OTP and Driver ID are required"
      });
    }

    // Check in-memory storage
    const otpData = otpStorage.get(bookingId);
    
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "OTP not generated for this ride"
      });
    }

    if (otpData.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "Driver not authorized for this booking"
      });
    }

    if (new Date() > otpData.otpExpiresAt) {
      otpStorage.delete(bookingId);
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    if (otpData.otpAttempts >= 3) {
      return res.status(400).json({
        success: false,
        message: "Too many failed OTP attempts"
      });
    }

    if (otpData.otpCode !== otp) {
      otpData.otpAttempts += 1;
      otpStorage.set(bookingId, otpData);
      
      const attemptsLeft = 3 - otpData.otpAttempts;
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        attemptsLeft: attemptsLeft
      });
    }

    // OTP verified successfully
    otpData.otpVerified = true;
    otpData.otpVerifiedAt = new Date();
    otpStorage.set(bookingId, otpData);

    // Update booking status in database
    try {
      await prisma.rideBooking.update({
        where: { id: bookingId },
        data: {
          status: 'STARTED'
        }
      });
      console.log('✅ [OTP VERIFY] Booking status updated to STARTED');
    } catch (dbError) {
      console.log('⚠️ [OTP VERIFY] Database update failed, but OTP verified:', dbError.message);
    }

    console.log(`✅ [OTP VERIFY] OTP verified for booking ${bookingId}`);

    res.json({
      success: true,
      message: "OTP verified successfully",
      data: {
        verified: true,
        bookingId: bookingId,
        verifiedAt: new Date(),
        status: 'STARTED'
      }
    });

  } catch (error) {
    console.error('❌ [OTP VERIFY] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message
    });
  }
};

export const getOTPStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { driverId } = req.query;

    console.log('🔐 [OTP STATUS] Checking status for:', { bookingId, driverId });

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required"
      });
    }

    // Check database for booking existence and driver authorization - WITHOUT OTP FIELDS
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        driverId: true,
        driver: {
          select: {
            fullName: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (driverId && booking.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "Driver not authorized"
      });
    }

    // Check in-memory OTP storage
    const otpData = otpStorage.get(bookingId);

    res.json({
      success: true,
      data: {
        bookingId: booking.id,
        otpGenerated: !!otpData,
        otpVerified: otpData?.otpVerified || false,
        otpVerifiedAt: otpData?.otpVerifiedAt || null,
        expiresAt: otpData?.otpExpiresAt || null,
        attempts: otpData?.otpAttempts || 0,
        status: booking.status,
        driverName: booking.driver?.fullName,
        inMemory: !!otpData // Indicate this is using in-memory storage
      }
    });

  } catch (error) {
    console.error('❌ [OTP STATUS] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get OTP status",
      error: error.message
    });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { bookingId, driverId } = req.body;

    console.log('🔐 [OTP RESEND] Resending OTP:', { bookingId, driverId });

    // Verify booking exists
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        driverId: true,
        rider: { select: { phone: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "Driver not authorized"
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update in-memory storage
    otpStorage.set(bookingId, {
      otpCode,
      otpExpiresAt: otpExpires,
      otpVerified: false,
      otpAttempts: 0,
      driverId: driverId
    });

    console.log(`📱 [OTP RESEND] New OTP generated for ${booking.rider.phone}`);

    res.json({
      success: true,
      message: "OTP resent successfully",
      data: { bookingId, otpExpiresAt: otpExpires }
    });

  } catch (error) {
    console.error('❌ [OTP RESEND] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message
    });
  }
};