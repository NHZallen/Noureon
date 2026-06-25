export function compressImage(base64Data, mimeType, maxWidth = 1920, quality = 0.6) {
  return new Promise((resolve) => {
    if (mimeType === 'image/gif') {
      resolve({
        data: base64Data,
        mimeType,
        ext: 'gif'
      });
      return;
    }

    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Data}`;

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const outputMimeType = ['image/png', 'image/webp'].includes(mimeType)
        ? mimeType
        : 'image/jpeg';
      const newDataUrl = canvas.toDataURL(outputMimeType, quality);
      const extMap = {
        'image/png': 'png',
        'image/webp': 'webp',
        'image/jpeg': 'jpg'
      };

      resolve({
        data: newDataUrl.split(',')[1],
        mimeType: outputMimeType,
        ext: extMap[outputMimeType] || 'bin'
      });
    };

    img.onerror = () => {
      resolve({
        data: base64Data,
        mimeType,
        ext: mimeType.split('/')[1] || 'bin'
      });
    };
  });
}
