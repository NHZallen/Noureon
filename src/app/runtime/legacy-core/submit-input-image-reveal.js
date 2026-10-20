// The generated picture taking the place of its waiting frame (part of submit-input-council-lifecycle.js): the frame grows to the
// picture's shape, then the message with the picture replaces it and fades in.

export function revealGeneratedImage({ finalAiMessage, conversation: conv, loadingMessageDiv, addMessageToUI, requestAnimationFrame }) {
  const finalMessageElement = addMessageToUI(finalAiMessage, conv.messages.length - 1, false, false, { conversation: conv });
  finalMessageElement.classList.add('generated-image-result-enter');
  finalMessageElement.hidden = true;
  const revealFinalImage = () => {
    finalMessageElement.hidden = false;
    requestAnimationFrame(() => {
      finalMessageElement.classList.add('generated-image-result-visible');
    });
  };
  const replaceLoadingWithFinal = () => {
    if (loadingMessageDiv?.isConnected) {
      loadingMessageDiv.replaceWith(finalMessageElement);
    } else {
      loadingMessageDiv?.remove();
    }
    revealFinalImage();
  };
  const skeleton = loadingMessageDiv?.querySelector?.('.generated-image-skeleton');
  const finalCard = finalMessageElement.querySelector?.('.generated-image-card');
  const targetAspectRatio = finalCard?.style?.aspectRatio;
  const parseAspectRatio = (value) => {
    const parts = String(value || '').split('/').map(part => Number(part.trim()));
    return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 0;
  };
  if (loadingMessageDiv?.isConnected && skeleton && targetAspectRatio) {
    const ratio = parseAspectRatio(targetAspectRatio);
    const currentRect = skeleton.getBoundingClientRect?.();
    loadingMessageDiv.classList.add('generated-image-stage-morphing');
    skeleton.classList.add('generated-image-skeleton-finalizing');
    if (ratio && currentRect?.width && currentRect?.height) {
      const viewportHeight = Number(globalThis.innerHeight) || currentRect.height;
      const maxTargetHeight = Math.max(180, viewportHeight * .72);
      let targetWidth = currentRect.width;
      let targetHeight = targetWidth / ratio;
      if (targetHeight > maxTargetHeight) {
        targetHeight = maxTargetHeight;
        targetWidth = targetHeight * ratio;
      }
      skeleton.style.width = `${currentRect.width}px`;
      skeleton.style.height = `${currentRect.height}px`;
      skeleton.style.minHeight = '0px';
      skeleton.style.maxHeight = 'none';
      skeleton.style.aspectRatio = targetAspectRatio;
      const animateToFinalFrame = () => {
        skeleton.style.width = `${targetWidth}px`;
        skeleton.style.height = `${targetHeight}px`;
        skeleton.style.aspectRatio = targetAspectRatio;
      };
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(animateToFinalFrame));
      } else {
        globalThis.setTimeout(animateToFinalFrame, 0);
      }
      globalThis.setTimeout(replaceLoadingWithFinal, 560);
    } else {
      skeleton.style.aspectRatio = targetAspectRatio;
      globalThis.setTimeout(replaceLoadingWithFinal, 460);
    }
  } else {
    replaceLoadingWithFinal();
  }
}
