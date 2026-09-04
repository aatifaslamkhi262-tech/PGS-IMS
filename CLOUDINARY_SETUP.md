# Cloudinary Setup Instructions

## Required Environment Variables

Add the following environment variables to your `.env.local` file:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

## Getting Cloudinary Credentials

1. Sign up for a Cloudinary account at https://cloudinary.com
2. Navigate to your Dashboard
3. Copy your Cloud Name, API Key, and API Secret
4. Create an upload preset (optional but recommended):
   - Go to Settings → Upload
   - Create an unsigned upload preset
   - Note the preset name

## Installation

The following package has been added to your project:

```bash
npm install cloudinary
```

## Features Implemented

- Multiple image upload per product (max 10 images)
- Cloudinary image storage
- Primary image selection
- Image reordering
- Image deletion with Cloudinary cleanup
- Optimized image URLs
- File validation (JPG, PNG, WEBP, max 5MB)
- Mobile-friendly image gallery
- Legacy data support (string array → ProductImage structure)
