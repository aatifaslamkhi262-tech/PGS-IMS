"use client";

import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductImage } from "@/models/Product";

interface ProductImageGalleryProps {
  images: ProductImage[];
  productName?: string;
}

export const ProductImageGallery: React.FC<ProductImageGalleryProps> = ({
  images,
  productName,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-slate-600" />
        </div>
        <p className="text-sm text-slate-400">No images available</p>
      </div>
    );
  }

  const sortedImages = [...images].sort((a, b) => a.order - b.order);
  const primaryImage = sortedImages[selectedIndex] || sortedImages[0];

  const handlePrevious = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sortedImages.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < sortedImages.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="space-y-4">
      {/* Main Image Display */}
      <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
        <div className="aspect-square md:aspect-video">
          <img
            src={primaryImage.url}
            alt={`${productName} - Image ${selectedIndex + 1}`}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Navigation Arrows */}
        {sortedImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevious}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Image Counter */}
        {sortedImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900/90 text-white text-xs font-medium rounded-full">
            {selectedIndex + 1} / {sortedImages.length}
          </div>
        )}
      </div>

      {/* Thumbnail Gallery */}
      {sortedImages.length > 1 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {sortedImages.map((image, index) => (
            <button
              key={image.publicId}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                index === selectedIndex
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <img
                src={image.url}
                alt={`${productName} - Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {image.isPrimary && (
                <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                  Primary
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
