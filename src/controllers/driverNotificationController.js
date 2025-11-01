import { prisma } from '../prismaClient.js';

/**
 * ✅ IMPROVED: Get Pending Ride Requests for Drivers
 */
export const getPendingRideRequests = async (req, res) => {
  try {
    const { driverId } = req.query;
    
    console.log('🔄 Fetching pending ride requests for driver:', driverId);

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    // Find available rides that are not accepted by any driver
    const pendingRides = await prisma.rideBooking.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: 'confirmed' },
              { status: 'pending' }
            ]
          },
          {
            // Only show rides that haven't been accepted by any driver yet
            driverId: null
          }
        ]
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 10
    });

    console.log(`✅ Found ${pendingRides.length} pending rides for driver ${driverId}`);

    // Format response with customer data if available
    const formattedRides = await Promise.all(
      pendingRides.map(async (ride) => {
        // Get customer details
        let customerName = 'Customer';
        let customerPhone = 'Not available';
        let customerRating = 4.5;

        if (ride.customerId) {
          const customer = await prisma.user.findUnique({
            where: { id: ride.customerId },
            select: { name: true, phone: true }
          });
          
          if (customer) {
            customerName = customer.name || 'Customer';
            customerPhone = customer.phone || 'Not available';
          }
        }

        return {
          bookingId: ride.id,
          fromLocation: ride.fromLocation || 'Location not specified',
          toLocation: ride.toLocation || 'Destination not specified',
          price: ride.price || 0,
          distance: ride.distance || 0,
          vehicleType: ride.vehicleType || 'Standard',
          customerName,
          customerPhone,
          customerRating,
          pickupLat: ride.fromLat ? parseFloat(ride.fromLat) : null,
          pickupLon: ride.fromLon ? parseFloat(ride.fromLon) : null,
          dropLat: ride.toLat ? parseFloat(ride.toLat) : null,
          dropLon: ride.toLon ? parseFloat(ride.toLon) : null,
          timestamp: ride.created_at,
        };
      })
    );

    return res.json({
      success: true,
      data: formattedRides,
      message: `Found ${formattedRides.length} pending rides`
    });

  } catch (error) {
    console.error('❌ Get pending rides error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pending rides',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ✅ CRITICAL FIX: Accept or Decline Ride Booking - UPDATED
 */
/**
 * ✅ FIXED: Accept or Decline Ride Booking - USING EXISTING SCHEMA FIELDS
 */
/**
 * ✅ FINAL FIXED: Accept or Decline Ride Booking - REMOVED RATING FIELD
 */
export const handleRideResponse = async (req, res) => {
  try {
    const { bookingId, driverId, driverName, driverPhone, vehicleNumber, status } = req.body;

    console.log(`🎯 Ride ${status} request:`, { 
      bookingId, 
      driverId, 
      driverName,
      driverPhone,
      vehicleNumber,
      status 
    });

    // Validation
    if (!bookingId || !driverId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: bookingId, driverId, status'
      });
    }

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "accepted" or "declined"'
      });
    }

    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, fullName: true, phone: true, vehicleNumber: true }
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
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

    // Check if ride is already accepted
    if (ride.driverId && status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: "This ride has already been accepted by another driver",
      });
    }

    // Update ride based on driver response
    let updateData = {};
    
    if (status === 'accepted') {
      updateData = {
        status: 'ACCEPTED',
        driverId: driverId,
        driverName: driverName || driver.fullName,
        acceptedAt: new Date(),
      };
    } else {
      updateData = {
        status: 'DECLINED',
        declinedAt: new Date(),
      };
    }

    const updatedRide = await prisma.rideBooking.update({
      where: { id: bookingId },
      data: updateData,
      // REMOVED RATING FROM SELECT - IT DOESN'T EXIST IN SCHEMA
      include: {
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            vehicleNumber: true,
            // rating: true  // REMOVED THIS LINE
          }
        }
      }
    });

    // Create driver notification
    await prisma.driverNotification.create({
      data: {
        driverId: driverId,
        rideBookingId: bookingId,
        status: status,
        message: `Ride ${status} for ${ride.fromLocation} to ${ride.toLocation}`,
        isRead: false
      }
    });

    console.log(`✅ Ride ${status} successfully:`, updatedRide.id);

    // Prepare response data
    const responseData = {
      bookingId: updatedRide.id,
      status: updatedRide.status,
      driverAssigned: status === 'accepted' ? driverName : null,
      fromLocation: updatedRide.fromLocation,
      toLocation: updatedRide.toLocation
    };

    // Add driver info if accepted
    if (status === 'accepted' && updatedRide.driver) {
      responseData.driverInfo = {
        id: updatedRide.driver.id,
        name: updatedRide.driver.fullName,
        phone: updatedRide.driver.phone,
        vehicleNumber: updatedRide.driver.vehicleNumber,
        rating: 4.5 // Default rating since field doesn't exist
      };
    }

    res.json({
      success: true,
      message: `Ride ${status} successfully!`,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Handle ride response error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing ride response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ✅ UPDATED: Get Booking Details - NEW API
 */
export const getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    console.log('🔍 Fetching booking details:', bookingId);

    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            rating: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Format response
    const bookingData = {
      id: booking.id,
      fromLocation: booking.fromLocation,
      toLocation: booking.toLocation,
      price: booking.price,
      distance: booking.distance,
      vehicleType: booking.vehicleType,
      status: booking.status,
      createdAt: booking.created_at,
      customer: booking.customer ? {
        name: booking.customer.name,
        phone: booking.customer.phone,
        rating: booking.customer.rating
      } : null
    };

    // Add driver info if assigned
    if (booking.driverId) {
      bookingData.driver = {
        id: booking.driverId,
        name: booking.driverName,
        phone: booking.driverPhone,
        vehicleNumber: booking.driverVehicle
      };

      // Get driver rating if available
      const driver = await prisma.driver.findUnique({
        where: { id: booking.driverId },
        select: { rating: true }
      });

      if (driver) {
        bookingData.driver.rating = driver.rating;
      }
    }

    return res.json({
      success: true,
      data: bookingData,
      message: 'Booking details fetched successfully'
    });

  } catch (error) {
    console.error('❌ Get booking details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching booking details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ✅ UPDATED: Get Driver Notifications with Pagination
 */
export const getDriverNotifications = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    console.log(`📋 Fetching notifications for driver: ${driverId}`);

    // Build where clause
    const whereClause = { driverId };
    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const [notifications, totalCount, unreadCount] = await Promise.all([
      prisma.driverNotification.findMany({
        where: whereClause,
        include: {
          rideBooking: {
            select: {
              fromLocation: true,
              toLocation: true,
              price: true,
              vehicleType: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.driverNotification.count({ where: whereClause }),
      prisma.driverNotification.count({ where: { driverId, isRead: false } })
    ]);

    // Get pending rides count
    const pendingRidesCount = await prisma.rideBooking.count({
      where: {
        AND: [
          {
            OR: [
              { status: 'confirmed' },
              { status: 'pending' }
            ]
          },
          {
            driverId: null // Not accepted by any driver
          }
        ]
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        stats: {
          pendingRides: pendingRidesCount,
          totalNotifications: totalCount,
          unreadNotifications: unreadCount
        }
      },
    });
  } catch (error) {
    console.error("❌ Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ✅ NEW: Get Driver Ride History with Filters
 */
export const getDriverRideHistory = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    const [rides, totalCount, earnings] = await Promise.all([
      // Get rides accepted by this driver
      prisma.rideBooking.findMany({
        where: {
          driverId: driverId,
          status: { in: ['accepted', 'completed', 'ongoing'] }
        },
        include: {
          customer: {
            select: {
              name: true,
              phone: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.rideBooking.count({
        where: {
          driverId: driverId,
          status: { in: ['accepted', 'completed', 'ongoing'] }
        }
      }),
      prisma.rideBooking.aggregate({
        where: {
          driverId: driverId,
          status: 'completed'
        },
        _sum: {
          price: true
        }
      })
    ]);

    const formattedRides = rides.map(ride => ({
      id: ride.id,
      fromLocation: ride.fromLocation,
      toLocation: ride.toLocation,
      price: ride.price,
      distance: ride.distance,
      vehicleType: ride.vehicleType,
      status: ride.status,
      createdAt: ride.created_at,
      acceptedAt: ride.acceptedAt,
      customer: ride.customer ? {
        name: ride.customer.name,
        phone: ride.customer.phone
      } : null
    }));

    return res.json({
      success: true,
      data: {
        rides: formattedRides,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        summary: {
          totalEarnings: earnings._sum.price || 0,
          totalRides: totalCount,
          completedRides: rides.filter(r => r.status === 'completed').length
        }
      },
      message: `Found ${formattedRides.length} rides in history`
    });

  } catch (error) {
    console.error('❌ Get ride history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ride history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ✅ NEW: Mark Notification as Read (Multiple)
 */
export const updateNotificationStatus = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { markAllRead, driverId } = req.body;

    if (markAllRead && driverId) {
      const updatedCount = await prisma.driverNotification.updateMany({
        where: { 
          driverId: driverId,
          isRead: false 
        },
        data: { isRead: true }
      });

      return res.json({
        success: true,
        message: `Marked ${updatedCount.count} notifications as read`,
        data: { updatedCount: updatedCount.count }
      });
    }

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }

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
      message: 'Error updating notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};