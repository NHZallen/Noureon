// Run when the image is built: fetches the Whisper model (the bigger size, `small`, about 250 MB; the smaller one is fetched the first time it is asked for) into the image (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3), so that the first piece of sound does not wait for 80 MB.
// A machine that cannot reach Hugging Face at build time still builds: the model is then fetched the first time it is used.
try {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = process.env.WHISPER_CACHE_DIR || '/app/.whisper';
  await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', { dtype: 'q8', device: 'cpu' });
  console.log('The Whisper model is in the image.');
} catch (error) {
  console.log(`The Whisper model was not fetched at build time (${error?.message || error}); it is fetched when it is first used.`);
}
