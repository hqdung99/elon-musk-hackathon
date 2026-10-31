import { intentSchema } from "../domain/schemas";
import type { ShoppingIntent } from "../domain/schemas";
import { cleanReplies } from "./suggested-replies";
import type { PipelineDependencies } from "./types";

export async function interpretIntent(
  messages: string[],
  { ai, signal }: PipelineDependencies,
): Promise<ShoppingIntent> {
  const intent = intentSchema.parse(await ai.interpretIntent(messages, signal));
  if (intent.shopping_goal?.mode === "discover_brands" && intent.shopping_goal.requested_brand)
    throw new Error("Yêu cầu đã chọn thương hiệu không được tự chuyển sang khám phá thương hiệu.");
  // Remove the obsolete generic blocker if it survived in active intent.
  intent.questions_for_user = intent.questions_for_user.filter(
    (question) =>
      question.trim() !== "Có yêu cầu chưa thể kiểm tra; vui lòng làm rõ hoặc sửa yêu cầu đó.",
  );
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

  for (const requirement of intent.requirements) {
    // A null path means the app cannot verify the field. Rephrasing cannot
    // supply a capability; retain this requirement for unknown checks instead.
    if (requirement.field_path && (!requirement.operator || requirement.value === null))
      intent.questions_for_user.push(
        `Bạn làm rõ điều kiện “${requirement.user_text}”: giá trị hoặc giới hạn cụ thể là gì?`,
      );
  }

  intent.questions_for_user = [...new Set(intent.questions_for_user)];
  intent.suggested_replies = intent.questions_for_user.length
    ? cleanReplies(intent.suggested_replies, replies)
    : [];

  return intent;
}
