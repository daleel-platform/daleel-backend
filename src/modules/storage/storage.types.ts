import type { UploadApiOptions } from 'cloudinary';

export type ResourceType = 'image' | 'raw';
export type DeliveryType = 'upload' | 'authenticated';
export interface UploadOptions {
  folder: string;
  publicId?: string;
  overwrite?: boolean;
  resourceType?: ResourceType;
  type?: DeliveryType;
  transformation?: UploadApiOptions['transformation'];
}
export interface UploadResult {
  publicId: string;
  url: string;
  resourceType: ResourceType;
  type: DeliveryType;
  format: string;
  bytes: number;
}
export interface AssetOptions {
  resourceType?: ResourceType;
  type?: DeliveryType;
}
export interface DeleteOptions extends AssetOptions {
  type: DeliveryType;
}
export interface SignedUrlOptions extends AssetOptions {
  format: string;
  expiresIn?: number;
}
