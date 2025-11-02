import express from 'express';
import {
    searchLocations,
    calculateFare,
    createBooking,
    getBooking,
    updateBookingStatus,
    cancelBooking,
    initializeVehicleTypes,
    checkLocationIQHealth
} from '../controllers/destinationController.js';

const router = express.Router();

// Location search routes
router.get('/search', searchLocations);
router.post('/calculate-fare', calculateFare);

// Booking routes
router.post('/book-ride', createBooking);
router.get('/bookings/:id', getBooking);
router.put('/bookings/:id/status', updateBookingStatus);
router.post('/bookings/:id/cancel', cancelBooking);

// Admin/utility routes
router.post('/initialize-vehicles', initializeVehicleTypes);
router.get('/health', checkLocationIQHealth);

export default router;