// routes/socketRoutes.js
import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Get active connections (for admin purposes)
router.get('/active-connections', (req, res) => {
  // This would typically require authentication
  const { activeConnections } = require('../socketServer.js');
  
  res.json({
    success: true,
    activeConnections: Array.from(activeConnections.entries()),
    totalConnections: activeConnections.size
  });
});

// Get online drivers
router.get('/online-drivers', async (req, res) => {
  try {
    const onlineDrivers = await prisma.driver.findMany({
      where: {
        isOnline: true,
        isAvailable: true
      },
      select: {
        id: true,
        name: true,
        phone: true,
        vehicleType: true,
        currentLat: true,
        currentLng: true,
        rating: true
      }
    });

    res.json({
      success: true,
      onlineDrivers,
      count: onlineDrivers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get active bookings with real-time info
router.get('/active-bookings', async (req, res) => {
  try {
    const activeBookings = await prisma.booking.findMany({
      where: {
        status: {
          in: ['accepted', 'ongoing']
        }
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            currentLat: true,
            currentLng: true
          }
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicleType: true,
            currentLat: true,
            currentLng: true
          }
        }
      }
    });

    res.json({
      success: true,
      activeBookings,
      count: activeBookings.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get booking real-time status
router.get('/booking/:id/status', async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            currentLat: true,
            currentLng: true
          }
        },
        driver: {
          select: {
            id: true,
            name: true,
            vehicleType: true,
            currentLat: true,
            currentLng: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;