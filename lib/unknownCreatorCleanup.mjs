// Identify the creator label that the Ava-Valt avatar cards will display.
// This is deliberately NOT a platform check: "Unknown" on the PC/Quest/iOS
// fields must never cause a record to be deleted.
const text = value => typeof value === 'string' ? value.trim() : '';
const first = (...values) => values.map(text).find(Boolean) || '';

export function displayedCreator(avatar) {
  const author = avatar?.author;
  // The imported database primarily uses `author` for the creator display.
  // An explicit "Unknown" in this field really appears as "by Unknown".
  if (typeof author === 'string' && text(author)) return text(author);
  if (author && typeof author === 'object') {
    const name = first(author.displayName, author.username, author.name);
    if (name) return name;
  }
  return first(
    avatar?.authorName, avatar?.creatorName,
    avatar?.creator?.displayName, avatar?.creator?.username, avatar?.creator?.name
  ) || 'Unknown';
}

export function isUnknownCreatorAvatar(avatar) {
  // Never delete miscellaneous/corrupt non-avatar entries just because they
  // have no creator property. Only known avatar-ID-shaped records qualify.
  const id = String(avatar?.id || '');
  return /^avtr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) &&
    /^unknown$/i.test(displayedCreator(avatar));
}

export function partitionUnknownCreators(avatars) {
  const keep = [], unknown = [];
  for (const avatar of avatars || []) {
    (isUnknownCreatorAvatar(avatar) ? unknown : keep).push(avatar);
  }
  return { keep, unknown };
}

export function unknownCreatorPreview(avatars, sampleSize = 15) {
  const { unknown } = partitionUnknownCreators(avatars);
  return {
    scanned: avatars.length,
    found: unknown.length,
    sample: unknown.slice(0, sampleSize).map(a => ({
      id: String(a?.id || ''),
      name: String(a?.name || 'Unnamed avatar').slice(0, 120),
      author: displayedCreator(a)
    }))
  };
}
