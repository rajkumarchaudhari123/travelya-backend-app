// controllers/otpController.js - COMPLETE FIXED VERSION

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ✅ OTP Generation Function
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

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

    // Find booking with ALL necessary relations
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      include: {
        rider: {
          select: { phone: true, fullName: true }
        },
        driver: {
          select: { id: true, fullName: true } // ✅ Include driver id
        }
      }
    });

    console.log('🔐 [OTP GENERATE] Booking found:', {
      id: booking?.id,
      currentDriverId: booking?.driverId, 
      status: booking?.status,
      hasDriver: !!booking?.driver
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // ✅ FIX 1: Check if booking has a driver assigned
    if (!booking.driverId) {
      console.log('❌ [OTP GENERATE] No driver assigned to booking');
      return res.status(400).json({
        success: false,
        message: "No driver assigned to this booking. Please accept the ride first."
      });
    }

    // ✅ FIX 2: Better driver validation
    if (booking.driverId !== driverId) {
      console.log('❌ [OTP GENERATE] Driver ID mismatch:', {
        assignedDriverId: booking.driverId,
        requestingDriverId: driverId
      });
      return res.status(403).json({
        success: false,
        message: `Driver not assigned to this booking. Assigned driver: ${booking.driverId}`
      });
    }

    // ✅ FIX 3: Check booking status - should be ACCEPTED
    if (booking.status !== 'ACCEPTED') {
      console.log('❌ [OTP GENERATE] Invalid booking status:', booking.status);
      return res.status(400).json({
        success: false,
        message: `Cannot generate OTP. Booking status must be 'ACCEPTED'. Current status: '${booking.status}'`
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log('🔢 [OTP GENERATE] Generated OTP:', otpCode);

    // ✅ FIX 4: Update booking with OTP but DON'T change status
    const updatedBooking = await prisma.rideBooking.update({
      where: { id: bookingId },
      data: {
        otpCode: otpCode,
        otpExpiresAt: otpExpires,
        otpVerified: false,
        otpAttempts: 0,
        // ❌ REMOVED: status: 'ARRIVED' - Don't change status here
      }
    });

    console.log('✅ [OTP GENERATE] OTP saved successfully to booking:', bookingId);
    console.log(`📱 [OTP GENERATE] OTP ${otpCode} would be sent to ${booking.rider.phone}`);

    res.json({
      success: true,
      message: "OTP generated successfully",
      data: {
        bookingId: bookingId,
        otpExpiresAt: otpExpires,
        // otpCode: otpCode // Don't send in production
      }
    });

  } catch (error) {
    console.error('❌ [OTP GENERATE] Database error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
      error: error.message
    });
  }
};
// ✅ Verify Ride OTP
export const verifyRideOTP = async (req, res) => {
  try {
    const { bookingId, otp, driverId } = req.body;

    console.log('🔐 Verifying OTP:', { bookingId, otp, driverId });

    if (!bookingId || !otp || !driverId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID, OTP and Driver ID are required"
      });
    }

    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // Check if driver is assigned
    if (booking.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "Driver not assigned to this booking"
      });
    }

    // Check if OTP exists
    if (!booking.otpCode) {
      return res.status(400).json({
        success: false,
        message: "OTP not generated for this ride"
      });
    }

    // Check OTP expiration
    if (new Date() > booking.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    // Check attempt limit
    if (booking.otpAttempts >= 3) {
      return res.status(400).json({
        success: false,
        message: "Too many failed OTP attempts"
      });
    }

    // Verify OTP
    if (booking.otpCode !== otp) {
      // Increment attempt counter
      await prisma.rideBooking.update({
        where: { id: bookingId },
        data: { otpAttempts: booking.otpAttempts + 1 }
      });

      const attemptsLeft = 3 - (booking.otpAttempts + 1);

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        attemptsLeft: attemptsLeft
      });
    }

    // OTP verified successfully
    const updatedBooking = await prisma.rideBooking.update({
      where: { id: bookingId },
      data: {
        otpVerified: true,
        otpVerifiedAt: new Date(),
        status: "OTP_VERIFIED"
      }
    });

    console.log(`✅ OTP verified for booking ${bookingId}`);

    res.json({
      success: true,
      message: "OTP verified successfully",
      data: {
        verified: true,
        bookingId: bookingId,
        verifiedAt: new Date(),
        status: "OTP_VERIFIED"
      }
    });

  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message
    });
  }
};

// ✅ Resend OTP
export const resendOTP = async (req, res) => {
  try {
    const { bookingId, driverId } = req.body;

    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      include: {
        rider: { select: { phone: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update booking with new OTP
    await prisma.rideBooking.update({
      where: { id: bookingId },
      data: {
        otpCode: otpCode,
        otpExpiresAt: otpExpires,
        otpVerified: false,
        otpAttempts: 0
      }
    });

    console.log(`📱 New OTP ${otpCode} sent to ${booking.rider.phone}`);

    res.json({
      success: true,
      message: "OTP resent successfully",
      data: {
        bookingId: bookingId,
        otpExpiresAt: otpExpires
      }
    });

  } catch (error) {
    console.error('❌ OTP resend error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message
    });
  }
};

// ✅ Get OTP Status - FIXED: This function was missing
export const getOTPStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required"
      });
    }

    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        otpCode: true,
        otpExpiresAt: true,
        otpVerified: true,
        otpVerifiedAt: true,
        otpAttempts: true,
        status: true,
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

    res.json({
      success: true,
      data: {
        bookingId: booking.id,
        otpGenerated: !!booking.otpCode,
        otpVerified: booking.otpVerified,
        otpVerifiedAt: booking.otpVerifiedAt,
        expiresAt: booking.otpExpiresAt,
        attempts: booking.otpAttempts,
        status: booking.status,
        driverName: booking.driver?.fullName
      }
    });

  } catch (error) {
    console.error('❌ Get OTP status error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get OTP status",
      error: error.message
    });
  }
};

