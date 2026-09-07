import "server-only";

import { del, get, put } from "@vercel/blob";

import {
  VercelBlobPrivateImageStorage,
  type PrivateBlobSdkClient,
} from "./private-blob-storage-core";

const officialVercelBlobClient: PrivateBlobSdkClient = {
  async put(pathname, bytes, options) {
    return put(pathname, Buffer.from(bytes), options);
  },
  get,
  del,
};

export function createVercelBlobPrivateImageStorage(token: string) {
  return new VercelBlobPrivateImageStorage(token, officialVercelBlobClient);
}
