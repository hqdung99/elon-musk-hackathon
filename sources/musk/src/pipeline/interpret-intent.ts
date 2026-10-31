import { intentSchema } from "../domain/schemas";
import type { ShoppingIntent } from "../domain/schemas";
import type { PipelineDependencies } from "./types";

export async function interpretIntent(
  messages: string[],
  { ai, signal }: PipelineDependencies,
): Promise<ShoppingIntent> {
  const intent = intentSchema.parse(await ai.interpretIntent(messages, signal));
  if (
    intent.quantity === null &&
    !intent.questions_for_user.some((question) => /số lượng/i.test(question))
  )
    intent.questions_for_user.push("Bạn muốn mua số lượng bao nhiêu?");
  if (!intent.delivery_area) intent.questions_for_user.push("Bạn muốn giao hàng tại khu vực nào?");
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

  return intent;
}
