import { v2 as cloudinary } from 'cloudinary';

// Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('Cloudinary credentials not found in environment variables. Image upload will not work.');
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

// Image interface for Cloudinary uploads
export interface CloudinaryImage {
  url: string;
  publicId: string;
  isPrimary: boolean;
  order: number;
  width?: number;
  height?: number;
  format?: string;
}

// Upload image to Cloudinary
export async function uploadImageToCloudinary(
  file: File,
  folder: string = 'pgs-ims/products'
): Promise<CloudinaryImage> {
  try {
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use signed upload with Cloudinary SDK
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      isPrimary: false,
      order: 0,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

// Delete image from Cloudinary
export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
}

// Generate optimized image URL
export function getOptimizedImageUrl(
  url: string,
  width: number = 800,
  height: number = 800,
  quality: number = 80
): string {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('w', width.toString());
    urlObj.searchParams.set('h', height.toString());
    urlObj.searchParams.set('q', quality.toString());
    urlObj.searchParams.set('f_auto', 'auto');
    return urlObj.toString();
  } catch {
    return url;
  }
}

// Validate image file
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Only JPG, PNG, and WEBP are allowed.',
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size exceeds 5MB limit.',
    };
  }

  return { valid: true };
}
