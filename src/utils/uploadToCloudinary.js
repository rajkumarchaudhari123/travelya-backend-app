import cloudinary from "./cloudinary.js";

export const uploadToCloudinary = async (fileBuffer, folderName) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream({ folder: folderName }, (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            })
            .end(fileBuffer);
    });
};
