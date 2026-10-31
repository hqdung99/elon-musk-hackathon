import type { ShoppingIntent } from "../domain/schemas";

export function IntentSummary({ intent }: { intent: ShoppingIntent | null }) {
  return (
    <section className="intent-panel">
      <div className="eyebrow">BẢN TÓM TẮT</div>
      <h2>Yêu cầu của bạn</h2>
      <p className="muted small">Luôn theo ý bạn. Không tự thêm điều kiện.</p>
      {intent ? (
        <>
          <dl className="intent-facts">
            <div>
              <dt>Sản phẩm</dt>
              <dd>{intent.product_description}</dd>
            </div>
            <div>
              <dt>Số lượng</dt>
              <dd>{intent.quantity ?? "Chưa xác nhận"}</dd>
            </div>
            <div>
              <dt>Giao đến</dt>
              <dd>{intent.delivery_area ?? "Chưa xác nhận"}</dd>
            </div>
          </dl>
          <h3>Điều kiện bắt buộc</h3>
          {intent.requirements.length ? (
            <ul className="summary-list">
              {intent.requirements.map((requirement) => (
                <li key={requirement.requirement_id}>
                  <span className={requirement.field_path ? "check-mark" : "preference-mark"}>
                    {requirement.field_path ? "✓" : "?"}
                  </span>
                  {requirement.user_text}
                  {!requirement.field_path && " · Chưa hỗ trợ xác minh"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Chưa có điều kiện cụ thể.</p>
          )}
          <h3>Ưu tiên</h3>
          <ul className="summary-list">
            {intent.preferences.map((preference) => (
              <li key={preference.preference_id}>
                <span className="preference-mark">◇</span>
                {preference.user_text}
              </li>
            ))}
          </ul>
          {intent.questions_for_user.length > 0 && (
            <p className="callout warning">Còn thông tin cần bạn làm rõ trong chat.</p>
          )}
        </>
      ) : (
        <div className="empty-intent">
          <span>◇</span>
          <p>
            Chia sẻ điều bạn cần.
            <br />
            Musk sẽ ghi lại ở đây.
          </p>
        </div>
      )}
    </section>
  );
}
