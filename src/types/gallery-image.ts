export type GalleryImageSummary = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type GalleryImageDetail = GalleryImageSummary;

export type GalleryImageInput = {
  title: string;
  description: string;
  imageUrl: string;
};