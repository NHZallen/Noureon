import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

// The picture cropper is loaded the first time a picture is cropped, not with the page.
export const loadCropperVendor = createMemoizedVendorLoader(async () => {
  // Its stylesheet comes with it (it was imported by the start of the page, which made the page load the whole library).
  const [module] = await Promise.all([import('cropperjs'), import('cropperjs/dist/cropper.css')]);
  const Cropper = module.default;
  if (typeof Cropper !== 'function') throw new TypeError('Cropper did not expose a usable constructor.');
  return Cropper;
});
