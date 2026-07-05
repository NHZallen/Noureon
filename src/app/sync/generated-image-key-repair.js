function collectGeneratedImages(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (value.generatedImage?.id) output.push(value.generatedImage);
  for (const child of Object.values(value)) collectGeneratedImages(child, output);
  return output;
}

export async function repairGeneratedImageStorageKeys({ value, storage, username } = {}) {
  if (!value || !storage || !username) return false;
  let changed = false;
  for (const descriptor of collectGeneratedImages(value)) {
    const expectedKey = `generatedImage:${username}:${descriptor.id}`;
    if (descriptor.storageKey === expectedKey) continue;
    let blob = await storage.getItem(expectedKey);
    if (blob == null && descriptor.storageKey) {
      blob = await storage.getItem(descriptor.storageKey);
      if (blob != null) await storage.setItem(expectedKey, blob);
    }
    if (blob != null) {
      descriptor.storageKey = expectedKey;
      changed = true;
    }
  }
  return changed;
}
