// routes/bookingRoutes.js

import express from "express";
import { 
  createBooking, 
  getBooking, 
  updateBookingStatus, 
  initializeVehicleTypes 
} from "../controllers/bookingController.js";

const router = express.Router();

router.post("/create", createBooking);
router.get("/:id", getBooking);
router.put("/:id/status", updateBookingStatus);
router.post("/init-vehicles", initializeVehicleTypes);

export default router;