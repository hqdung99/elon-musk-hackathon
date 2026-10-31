import { useEffect, useState } from "react";
import type { Activity } from "../../providers/activity";

const recentLimit = 4;
// The OpenAI client times out at 60s; past this point a single call is worth explaining.
const slowCallMs = 10_000;

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;

  return `${Math.floor(seconds / 60)}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
}

export function ActivityLog({ stage, activities }: { stage: string; activities: Activity[] }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);

    return () => clearInterval(timer);
  }, []);

  const running = activities.filter((activity) => activity.status === "running");
  const finished = activities.filter((activity) => activity.status !== "running");
  const visible = [...finished.slice(-recentLimit), ...running];
  const slowAI = running.some(
    (activity) => activity.source === "ai" && now - activity.started_at > slowCallMs,
  );

  return (
    <div className="activity-log">
      <b>
        {stage}
        <span className="activity-elapsed" aria-hidden="true">
          {formatDuration(now - startedAt)}
        </span>
      </b>
      <span>
        {slowAI
          ? "Mô hình AI đang suy luận; mỗi lượt gọi có thể mất tới 60 giây. Bạn có thể dừng bất cứ lúc nào."
          : running.length > 1
            ? `Đang chạy song song ${running.length} việc.`
            : finished.length
              ? `Đã xong ${finished.length} bước.`
              : "Musk đang bắt đầu xử lý yêu cầu."}
      </span>
      {visible.length > 0 && (
        <ol className="activity-list">
          {visible.map((activity) => (
            <li key={activity.id} className={`activity ${activity.status}`}>
              <span className="activity-icon" aria-hidden="true">
                {activity.status === "running" ? "" : activity.status === "done" ? "✓" : "!"}
              </span>
              <span className="activity-text">
                {activity.label}
                {activity.detail && <small>{activity.detail}</small>}
              </span>
              <span className="activity-time" aria-hidden="true">
                {formatDuration((activity.ended_at ?? now) - activity.started_at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
