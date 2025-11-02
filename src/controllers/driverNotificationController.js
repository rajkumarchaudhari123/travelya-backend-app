import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Get pending ride requests for driver - COMPLETELY FIXED
const getPendingRideRequests = async (req, res) => {
    try {
        const { driverId } = req.query;

        if (!driverId) {
            return res.status(400).json({
                success: false,
                message: 'Driver ID is required'
            });
        }

        console.log(`🔄 Fetching pending ride requests for driver: ${driverId}`);

        // ✅ FIXED: Use ONLY UPPERCASE PENDING status
        const pendingRides = await prisma.rideBooking.findMany({
            where: {
                AND: [
                    {
                        status: "PENDING"  // ✅ ONLY PENDING, no OR condition needed
                    },
                    {
                        driverId: null  // No driver assigned yet
                    }
                ]
            },
            orderBy: {
                created_at: "desc"
            },
            take: 10
        });

        console.log(`✅ Found ${pendingRides.length} pending rides`);

        // Format the response
        const formattedRides = pendingRides.map(ride => ({
            bookingId: ride.id,
            fromLocation: ride.fromLocation,
            toLocation: ride.toLocation,
            price: ride.price,
            distance: ride.distance,
            vehicleType: ride.vehicleType,
            customerName: ride.customerName || 'Customer',
            customerPhone: ride.customerPhone || 'Not available',
            customerRating: ride.customerRating || 4.5,
            timestamp: ride.created_at,
        }));

        return res.status(200).json({
            success: true,
            message: 'Pending rides fetched successfully',
            data: formattedRides
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

// Accept ride request - FIXED
const acceptRide = async (req, res) => {
    try {
        const { bookingId, driverId, driverName, driverPhone, vehicleNumber } = req.body;

        if (!bookingId || !driverId) {
            return res.status(400).json({
                success: false,
                message: 'Booking ID and Driver ID are required'
            });
        }

        console.log(`✅ Driver ${driverId} accepting ride: ${bookingId}`);

        // Check if ride exists and is still available
        const existingRide = await prisma.rideBooking.findUnique({
            where: { id: bookingId }
        });

        if (!existingRide) {
            return res.status(404).json({
                success: false,
                message: 'Ride not found'
            });
        }

        if (existingRide.driverId) {
            return res.status(400).json({
                success: false,
                message: 'Ride already accepted by another driver'
            });
        }

        // ✅ FIXED: Use UPPERCASE status
        const updatedBooking = await prisma.rideBooking.update({
            where: { id: bookingId },
            data: {
                status: "ACCEPTED",
                driverId: driverId,
                driverName: driverName || null,
                acceptedAt: new Date()
            }
        });

        // Create driver notification
        await prisma.driverNotification.create({
            data: {
                driverId: driverId,
                rideBookingId: bookingId,
                type: "RIDE_REQUEST",
                status: "accepted",
                message: `Ride accepted by driver ${driverName}`,
                isRead: false
            }
        });

        console.log(`✅ Ride ${bookingId} accepted by driver ${driverId}`);

        return res.status(200).json({
            success: true,
            message: 'Ride accepted successfully',
            data: updatedBooking
        });

    } catch (error) {
        console.error('❌ Accept ride error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to accept ride',
            error: error.message
        });
    }
};

// Decline ride request - FIXED
const declineRide = async (req, res) => {
    try {
        const { bookingId, driverId } = req.body;

        if (!bookingId || !driverId) {
            return res.status(400).json({
                success: false,
                message: 'Booking ID and Driver ID are required'
            });
        }

        console.log(`❌ Driver ${driverId} declining ride: ${bookingId}`);

        // ✅ FIXED: Use UPPERCASE status
        const updatedBooking = await prisma.rideBooking.update({
            where: { id: bookingId },
            data: {
                status: "DECLINED",
                declinedAt: new Date()
            }
        });

        // Create driver notification
        await prisma.driverNotification.create({
            data: {
                driverId: driverId,
                rideBookingId: bookingId,
                type: "RIDE_REQUEST",
                status: "declined",
                message: `Ride declined by driver`,
                isRead: false
            }
        });

        console.log(`✅ Ride ${bookingId} declined by driver ${driverId}`);

        return res.status(200).json({
            success: true,
            message: 'Ride declined successfully',
            data: updatedBooking
        });

    } catch (error) {
        console.error('❌ Decline ride error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to decline ride',
            error: error.message
        });
    }
};

// Combined accept/decline handler - FIXED
const handleRideResponse = async (req, res) => {
    try {
        const { bookingId, driverId, driverName, driverPhone, vehicleNumber, status } = req.body;

        console.log(`🎯 Ride ${status} request:`, { 
            bookingId, 
            driverId, 
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

        // Check if ride exists
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
        let prismaStatus = "";
        
        if (status === 'accepted') {
            prismaStatus = "ACCEPTED"; // ✅ UPPERCASE
            updateData = {
                status: prismaStatus,
                driverId: driverId,
                driverName: driverName,
                acceptedAt: new Date(),
            };
        } else {
            prismaStatus = "DECLINED"; // ✅ UPPERCASE
            updateData = {
                status: prismaStatus,
                declinedAt: new Date(),
            };
        }

        const updatedRide = await prisma.rideBooking.update({
            where: { id: bookingId },
            data: updateData
        });

        // Create driver notification
        await prisma.driverNotification.create({
            data: {
                driverId: driverId,
                rideBookingId: bookingId,
                type: "RIDE_REQUEST",
                status: status, // lowercase for notification status
                message: `Ride ${status} for ${ride.fromLocation} to ${ride.toLocation}`,
                isRead: false
            }
        });

        console.log(`✅ Ride ${status} successfully:`, updatedRide.id);

        // Prepare response
        const responseData = {
            bookingId: updatedRide.id,
            status: updatedRide.status,
            driverAssigned: status === 'accepted' ? driverName : null,
            fromLocation: updatedRide.fromLocation,
            toLocation: updatedRide.toLocation
        };

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
            error: error.message
        });
    }
};

// Get driver notifications
const getDriverNotifications = async (req, res) => {
    try {
        const { driverId } = req.query;

        if (!driverId) {
            return res.status(400).json({
                success: false,
                message: 'Driver ID is required'
            });
        }

        console.log(`📋 Fetching notifications for driver: ${driverId}`);

        const notifications = await prisma.driverNotification.findMany({
            where: {
                driverId: driverId
            },
            include: {
                rideBooking: true
            },
            orderBy: {
                createdAt: "desc"
            },
            take: 20
        });

        console.log(`✅ Found ${notifications.length} notifications`);

        return res.status(200).json({
            success: true,
            message: 'Notifications fetched successfully',
            data: notifications
        });

    } catch (error) {
        console.error('❌ Get notifications error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID is required'
            });
        }

        console.log(`📌 Marking notification as read: ${notificationId}`);

        const updatedNotification = await prisma.driverNotification.update({
            where: { id: notificationId },
            data: {
                isRead: true
            }
        });

        console.log(`✅ Notification ${notificationId} marked as read`);

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read',
            data: updatedNotification
        });

    } catch (error) {
        console.error('❌ Mark notification as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read',
            error: error.message
        });
    }
};

export {
    getPendingRideRequests,
    acceptRide,
    declineRide,
    handleRideResponse,
    getDriverNotifications,
    markNotificationAsRead
};