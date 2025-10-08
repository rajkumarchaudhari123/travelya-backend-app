import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const registerDriver = async (req, res) => {
  try {
    console.log("Received driver registration data:", req.body);
    
    const {
      fullName,
      phone,
      email,
      vehicleNumber,
      licenseNumber,
      idFront,
      idBack,
      licenseDoc,
      rcDoc,
      selfie,
      journeyType,
      fromCity,
      toCity
    } = req.body;

    // Basic validation
    if (!fullName || !phone || !vehicleNumber || !licenseNumber) {
      return res.status(400).json({
        error: "Missing required fields: fullName, phone, vehicleNumber, licenseNumber"
      });
    }

    // Convert journeyType object to string/enum value
    let journeyTypeValue;
    if (journeyType.intercity && journeyType.local) {
      journeyTypeValue = "BOTH";
    } else if (journeyType.intercity) {
      journeyTypeValue = "INTERCITY";
    } else if (journeyType.local) {
      journeyTypeValue = "LOCAL";
    } else {
      journeyTypeValue = "UNKNOWN";
    }

    // Save to database
    const driver = await prisma.driver.create({
      data: {
        fullName,
        phone,
        email,
        vehicleNumber,
        licenseNumber,
        idFront,
        idBack,
        licenseDoc,
        rcDoc,
        selfie,
        journeyType: journeyTypeValue, // Use the converted value
        fromCity,
        toCity,
        status: "PENDING"
      }
    });

    console.log("Driver registered successfully:", driver.id);

    res.status(201).json({
      success: true,
      message: "Driver registered successfully",
      driverId: driver.id,
      data: driver
    });

  } catch (error) {
    console.error("Error registering driver:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
};