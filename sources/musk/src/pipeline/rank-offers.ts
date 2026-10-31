import { fieldValue } from "../domain/requirements";
import { rankingSchema } from "../domain/schemas";
import type { FieldPath, OfferProfile, RankingResults, ShoppingIntent } from "../domain/schemas";
import type { PipelineDependencies } from "./types";

function isKnown(profile: OfferProfile, path: FieldPath): boolean {
  return (
    fieldValue(profile, path) !== null &&
    profile.sources.some((source) => source.field_path === path)
  );
}

export function validateRanking(
  ranking: RankingResults,
  candidates: OfferProfile[],
  intent: ShoppingIntent,
): void {
  const rows = ranking.ranked_offers;
  const ids = new Set(rows.map((row) => row.offer_id));
  if (
    rows.length !== candidates.length ||
    ids.size !== candidates.length ||
    candidates.some((profile) => !ids.has(profile.offer_id)) ||
    rows.some((row, index) => row.rank !== index + 1)
  )
    throw new Error("AI xếp hạng sai offer hoặc thứ tự. Phải xếp mỗi offer ứng viên đúng một lần.");
  for (const row of rows) {
    const profile = candidates.find((item) => item.offer_id === row.offer_id);
    if (!profile) throw new Error("Không tìm thấy offer trong nhóm ứng viên.");
    if (
      profile.missing_fields.some((path) => !row.missing_fields.includes(path)) ||
      row.missing_fields.some((path) => !profile.missing_fields.includes(path))
    )
      throw new Error("AI không giữ đúng các trường còn thiếu.");
    if (
      intent.preferences.some(
        (preference) => preference.field_path !== null && isKnown(profile, preference.field_path),
      ) &&
      !row.preference_reasons.length
    )
      throw new Error("AI chưa giải thích xếp hạng theo sở thích người mua.");
    for (const reason of row.preference_reasons) {
      const preference = intent.preferences.find(
        (item) => item.preference_id === reason.preference_id,
      );
      if (
        !preference ||
        (preference.field_path !== null &&
          !reason.profile_field_paths.includes(preference.field_path)) ||
        reason.profile_field_paths.length === 0 ||
        reason.profile_field_paths.some((path) => !isKnown(profile, path))
      )
        throw new Error("Lý do xếp hạng không có sở thích hoặc bằng chứng phù hợp.");
    }
  }
}

export async function rankOffers(
  intent: ShoppingIntent,
  candidates: OfferProfile[],
  { ai, signal }: PipelineDependencies,
): Promise<RankingResults> {
  const ranking = rankingSchema.parse(
    candidates.length ? await ai.rankOffers(intent, candidates, signal) : { ranked_offers: [] },
  );
  validateRanking(ranking, candidates, intent);
  const preference = intent.preferences[0];
  const path = preference?.field_path;
  if (
    intent.preferences.length !== 1 ||
    (path !== "quote.total" && path !== "quote.unit_price_per_100ml") ||
    (preference.direction !== "lower" && preference.direction !== "higher")
  )
    return ranking;

  const priced = ranking.ranked_offers.flatMap((row) => {
    const profile = candidates.find((candidate) => candidate.offer_id === row.offer_id);
    const total =
      path === "quote.unit_price_per_100ml"
        ? profile?.quote.unit_price_per_100ml
        : profile?.quote.total;

    return profile && total && isKnown(profile, path)
      ? [{ row, total, estimated: profile.quote.total_estimated }]
      : [];
  });
  if (
    priced.length !== candidates.length ||
    new Set(priced.map(({ total }) => total.currency)).size !== 1
  )
    return ranking;

  const direction = preference.direction === "lower" ? 1 : -1;

  return {
    ranked_offers: priced
      .sort((a, b) => direction * (a.total.amount_minor - b.total.amount_minor))
      .map(({ row, total, estimated }, index) => ({
        ...row,
        rank: index + 1,
        preference_reasons: [
          {
            preference_id: preference.preference_id,
            profile_field_paths: [path],
            reason: `${path === "quote.unit_price_per_100ml" ? "Chi phí làm tròn trên 100ml" : "Tổng"} ${estimated ? "ước tính" : "báo giá"} ${total.amount_minor.toLocaleString("vi-VN")} ${total.currency}; xếp ${direction === 1 ? "thấp" : "cao"} trước theo ưu tiên của bạn.`,
          },
        ],
      })),
  };
}
