export function getUserProfileLabel(user = {}) {
  return user?.displayName || user?.email || user?.username || 'User';
}

export function renderUserAvatar(avatarElement, user = {}) {
  if (!avatarElement) return;

  const label = getUserProfileLabel(user);
  if (typeof avatarElement.replaceChildren === 'function') {
    avatarElement.replaceChildren();
  } else {
    avatarElement.textContent = '';
    avatarElement.innerHTML = '';
  }

  if (
    user?.avatarUrl
    && typeof avatarElement.ownerDocument?.createElement === 'function'
    && typeof avatarElement.appendChild === 'function'
  ) {
    const img = avatarElement.ownerDocument.createElement('img');
    img.src = user.avatarUrl;
    img.alt = label;
    img.loading = 'lazy';
    img.className = 'w-full h-full object-cover rounded-full';
    avatarElement.appendChild(img);
    return;
  }

  avatarElement.textContent = label.trim().charAt(0).toUpperCase() || 'U';
}

export function renderUserProfileSummary({ usernameDisplay, avatarElement, user } = {}) {
  const label = getUserProfileLabel(user);
  if (usernameDisplay) {
    usernameDisplay.textContent = label;
  }
  renderUserAvatar(avatarElement, user);
  return label;
}
