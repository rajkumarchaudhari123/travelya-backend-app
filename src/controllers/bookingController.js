// controllers/bookingController.js

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Create Booking - FIXED COORDINATES
export const createBooking = async (req, res) => {
  try {
    const {
      vehicleType,
      fromLocation,
      toLocation,
      price,
      distance,
      fromLat,
      fromLon,
      toLat,
      toLon,
      userId
    } = req.body;

    console.log('📦 Received booking data:', {
      vehicleType, fromLocation, toLocation, price, distance,
      fromLat, typeofFromLat: typeof fromLat,
      fromLon, typeofFromLon: typeof fromLon,
      toLat, typeofToLat: typeof toLat,
      toLon, typeofToLon: typeof toLon,
      userId
    });

    if (!vehicleType || !fromLocation || !toLocation || !price || !distance || !userId) {
      return res.status(400).json({
        success: false,
        message: "All booking details including userId are required"
      });
    }

    // Check if rider exists
    const rider = await prisma.rider.findUnique({
      where: { id: userId }
    });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    // ✅ FIX: Convert coordinates to Float properly
    const bookingData = {
      vehicleType,
      fromLocation,
      toLocation,
      price: typeof price === 'string' ? parseFloat(price) : Number(price),
      distance: typeof distance === 'string' ? parseFloat(distance) : Number(distance),
      fromLat: fromLat ? (typeof fromLat === 'string' ? parseFloat(fromLat) : Number(fromLat)) : null,
      fromLon: fromLon ? (typeof fromLon === 'string' ? parseFloat(fromLon) : Number(fromLon)) : null,
      toLat: toLat ? (typeof toLat === 'string' ? parseFloat(toLat) : Number(toLat)) : null,
      toLon: toLon ? (typeof toLon === 'string' ? parseFloat(toLon) : Number(toLon)) : null,
      userId: userId,
      status: "PENDING"
    };

    console.log('📊 Processed booking data:', bookingData);

    const booking = await prisma.rideBooking.create({
      data: bookingData,
      include: {
        rider: {
          select: {
            fullName: true,
            phone: true,
            email: true
          }
        }
      }
    });

    console.log('✅ Booking created successfully:', booking.id);

    res.status(201).json({
      success: true,
      message: "Ride booked successfully",
      data: booking
    });
  } catch (error) {
    console.error('❌ Booking creation error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message
    });
  }
};

// Get Booking by ID with Rider Details
export const getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Fetching booking: ${id}`);

    const booking = await prisma.rideBooking.findUnique({
      where: { id },
      include: {
        rider: {
          select: {
            fullName: true,
            phone: true,
            email: true,
            rating: true
          }
        },
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            vehicleNumber: true,
            rating: true,
            totalRides: true
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

    // ✅ Detect if driver object is null but driverId exists
    let driverDetails = booking.driver;

    // Fallback: fetch driver manually if missing
    if (!driverDetails && booking.driverId) {
      console.log("🔍 Fetching driver manually for:", booking.driverId);
      driverDetails = await prisma.driver.findUnique({
        where: { id: booking.driverId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          vehicleNumber: true,
          rating: true,
          totalRides: true
        }
      });
    }

    const responseData = {
      bookingId: booking.id,
      fromLocation: booking.fromLocation,
      toLocation: booking.toLocation,
      price: booking.price.toString(),
      distance: booking.distance.toString(),
      customerName: booking.rider?.fullName || "Unknown",
      customerPhone: booking.rider?.phone || "N/A",
      customerEmail: booking.rider?.email || "N/A",
      customerRating: booking.rider?.rating || "N/A",
      pickupLat: booking.fromLat,
      pickupLng: booking.fromLon,
      dropLat: booking.toLat,
      dropLng: booking.toLon,
      status: booking.status,
      vehicleType: booking.vehicleType,
      userId: booking.userId,
      // ✅ Driver Info (Always Real Name)
      driverId: driverDetails?.id || booking.driverId,
      driverName: driverDetails?.fullName || "Unassigned",
      driverPhone: driverDetails?.phone || null,
      driverVehicle: driverDetails?.vehicleNumber || null,
      driverRating: driverDetails?.rating || null,
      driverTotalRides: driverDetails?.totalRides || 0
    };

    console.log(`✅ Final Driver Shown: ${responseData.driverName}`);

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error("❌ Get booking error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get booking",
      error: error.message
    });
  }
};


// Update Booking Status
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const updateData = { status };

    // Add timestamp based on status
    switch (status) {
      case 'ACCEPTED':
        updateData.acceptedAt = new Date();
        break;
      case 'ARRIVED':
        updateData.arrivedAt = new Date();
        break;
      case 'STARTED':
        updateData.startedAt = new Date();
        break;
      case 'COMPLETED':
        updateData.completedAt = new Date();
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        break;
    }

    const booking = await prisma.rideBooking.update({
      where: { id },
      data: updateData,
      include: {
        rider: {
          select: {
            fullName: true,
            phone: true
          }
        },
        driver: {
          select: {
            fullName: true,
            phone: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: `Booking ${status.toLowerCase()} successfully`,
      data: booking
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update booking", error: error.message });
  }
};

// Initialize Vehicle Types - ✅ FIXED: Export add किया
export const initializeVehicleTypes = async (req, res) => {
  try {
    const vehicleTypes = [
      { name: "Auto", icon: "bicycle", basePrice: 30, pricePerKm: 14, seats: 3, color: "#EF4444", isActive: true },
      { name: "Mini Car", icon: "car-sport", basePrice: 40, pricePerKm: 18, seats: 4, color: "#3B82F6", isActive: true },
      { name: "Sedan", icon: "car", basePrice: 50, pricePerKm: 20, seats: 4, color: "#10B981", isActive: true },
      { name: "SUV", icon: "car-sport", basePrice: 60, pricePerKm: 24, seats: 6, color: "#F59E0B", isActive: true },
      { name: "7-Seater", icon: "people", basePrice: 80, pricePerKm: 30, seats: 7, color: "#8B5CF6", isActive: true }
    ];

    const created = await Promise.all(
      vehicleTypes.map(v =>
        prisma.vehicleType.upsert({
          where: { name: v.name },
          update: v,
          create: v
        })
      )
    );

    res.json({
      success: true,
      message: "Vehicle types initialized",
      data: created
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initialize vehicles", error: error.message });
  }
};

// ✅ Add missing exports if any
export const getAllBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const whereClause = status ? { status } : {};

    const bookings = await prisma.rideBooking.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        rider: {
          select: {
            fullName: true,
            phone: true
          }
        },
        driver: {
          select: {
            fullName: true,
            phone: true
          }
        }
      }
    });

    const total = await prisma.rideBooking.count({ where: whereClause });

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          current: parseInt(page),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to get bookings", error: error.message });
  }
};