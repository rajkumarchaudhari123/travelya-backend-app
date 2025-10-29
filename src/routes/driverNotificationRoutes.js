// routes/driverNotifications.js
import express from 'express';
import {
  getPendingRideRequests,  // NEW
  handleRideResponse,
  getDriverNotifications,
  getDriverRideHistory,     // NEW
  updateNotificationStatus  // NEW
} from '../controllers/driverNotificationController.js';

const router = express.Router();

// NEW: Get pending ride requests for drivers
router.get('/pending-rides', getPendingRideRequests);

// Accept or decline ride - FIXED ROUTE
router.post('/accept-ride', handleRideResponse);

// Get all driver notifications
router.get('/:driverId', getDriverNotifications);

// NEW: Get driver's ride history
router.get('/ride-history/:driverId', getDriverRideHistory);

// NEW: Mark notification as read
router.patch('/notifications/:notificationId/read', updateNotificationStatus);

export default router;