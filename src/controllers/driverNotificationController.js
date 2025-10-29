import { prisma } from '../prismaClient.js';

/**
 * ✅ NEW: Get Pending Ride Requests for Drivers - FIXED
 */



export const getPendingRideRequests = async (req, res) => {
  try {
    console.log('🔄 Fetching pending ride requests for drivers...');

    // Find bookings that are pending or confirmed (using only available fields)
    const pendingRides = await prisma.rideBooking.findMany({
      where: {
        OR: [
          { status: 'confirmed' },
          { status: 'pending' }
        ]
        // NOTE: driverId field doesn't exist in your schema yet
        // We'll filter by status only for now
      },
      orderBy: {
        created_at: 'desc' // Latest bookings first
      },
      take: 5 // Get latest 5 pending rides
    });

    console.log(`✅ Found ${pendingRides.length} pending rides`);

    // Format the response for driver app
    const formattedRides = pendingRides.map(ride => ({
      bookingId: ride.id,
      fromLocation: ride.fromLocation,
      toLocation: ride.toLocation,
      price: ride.price,
      distance: ride.distance,
      vehicleType: ride.vehicleType,
      // Use available data
      customerName: 'Customer', // Default since customerName field doesn't exist
      customerPhone: '+91 XXXXX XXXXX', // Default
      customerRating: 4.5, // Default rating
      pickupLat: ride.fromLat ? parseFloat(ride.fromLat) : 0,
      pickupLon: ride.fromLon ? parseFloat(ride.fromLon) : 0,
      dropLat: ride.toLat ? parseFloat(ride.toLat) : 0,
      dropLon: ride.toLon ? parseFloat(ride.toLon) : 0,
      timestamp: ride.created_at,
    }));

    return res.json({
      success: true,
      data: formattedRides,
      message: `Found ${pendingRides.length} pending rides`
    });

  } catch (error) {
    console.error('❌ Get pending rides error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pending rides',
      error: error.message
    });
  }
};

/**
 * ✅ UPDATED: Accept or Decline Ride Booking - FIXED
 */
export const handleRideResponse = async (req, res) => {
  try {
    const { bookingId, driverId, driverName, status } = req.body;

    console.log(`🎯 Ride ${status} request:`, { bookingId, driverId, status });

    // 🔧 Mock rides ke liye bypass (temporary testing)
    if (bookingId.startsWith("test-") || bookingId.startsWith("BK")) {
      console.log(`🤖 Mock ride ${status}: ${bookingId}`);
      return res.json({
        success: true,
        message: `Mock ride ${status} successfully!`,
        data: {
          bookingId,
          status,
          driverAssigned: status === 'accepted' ? driverName : null
        }
      });
    }

    // 👇 Real ride bookings ke liye DB check
    const ride = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
    });

    if (!ride) {
      console.log('❌ Ride not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: "Ride booking not found",
      });
    }

    // Check if ride is already accepted (we'll use status for now since driverId doesn't exist)
    if (ride.status === 'accepted' && status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: "This ride has already been accepted by another driver",
      });
    }

    // Update ride status (driverId field doesn't exist yet, so we'll only update status)
    const updateData = {
      status: status === 'accepted' ? 'accepted' : 'cancelled',
    };

    const updatedRide = await prisma.rideBooking.update({
      where: { id: bookingId },
      data: updateData,
    });

    // Create driver notification
    await prisma.driverNotification.create({
      data: {
        driverId: driverId,
        rideBookingId: bookingId,
        status: status,
        message: `Ride ${status} for ${ride.fromLocation} to ${ride.toLocation}`
      }
    });

    console.log(`✅ Ride ${status} successfully:`, updatedRide.id);

    res.json({
      success: true,
      message: `Ride ${status} successfully!`,
      data: {
        bookingId: updatedRide.id,
        status: updatedRide.status,
        driverAssigned: status === 'accepted' ? driverName : null,
        fromLocation: updatedRide.fromLocation,
        toLocation: updatedRide.toLocation
      }
    });

  } catch (error) {
    console.error('❌ Handle ride response error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing ride response',
      error: error.message
    });
  }
};

/**
 * ✅ UPDATED: Get Driver Notifications - FIXED
 */
export const getDriverNotifications = async (req, res) => {
  try {
    const { driverId } = req.params;

    console.log(`📋 Fetching notifications for driver: ${driverId}`);

    const notifications = await prisma.driverNotification.findMany({
      where: { driverId },
      include: {
        rideBooking: {
          select: {
            fromLocation: true,
            toLocation: true,
            price: true,
            vehicleType: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also include pending ride counts (without driverId filter)
    const pendingRidesCount = await prisma.rideBooking.count({
      where: {
        OR: [
          { status: 'confirmed' },
          { status: 'pending' }
        ]
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        stats: {
          pendingRides: pendingRidesCount,
          totalNotifications: notifications.length,
          unreadNotifications: notifications.filter(n => !n.isRead).length
        }
      },
    });
  } catch (error) {
    console.error("❌ Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * ✅ NEW: Get Driver Ride History - FIXED
 */
export const getDriverRideHistory = async (req, res) => {
  try {
    const { driverId } = req.params;

    // Since driverId field doesn't exist in RideBooking, we'll use notifications to find driver's rides
    const driverNotifications = await prisma.driverNotification.findMany({
      where: {
        driverId: driverId,
        status: 'accepted'
      },
      include: {
        rideBooking: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    const rideHistory = driverNotifications.map(notification => notification.rideBooking);

    return res.json({
      success: true,
      data: rideHistory,
      message: `Found ${rideHistory.length} rides in history`
    });

  } catch (error) {
    console.error('❌ Get ride history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ride history'
    });
  }
};

/**
 * ✅ NEW: Mark Notification as Read
 */
export const updateNotificationStatus = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const updatedNotification = await prisma.driverNotification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    return res.json({
      success: true,
      message: 'Notification marked as read',
      data: updatedNotification
    });

  } catch (error) {
    console.error('❌ Update notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification'
    });
  }
};