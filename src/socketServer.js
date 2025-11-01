// socketServer.js
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Store active connections
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
        "exp://your-app-url" // Expo app URL
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

  // Socket.io Connections
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
            where: { id: parseInt(userId) },
            data: { isOnline: true }
          });
        } else {
          await prisma.rider.update({
            where: { id: parseInt(userId) },
            data: { isOnline: true }
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
        const booking = await prisma.booking.create({
          data: {
            riderId: parseInt(riderId),
            fromLocation,
            toLocation,
            price: parseFloat(price),
            distance: parseFloat(distance),
            pickupLat: parseFloat(pickupLat),
            pickupLng: parseFloat(pickupLng),
            dropLat: parseFloat(dropLat),
            dropLng: parseFloat(dropLng),
            status: 'pending'
          }
        });

        // Find nearby online drivers
        const nearbyDrivers = await prisma.driver.findMany({
          where: {
            isOnline: true,
            isAvailable: true
          },
          take: 10
        });

        // Get rider details
        const rider = await prisma.rider.findUnique({
          where: { id: parseInt(riderId) }
        });

        // Notify nearby drivers
        nearbyDrivers.forEach(driver => {
          const driverSocketId = activeConnections.get(driver.id.toString());
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
              riderName: rider?.name || 'Rider',
              riderPhone: rider?.phone || 'Not available'
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
        
        // Update booking with driver
        const booking = await prisma.booking.update({
          where: { id: parseInt(bookingId) },
          data: {
            driverId: parseInt(driverId),
            status: 'accepted'
          },
          include: {
            rider: true,
            driver: true
          }
        });

        // Update driver availability
        await prisma.driver.update({
          where: { id: parseInt(driverId) },
          data: { isAvailable: false }
        });

        // Notify rider
        const riderSocketId = activeConnections.get(booking.riderId.toString());
        if (riderSocketId) {
          io.to(riderSocketId).emit('ride_accepted_by_driver', {
            bookingId: booking.id,
            driverName: booking.driver.name,
            driverPhone: booking.driver.phone,
            driverVehicle: booking.driver.vehicleType,
            driverRating: booking.driver.rating,
            driverLat: booking.driver.currentLat,
            driverLng: booking.driver.currentLng
          });
        }

        socket.emit('ride_accepted', { 
          success: true, 
          booking,
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
            where: { id: parseInt(userId) },
            data: { 
              currentLat: parseFloat(latitude),
              currentLng: parseFloat(longitude)
            }
          });
        } else {
          await prisma.rider.update({
            where: { id: parseInt(userId) },
            data: { 
              currentLat: parseFloat(latitude),
              currentLng: parseFloat(longitude)
            }
          });
        }

        // Find active booking for this user
        let activeBooking;
        if (userType === 'driver') {
          activeBooking = await prisma.booking.findFirst({
            where: { 
              driverId: parseInt(userId),
              status: { in: ['accepted', 'ongoing'] }
            },
            include: {
              rider: true,
              driver: true
            }
          });
        } else {
          activeBooking = await prisma.booking.findFirst({
            where: { 
              riderId: parseInt(userId),
              status: { in: ['accepted', 'ongoing'] }
            },
            include: {
              rider: true,
              driver: true
            }
          });
        }

        if (activeBooking) {
          // Notify the other party about location update
          const otherUserId = userType === 'driver' 
            ? activeBooking.riderId.toString()
            : activeBooking.driverId.toString();
          
          const otherUserSocketId = activeConnections.get(otherUserId);
          
          if (otherUserSocketId) {
            io.to(otherUserSocketId).emit('location_updated', {
              userId,
              userType,
              latitude,
              longitude,
              bookingId: activeBooking.id,
              distance: userType === 'driver' 
                ? calculateDistance(
                    latitude, 
                    longitude, 
                    activeBooking.pickupLat, 
                    activeBooking.pickupLng
                  )
                : calculateDistance(
                    latitude, 
                    longitude, 
                    activeBooking.driver.currentLat, 
                    activeBooking.driver.currentLng
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
        
        const booking = await prisma.booking.update({
          where: { id: parseInt(bookingId) },
          data: { status },
          include: {
            rider: true,
            driver: true
          }
        });

        // Notify both parties
        const riderSocketId = activeConnections.get(booking.riderId.toString());
        const driverSocketId = activeConnections.get(booking.driverId.toString());

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
        if (status === 'completed') {
          // Make driver available again
          await prisma.driver.update({
            where: { id: booking.driverId },
            data: { isAvailable: true }
          });

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

    // Driver cancels ride
    socket.on('driver_cancel_ride', async (data) => {
      try {
        const { bookingId, driverId } = data;
        
        const booking = await prisma.booking.update({
          where: { id: parseInt(bookingId) },
          data: { 
            status: 'cancelled',
            driverId: null
          },
          include: {
            rider: true
          }
        });

        // Make driver available again
        await prisma.driver.update({
          where: { id: parseInt(driverId) },
          data: { isAvailable: true }
        });

        // Notify rider
        const riderSocketId = activeConnections.get(booking.riderId.toString());
        if (riderSocketId) {
          io.to(riderSocketId).emit('ride_cancelled_by_driver', {
            bookingId,
            message: 'Driver cancelled the ride'
          });
        }

        socket.emit('ride_cancelled_success', { 
          success: true 
        });

      } catch (error) {
        console.error('Error cancelling ride:', error);
        socket.emit('ride_cancelled_error', { 
          error: error.message 
        });
      }
    });

    // Rider cancels ride
    socket.on('rider_cancel_ride', async (data) => {
      try {
        const { bookingId, riderId } = data;
        
        const booking = await prisma.booking.update({
          where: { id: parseInt(bookingId) },
          data: { status: 'cancelled' },
          include: {
            driver: true
          }
        });

        // If driver was assigned, make them available
        if (booking.driverId) {
          await prisma.driver.update({
            where: { id: booking.driverId },
            data: { isAvailable: true }
          });

          // Notify driver
          const driverSocketId = activeConnections.get(booking.driverId.toString());
          if (driverSocketId) {
            io.to(driverSocketId).emit('ride_cancelled_by_rider', {
              bookingId,
              message: 'Rider cancelled the ride'
            });
          }
        }

        socket.emit('ride_cancelled_success', { 
          success: true 
        });

      } catch (error) {
        console.error('Error cancelling ride:', error);
        socket.emit('ride_cancelled_error', { 
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
              where: { id: parseInt(socket.userId) },
              data: { 
                isOnline: false,
                isAvailable: false 
              }
            });
          } else {
            await prisma.rider.update({
              where: { id: parseInt(socket.userId) },
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