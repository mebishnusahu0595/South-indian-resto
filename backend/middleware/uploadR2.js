const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Use memory storage for local uploads processing
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
    }
};

const uploadMemory = multer({
    storage: memoryStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

/**
 * Middleware to process and save image to local folder instead of R2
 * Converts image to WebP format for optimization
 */
const processAndUploadToR2 = (folder = 'uploads') => {
    return async (req, res, next) => {
        if (!req.file) {
            return next();
        }

        try {
            // Convert to WebP using sharp
            const webpBuffer = await sharp(req.file.buffer)
                .webp({ quality: 80 })
                .resize(800, 800, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();

            // Generate clean, unique filename
            const timestamp = Date.now();
            const originalName = path.parse(req.file.originalname).name
                .replace(/[^a-zA-Z0-9]/g, '_') // sanitize filename
                .toLowerCase();
            const uniqueName = `${originalName}_${timestamp}.webp`;

            // Local uploads folder definition
            const uploadDir = path.join(__dirname, '..', 'uploads');
            
            // Ensure uploads directory exists
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Save webp file locally
            const filePath = path.join(uploadDir, uniqueName);
            fs.writeFileSync(filePath, webpBuffer);

            // Attach the local URL to the request (e.g. /uploads/image_name.webp)
            req.fileUrl = `/uploads/${uniqueName}`;
            next();
        } catch (error) {
            console.error('Image processing error:', error);
            next(error);
        }
    };
};

module.exports = { uploadMemory, processAndUploadToR2 };
