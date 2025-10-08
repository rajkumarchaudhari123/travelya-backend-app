import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const registerRider = async (req, res) => {
  try {
    console.log("Received rider registration data:", req.body);

    const {
      fullName,
      phone,
      email,
      profilePhotoUrl,
      homeAddress,
      workAddress,
      preferredLanguage,
      accessibilityNeeds,
      marketingOptIn,
      acceptTerms,
    } = req.body;

    // Basic validation
    if (!fullName || !phone) {
      return res.status(400).json({
        error: "Missing required fields: fullName, phone",
      });
    }

    // Save rider data to the database
    const rider = await prisma.rider.create({
      data: {
        fullName,
        phone,
        email,
        profilePhotoUrl,
        marketingOptIn: marketingOptIn || false, // Optional field, default false
        acceptTerms: acceptTerms || false, // Optional field, default false
      },
    });

    // Save addresses (Home & Work) if provided
    const addressCreates = [];
    if (homeAddress) {
      addressCreates.push(
        prisma.riderAddress.create({
          data: {
            riderId: rider.id,
            type: "HOME",
            fullText: homeAddress,
          },
        })
      );
    }
    if (workAddress) {
      addressCreates.push(
        prisma.riderAddress.create({
          data: {
            riderId: rider.id,
            type: "WORK",
            fullText: workAddress,
          },
        })
      );
    }

    if (addressCreates.length) await Promise.all(addressCreates);

    // Save rider preferences (language, accessibility)
    if (preferredLanguage || accessibilityNeeds) {
      await prisma.riderPreference.create({
        data: {
          riderId: rider.id,
          language: preferredLanguage || null,
          accessibilityNeeds: accessibilityNeeds || null,
        },
      });
    }

    console.log("Rider registered successfully:", rider.id);

    res.status(201).json({
      success: true,
      message: "Rider registered successfully",
      riderId: rider.id,
      data: rider,
    });

  } catch (error) {
    console.error("Error registering rider:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
};
