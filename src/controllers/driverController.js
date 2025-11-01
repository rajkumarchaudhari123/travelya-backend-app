import { PrismaClient } from "@prisma/client";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
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
      journeyType,
      fromCity,
      toCity,
    } = req.body;

    // Basic validation
    if (!fullName || !phone || !vehicleNumber || !licenseNumber) {
      return res.status(400).json({
        error:
          "Missing required fields: fullName, phone, vehicleNumber, licenseNumber",
      });
    }

    // Upload images to Cloudinary
    const idFrontUrl = req.files?.idFront
      ? await uploadToCloudinary(req.files.idFront[0].buffer, "drivers/idFront")
      : null;
    const idBackUrl = req.files?.idBack
      ? await uploadToCloudinary(req.files.idBack[0].buffer, "drivers/idBack")
      : null;
    const licenseDocUrl = req.files?.licenseDoc
      ? await uploadToCloudinary(req.files.licenseDoc[0].buffer, "drivers/license")
      : null;
    const rcDocUrl = req.files?.rcDoc
      ? await uploadToCloudinary(req.files.rcDoc[0].buffer, "drivers/rcDoc")
      : null;
    const selfieUrl = req.files?.selfie
      ? await uploadToCloudinary(req.files.selfie[0].buffer, "drivers/selfie")
      : null;

    // Determine journey type
    let journeyTypeValue;
    if (journeyType?.intercity && journeyType?.local) journeyTypeValue = "BOTH";
    else if (journeyType?.intercity) journeyTypeValue = "INTERCITY";
    else if (journeyType?.local) journeyTypeValue = "LOCAL";
    else journeyTypeValue = "UNKNOWN";

    // Save to Prisma DB
    const driver = await prisma.driver.create({
      data: {
        fullName,
        phone,
        email,
        vehicleNumber,
        licenseNumber,
        idFront: idFrontUrl,
        idBack: idBackUrl,
        licenseDoc: licenseDocUrl,
        rcDoc: rcDocUrl,
        selfie: selfieUrl,
        journeyType: journeyTypeValue,
        fromCity,
        toCity,
        status: "ACTIVE",
      },
    });

    res.status(201).json({
      success: true,
      message: "Driver registered successfully",
      driverId: driver.id,
      driverData: driver,
    });
  } catch (error) {
    console.error("Error registering driver:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
};
