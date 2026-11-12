// What the page loads when it is first needed (not with the page): Chart.js, the picture cropper and the update notes.
export { loadChartVendor } from './chart-vendor.js';
export { loadCropperVendor } from './cropper-vendor.js';
export const loadUpdateLogs = () => import('../../data/update-logs.js').then((module) => module.updateLogs);
