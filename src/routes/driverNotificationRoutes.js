import express from 'express';
import {
    getPendingRideRequests,
    acceptRide,
    declineRide,
    getDriverNotifications,
    markNotificationAsRead
} from '../controllers/driverNotificationController.js';

const router = express.Router();

// Ride request routes
router.get('/pending-rides', getPendingRideRequests);
router.post('/accept-ride', acceptRide);
router.post('/decline-ride', declineRide);

// Notification routes
router.get('/notifications', getDriverNotifications);
router.put('/notifications/:notificationId/read', markNotificationAsRead);

export default router;