// socketServer.js

import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeConnections = new Map();

export function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.CORS_ORIGIN,
        process.env.CORS_ORIGIN_ADMIN,
        "http://localhost:8081",
        "http://10.0.2.2:8081",
        "http://localhost:10000",
        "exp://your-app-url"
      ],
      methods: ["GET", "POST"]
    }
  });

  // Calculate distance between two coordinates
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2);
  }

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Register user (rider or driver)
    socket.on('register_user', async (data) => {
      try {
        const { userId, userType } = data;
        activeConnections.set(userId, socket.id);
        socket.userId = userId;
        socket.userType = userType;
        
        // Update user online status in database
        if (userType === 'driver') {
          await prisma.driver.update({
            where: { id: userId },
            data: { 
              isOnline: true,
              currentLat: data.latitude || null,
              currentLng: data.longitude || null
            }
          });
        } else {
          await prisma.rider.update({
            where: { id: userId },
            data: { 
              isOnline: true,
              currentLat: data.latitude || null,
              currentLng: data.longitude || null
            }
          });
        }
        
        console.log(`User ${userId} registered as ${userType}`);
        
        socket.emit('registration_success', { 
          success: true, 
          message: 'Successfully registered with socket server' 
        });
      } catch (error) {
        console.error('Error in user registration:', error);
        socket.emit('registration_error', { error: error.message });
      }
    });

    // Rider requests a ride
    socket.on('request_ride', async (data) => {
      try {
        const { 
          riderId, 
          vehicleType,
          fromLocation, 
          toLocation, 
          price, 
          distance,
          pickupLat,
          pickupLng,
          dropLat,
          dropLng
        } = data;

        // Create booking in database
        const booking = await prisma.rideBooking.create({
          data: {
            vehicleType,
            fromLocation,
            toLocation,
            price: parseFloat(price),
            distance: parseFloat(distance),
            fromLat: parseFloat(pickupLat),
            fromLon: parseFloat(pickupLng),
            toLat: parseFloat(dropLat),
            toLon: parseFloat(dropLng),
            userId: riderId,
            status: 'PENDING'
          },
          include: {
            rider: {
              select: {
                fullName: true,
                phone: true,
                rating: true
              }
            }
          }
        });

        // Find nearby online drivers
        const nearbyDrivers = await prisma.driver.findMany({
          where: {
            isOnline: true,
            isAvailable: true,
            status: 'ACTIVE'
          },
          take: 20
        });

        // Notify nearby drivers
        nearbyDrivers.forEach(driver => {
          const driverSocketId = activeConnections.get(driver.id);
          if (driverSocketId) {
            io.to(driverSocketId).emit('new_ride_request', {
              bookingId: booking.id,
              fromLocation,
              toLocation,
              price,
              distance,
              pickupLat,
              pickupLng,
              dropLat,
              dropLng,
              vehicleType,
              customerName: booking.rider.fullName,
              customerPhone: booking.rider.phone,
              customerRating: booking.rider.rating
            });
          }
        });

        socket.emit('ride_requested', { 
          success: true, 
          bookingId: booking.id,
          message: 'Ride request sent to nearby drivers'
        });

      } catch (error) {
        console.error('Error requesting ride:', error);
        socket.emit('ride_requested', { 
          success: false, 
          error: error.message 
        });
      }
    });

    // Driver accepts ride
    socket.on('accept_ride', async (data) => {
      try {
        const { bookingId, driverId } = data;
        
        // Get driver details
        const driver = await prisma.driver.findUnique({
          where: { id: driverId }
        });

        if (!driver) {
          throw new Error('Driver not found');
        }

        // Update booking with driver
        const booking = await prisma.rideBooking.update({
          where: { id: bookingId },
          data: {
            driverId: driverId,
            driverName: driver.fullName,
            status: 'ACCEPTED',
            acceptedAt: new Date()
          },
          include: {
            rider: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true
              }
            }
          }
        });

        // Update driver availability
        await prisma.driver.update({
          where: { id: driverId },
          data: { isAvailable: false }
        });

        // Notify rider
        const riderSocketId = activeConnections.get(booking.rider.id);
        if (riderSocketId) {
          io.to(riderSocketId).emit('ride_accepted_by_driver', {
            bookingId: booking.id,
            driverName: driver.fullName,
            driverPhone: driver.phone,
            driverVehicle: driver.vehicleNumber,
            driverRating: driver.rating,
            driverLat: driver.currentLat,
            driverLng: driver.currentLng
          });
        }

        socket.emit('ride_accepted', { 
          success: true, 
          booking: {
            ...booking,
            customerName: booking.rider.fullName,
            customerPhone: booking.rider.phone
          },
          message: 'Ride accepted successfully' 
        });

      } catch (error) {
        console.error('Error accepting ride:', error);
        socket.emit('ride_accepted', { 
          success: false, 
          error: error.message 
        });
      }
    });

    // Update location (both rider and driver)
    socket.on('update_location', async (data) => {
      try {
        const { userId, userType, latitude, longitude } = data;
        
        // Update user's current location in database
        if (userType === 'driver') {
          await prisma.driver.update({
            where: { id: userId },
            data: { 
              currentLat: parseFloat(latitude),
              currentLng: parseFloat(longitude)
            }
          });
        } else {
          await prisma.rider.update({
            where: { id: userId },
            data: { 
              currentLat: parseFloat(latitude),
              currentLng: parseFloat(longitude)
            }
          });
        }

        // Find active booking for this user
        let activeBooking;
        if (userType === 'driver') {
          activeBooking = await prisma.rideBooking.findFirst({
            where: { 
              driverId: userId,
              status: { in: ['ACCEPTED', 'ARRIVED', 'STARTED'] }
            },
            include: {
              rider: true
            }
          });
        } else {
          activeBooking = await prisma.rideBooking.findFirst({
            where: { 
              userId: userId,
              status: { in: ['ACCEPTED', 'ARRIVED', 'STARTED'] }
            },
            include: {
              driver: true
            }
          });
        }

        if (activeBooking) {
          // Notify the other party about location update
          const otherUserId = userType === 'driver' 
            ? activeBooking.userId
            : activeBooking.driverId;
          
          const otherUserSocketId = activeConnections.get(otherUserId);
          
          if (otherUserSocketId) {
            io.to(otherUserSocketId).emit('location_updated', {
              userId,
              userType,
              latitude,
              longitude,
              bookingId: activeBooking.id,
              distance: calculateDistance(
                latitude, 
                longitude, 
                userType === 'driver' ? activeBooking.fromLat : activeBooking.driver?.currentLat,
                userType === 'driver' ? activeBooking.fromLon : activeBooking.driver?.currentLng
              )
            });
          }
        }

        socket.emit('location_updated_success', { 
          success: true 
        });

      } catch (error) {
        console.error('Error updating location:', error);
        socket.emit('location_update_error', { 
          error: error.message 
        });
      }
    });

    // Update ride status
    socket.on('update_ride_status', async (data) => {
      try {
        const { bookingId, status } = data;
        
        const updateData = { status };
        
        // Add timestamp based on status
        switch (status) {
          case 'ARRIVED':
            updateData.arrivedAt = new Date();
            break;
          case 'STARTED':
            updateData.startedAt = new Date();
            break;
          case 'COMPLETED':
            updateData.completedAt = new Date();
            break;
        }

        const booking = await prisma.rideBooking.update({
          where: { id: bookingId },
          data: updateData,
          include: {
            rider: {
              select: {
                id: true,
                fullName: true,
                phone: true
              }
            },
            driver: {
              select: {
                id: true,
                fullName: true,
                phone: true
              }
            }
          }
        });

        // Notify both parties
        const riderSocketId = activeConnections.get(booking.userId);
        const driverSocketId = activeConnections.get(booking.driverId);

        if (riderSocketId) {
          io.to(riderSocketId).emit('ride_status_updated', { 
            bookingId, 
            status 
          });
        }
        if (driverSocketId) {
          io.to(driverSocketId).emit('ride_status_updated', { 
            bookingId, 
            status 
          });
        }

        // Handle ride completion
        if (status === 'COMPLETED') {
          // Make driver available again
          await prisma.driver.update({
            where: { id: booking.driverId },
            data: { isAvailable: true }
          });

          // Update ride counts
          await Promise.all([
            prisma.driver.update({
              where: { id: booking.driverId },
              data: { totalRides: { increment: 1 } }
            }),
            prisma.rider.update({
              where: { id: booking.userId },
              data: { totalRides: { increment: 1 } }
            })
          ]);

          if (riderSocketId) {
            io.to(riderSocketId).emit('ride_completed', { 
              bookingId, 
              price: booking.price 
            });
          }
          if (driverSocketId) {
            io.to(driverSocketId).emit('ride_completed', { 
              bookingId, 
              price: booking.price 
            });
          }
        }

        socket.emit('ride_status_update_success', { 
          success: true 
        });

      } catch (error) {
        console.error('Error updating ride status:', error);
        socket.emit('ride_status_update_error', { 
          error: error.message 
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      
      if (socket.userId && socket.userType) {
        activeConnections.delete(socket.userId);
        
        // Update user offline status
        try {
          if (socket.userType === 'driver') {
            await prisma.driver.update({
              where: { id: socket.userId },
              data: { 
                isOnline: false,
                isAvailable: false 
              }
            });
          } else {
            await prisma.rider.update({
              where: { id: socket.userId },
              data: { isOnline: false }
            });
          }
        } catch (error) {
          console.error('Error updating offline status:', error);
        }
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('✅ Socket server setup completed');
  return io;
}

export { activeConnections };