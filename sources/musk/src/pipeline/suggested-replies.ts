const replyLimit = 8;
const replyMaxLength = 80;

// Replies are only text the user can send or edit; they never trigger an action by themselves.
export function cleanReplies(...groups: (string[] | null | undefined)[]): string[] {
  const replies = groups
    .flatMap((group) => group ?? [])
    .map((reply) => reply.trim().replace(/\s+/g, " "))
    .filter((reply) => reply && reply.length <= replyMaxLength);

  return [...new Set(replies)].slice(0, replyLimit);
}
