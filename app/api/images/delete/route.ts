import { NextRequest, NextResponse } from 'next/server';
import { deleteImageFromCloudinary } from '@/lib/cloudinary';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { publicId } = body;

    if (!publicId) {
      return NextResponse.json(
        { success: false, error: 'Public ID is required' },
        { status: 400 }
      );
    }

    await deleteImageFromCloudinary(publicId);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error: any) {
    console.error('Image delete error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete image' },
      { status: 500 }
    );
  }
}
