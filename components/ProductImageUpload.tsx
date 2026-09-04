"use client";

import React, { useState, useRef } from "react";
import { X, Plus, Star, Loader2, AlertCircle } from "lucide-react";
import { ToastMessage } from "@/components/Toast";

interface ProductImage {
  url: string;
  publicId: string;
  isPrimary: boolean;
  order: number;
  width?: number;
  height?: number;
  format?: string;
}

interface ProductImageUploadProps {
  images: ProductImage[];
  setImages: (images: ProductImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
  onUploadError?: (error: string) => void;
}

export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images,
  setImages,
  maxImages = 10,
  disabled = false,
  onUploadError,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    // Check if adding would exceed max
    if (images.length + files.length > maxImages) {
      const errorMsg = `Maximum ${maxImages} images allowed per product. You have ${images.length} images and are trying to add ${files.length} more.`;
      setError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    setUploading(true);
    setError("");

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'pgs-ims/products');

        const response = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to upload image');
        }

        const data = await response.json();
        return {
          ...data.data,
          isPrimary: images.length === 0, // First image is primary by default
          order: images.length,
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      
      setImages([...images, ...uploadedImages]);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to upload images';
      setError(errorMsg);
      onUploadError?.(errorMsg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async (index: number) => {
    const imageToRemove = images[index];
    
    // Delete from Cloudinary
    try {
      await fetch('/api/images/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: imageToRemove.publicId }),
      });
    } catch (err) {
      console.error('Failed to delete image from Cloudinary:', err);
    }

    // Remove from state
    const newImages = images.filter((_, i) => i !== index);
    
    // If we removed the primary image, make the first one primary
    if (imageToRemove.isPrimary && newImages.length > 0) {
      newImages[0].isPrimary = true;
    }
    
    // Update order
    newImages.forEach((img, i) => img.order = i);
    
    setImages(newImages);
  };

  const handleSetPrimary = (index: number) => {
    const newImages = images.map((img, i) => ({
      ...img,
      isPrimary: i === index,
    }));
    setImages(newImages);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const newImages = [...images];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    
    // Update order and preserve primary
    newImages.forEach((img, i) => {
      img.order = i;
      if (images[fromIndex].isPrimary) {
        img.isPrimary = true;
      }
    });
    
    setImages(newImages);
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      {!disabled && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || images.length >= maxImages}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= maxImages}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl border border-indigo-500 disabled:border-slate-600 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Images
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-500 mt-1">
            {images.length}/{maxImages} images. Max {maxImages} per product.
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images
            .sort((a, b) => a.order - b.order)
            .map((image, index) => (
              <div
                key={image.publicId}
                className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                  image.isPrimary
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {/* Image */}
                <div className="aspect-square bg-slate-950">
                  <img
                    src={image.url}
                    alt={`Product image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Primary Badge */}
                {image.isPrimary && (
                  <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Primary
                  </div>
                )}

                {/* Actions Overlay */}
                {!disabled && (
                  <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(index)}
                      disabled={image.isPrimary}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      title="Set as primary"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && !disabled && (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Plus className="w-6 h-6 text-slate-500" />
          </div>
          <p className="text-sm text-slate-400 mb-1">No images added yet</p>
          <p className="text-xs text-slate-500">Click "Add Images" to upload product photos</p>
        </div>
      )}
    </div>
  );
};
