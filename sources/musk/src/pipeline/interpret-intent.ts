import { intentSchema } from "../domain/schemas";
import type { ShoppingIntent } from "../domain/schemas";
import { cleanReplies } from "./suggested-replies";
import type { PipelineDependencies } from "./types";

export async function interpretIntent(
  messages: string[],
  { ai, signal }: PipelineDependencies,
): Promise<ShoppingIntent> {
  const intent = intentSchema.parse(await ai.interpretIntent(messages, signal));
  const replies: string[] = [];
  if (
    intent.quantity === null &&
    !intent.questions_for_user.some((question) => /số lượng|mấy máy/i.test(question))
  )
    intent.questions_for_user.push("Bạn muốn mua số lượng bao nhiêu?");
  if (intent.quantity === null) replies.push("Mua 1 chiếc", "Mua 2 chiếc");
  if (!intent.delivery_area) {
    intent.questions_for_user.push("Bạn muốn giao hàng tại khu vực nào?");
    replies.push("Giao tại TP.HCM", "Giao tại Hà Nội");
  }

  if (
    intent.requirements.some(
      (requirement) =>
        !requirement.field_path || !requirement.operator || requirement.value === null,
    )
  )
    intent.questions_for_user.push(
      "Có yêu cầu chưa thể kiểm tra; vui lòng làm rõ hoặc sửa yêu cầu đó.",
    );
  intent.questions_for_user = [...new Set(intent.questions_for_user)];
  intent.suggested_replies = intent.questions_for_user.length
    ? cleanReplies(intent.suggested_replies, replies)
    : [];

  return intent;
}
