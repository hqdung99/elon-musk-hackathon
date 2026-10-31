import { useEffect, useReducer, useRef, useState } from "react";
import { IntentSummary } from "./components/requirements";
import { OfferResults, formatMoney } from "./components/offers/OfferResults";
import { VariantSelection } from "./components/offers/VariantSelection";
import { Settings } from "./components/chat/Settings";
import type { SettingsValue } from "./components/chat/Settings";
import type { OfferProfile, PipelineResult, Stage } from "./domain/schemas";
import { createOpenAI, defaultOpenAIConfig, demoAI, readLocalConfig } from "./providers/ai";
import { createFixtureMarketplace } from "./providers/fixtures";
import { shopeeAdapter } from "./providers/marketplace";
import { CartCleanupError } from "./providers/shopee-cart";
import { fixtureCheckout, shopeeCheckout } from "./providers/checkout";
import { approveAndRevalidate, completeSelection, runWithIntent } from "./pipeline/orchestrator";
import { interpretTurn, intentMessages, canReuseProfiles } from "./pipeline/interpret-turn";
import type { TurnContext } from "./pipeline/interpret-turn";
import { interpretIntent } from "./pipeline/interpret-intent";
import { rankOffers } from "./pipeline/rank-offers";
import { filterOffers } from "./pipeline/filter-offers";
import { recommendOffers } from "./pipeline/recommend-offers";
import type { VariantChoices } from "./pipeline/types";
import { initialState, reducer } from "./state";

const example =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 19 triệu VND, giao tại TP.HCM. Bảo hành tối thiểu 12 tháng. Ưu tiên giá rẻ.";
const stages: Record<Stage | "idle" | "done" | "blocked", string> = {
  idle: "Sẵn sàng lắng nghe",
  clarifying: "Hiểu nhu cầu của bạn",
  planning: "Lên kế hoạch tìm kiếm",
  searching: "Tìm các lựa chọn",
  profiling: "Thu thập bằng chứng",
  filtering: "Kiểm tra điều kiện",
  ranking: "So sánh theo ưu tiên",
  recommending: "Chuẩn bị đề xuất",
  revalidating: "Kiểm tra lại giá & điều kiện",
  done: "Đã dừng an toàn",
  blocked: "Cần xử lý trước khi tiếp tục",
};
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsValue>({
    aiMode: "openai",
    dataMode: "shopee",
    scenario: "unchanged",
    openai: defaultOpenAIConfig,
  });
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const userTexts = useRef<string[]>([]);
  const shopping = useRef<TurnContext>({ intent: null, result: null });
  const freshData = useRef(false);
  const feedEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    readLocalConfig()
      .then((config) => {
        if (active)
          setSettings((current) => ({ ...current, openai: { ...current.openai, ...config } }));
      })
      .catch(() => {
        if (active)
          dispatch({
            type: "message",
            message: {
              id: crypto.randomUUID(),
              kind: "error",
              text: "Không đọc được cấu hình local. Kiểm tra cấu hình OpenAI local rồi khởi động lại Vite.",
            },
          });
      });

    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages, state.stage]);
  useEffect(() => {
    if (!settingsOpen) return;
    const previous = document.activeElement;
    const element = dialogRef.current;
    const focusable = () =>
      element?.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']");
    focusable()?.[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [settingsOpen]);

  function message(
    kind: "assistant" | "error" | "user",
    text: string,
    id?: number,
    checkoutUrl?: string,
  ) {
    dispatch({
      type: "message",
      runId: id,
      message: { id: crypto.randomUUID(), kind, text, checkoutUrl },
    });
  }

  function nextRun() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++runId.current;

    return { id, signal: abort.signal };
  }

  function errorText(error: unknown) {
    const raw = error instanceof Error ? error.message : "Có lỗi không xác định.";
    const safe = settings.openai.apiKey
      ? raw.split(settings.openai.apiKey).join("[key đã ẩn]")
      : raw;

    return `${safe}\nKhông tự đổi sang dữ liệu demo.`;
  }

  async function dependencies(signal: AbortSignal, id: number, revalidating = false) {
    return {
      ai: settings.aiMode === "openai" ? await createOpenAI(settings.openai) : demoAI,
      marketplace:
        settings.dataMode === "fixture"
          ? createFixtureMarketplace(settings.scenario, revalidating || freshData.current)
          : shopeeAdapter,
      signal,
      progress: (stage: Stage) => dispatch({ type: "progress", runId: id, stage }),
    };
  }

  async function search(texts: string[], newTurn?: string) {
    const pendingSelection = state.pendingSelection;
    const { id, signal } = nextRun();
    dispatch({ type: "start", runId: id });
    try {
      const deps = await dependencies(signal, id);
      signal.throwIfAborted();
      const context = shopping.current;
      const decision = newTurn ? await interpretTurn(newTurn, context, deps.ai, signal) : null;
      if (signal.aborted || id !== runId.current) return;
      if (
        decision &&
        ["clarify", "ask_results", "request_approval", "decline"].includes(decision.action)
      ) {
        const answer =
          decision.action === "ask_results"
            ? await deps.ai.answerResults(newTurn!, context, signal)
            : decision.action === "request_approval"
              ? "Chọn offer rồi nhấn Duyệt & kiểm tra lại để xác nhận đúng SKU và điều kiện. Musk không duyệt bằng tin nhắn."
              : decision.action === "decline"
                ? "Đã dừng yêu cầu mua sắm."
                : decision.question!;
        if (signal.aborted || id !== runId.current) return;
        message("assistant", answer, id);
        if (decision.action === "decline") {
          shopping.current = { intent: null, result: null };
          userTexts.current = [];
          dispatch({ type: "stop", runId: id, stage: "done" });
        } else if (pendingSelection) {
          dispatch({ type: "selection", runId: id, prepared: pendingSelection });
        } else if (context.result) {
          dispatch({ type: "result", runId: id, result: context.result });
        } else if (context.intent) {
          dispatch({ type: "clarification", runId: id, intent: context.intent });
        } else dispatch({ type: "stop", runId: id, stage: "idle" });

        return;
      }

      const inputs = decision ? intentMessages(newTurn!, context.intent, decision) : texts;
      userTexts.current = inputs;
      if (decision?.action === "new_product") {
        shopping.current = { intent: null, result: null };
        freshData.current = false;
        dispatch({ type: "clearIntent", runId: id });
      }

      const intent = await interpretIntent(inputs, deps);
      if (signal.aborted || id !== runId.current) return;
      shopping.current = { intent, result: null };
      if (
        decision?.action === "revise_preferences" &&
        context.result &&
        canReuseProfiles(context.result.intent, intent)
      ) {
        dispatch({ type: "progress", runId: id, stage: "ranking" });
        const { filters, candidates } = filterOffers(context.result.profiles, intent);
        const ranking = await rankOffers(intent, candidates, deps);
        const result = {
          ...context.result,
          intent,
          filters,
          ranking,
          recommendation: recommendOffers(
            intent,
            context.result.profiles,
            ranking,
            deps,
            context.result.search_review.truncated,
            filters,
          ),
        };
        if (signal.aborted || id !== runId.current) return;
        shopping.current = { intent, result };
        dispatch({ type: "result", runId: id, result });

        return;
      }

      const output = await runWithIntent(intent, deps);
      if (signal.aborted || id !== runId.current) return;
      if (output.status === "clarification") {
        dispatch({ type: "clarification", runId: id, intent: output.intent });
        message(
          "assistant",
          `Để chọn đúng, Musk cần làm rõ:\n${output.intent.questions_for_user.map((question) => `• ${question}`).join("\n")}`,
          id,
        );
      } else if (output.status === "selection") {
        dispatch({ type: "selection", runId: id, prepared: output });
      } else {
        shopping.current = { intent: output.result.intent, result: output.result };
        dispatch({ type: "result", runId: id, result: output.result });
      }
    } catch (error) {
      if (error instanceof CartCleanupError && (signal.aborted || id !== runId.current)) {
        message("error", errorText(error));

        return;
      }

      if (signal.aborted || id !== runId.current) return;
      message("error", errorText(error), id);
      dispatch({ type: "stop", runId: id, stage: "blocked" });
    }
  }

  async function selectVariants(choices: VariantChoices) {
    const prepared = state.pendingSelection;
    if (!prepared || state.busy) return;
    const { id, signal } = nextRun();
    dispatch({ type: "start", runId: id });
    dispatch({ type: "progress", runId: id, stage: "profiling" });
    try {
      const deps = await dependencies(signal, id);
      signal.throwIfAborted();
      const result = await completeSelection(prepared, choices, deps);
      if (signal.aborted || id !== runId.current) return;
      shopping.current = { intent: result.intent, result };
      dispatch({ type: "result", runId: id, result });
    } catch (error) {
      if (error instanceof CartCleanupError && (signal.aborted || id !== runId.current)) {
        message("error", errorText(error));

        return;
      }

      if (signal.aborted || id !== runId.current) return;
      message("error", errorText(error), id);
      if (error instanceof CartCleanupError)
        dispatch({ type: "stop", runId: id, stage: "blocked" });
      else dispatch({ type: "selection", runId: id, prepared });
    }
  }

  function submit(text = input) {
    if (!text.trim()) return;
    const value = text.trim();
    message("user", value);
    setInput("");
    void search([], value);
  }

  function reset() {
    const { id } = nextRun();
    userTexts.current = [];
    shopping.current = { intent: null, result: null };
    freshData.current = false;
    setInput("");
    dispatch({ type: "reset", runId: id });
  }

  async function approve(profile: OfferProfile, result: PipelineResult, expectedRunId: number) {
    if (expectedRunId !== runId.current || state.busy || state.stage === "done") return;
    const { id, signal } = nextRun();
    dispatch({ type: "start", runId: id });
    message(
      "user",
      `Duyệt ${profile.seller.name} · ${profile.quote.quantity} máy · ${formatMoney(profile.quote.total)} và các điều kiện hiển thị.`,
      id,
    );
    try {
      const deps = await dependencies(signal, id, true);
      signal.throwIfAborted();
      const handoff = await approveAndRevalidate(
        id,
        profile,
        result.intent,
        deps,
        settings.dataMode === "fixture" ? fixtureCheckout : shopeeCheckout,
      );
      if (signal.aborted || id !== runId.current) return;
      if (
        handoff.validation.status !== "ready" &&
        handoff.validation.status !== "ready_with_unknowns"
      ) {
        message(
          "assistant",
          `Đã dừng: ${handoff.validation.status === "changed" ? "điều kiện đã thay đổi" : handoff.validation.status === "requirements_not_met" ? "offer không còn đạt yêu cầu" : "phê duyệt không còn hiệu lực"}.\n` +
            `Giá mới: ${formatMoney(handoff.fresh.quote.total)}.\n` +
            `Thay đổi: ${handoff.validation.changed_fields.join(", ") || "không có"}.\n` +
            "Musk sẽ đánh giá lại. Chỉ tiếp tục khi bạn duyệt đề xuất mới.",
          id,
        );
        freshData.current = true;
        await search([...userTexts.current]);
      } else {
        const unverified = handoff.validation.requirement_checks.checks
          .filter((check) => check.result === "unknown")
          .map(
            (check) =>
              result.intent.requirements.find(
                (requirement) => requirement.requirement_id === check.requirement_id,
              )?.user_text ?? check.requirement_id,
          );
        const warning =
          handoff.validation.status === "ready_with_unknowns"
            ? `Lưu ý: vẫn tiếp tục nhưng còn thông tin chưa rõ, hãy tự kiểm tra trên Shopee trước khi đặt.\n` +
              (handoff.validation.became_unknown_fields.length
                ? `Đã biết lúc duyệt nhưng nay không xác nhận được: ${handoff.validation.became_unknown_fields.join(", ")}.\n`
                : "") +
              (unverified.length ? `Điều kiện chưa xác minh: ${unverified.join("; ")}.\n` : "") +
              (handoff.validation.unknown_fields.length
                ? `Chưa rõ: ${handoff.validation.unknown_fields.join(", ")}.\n`
                : "")
            : "";
        message(
          "assistant",
          "Đã kiểm tra lại giá, tồn kho và các điều kiện đã biết.\n" +
            warning +
            (handoff.navigation?.status === "not_implemented"
              ? "Chưa hỗ trợ mở checkout Shopee. Đã dừng tại bước chuyển sang Shopee; không mở checkout, không đặt hàng hay thanh toán."
              : (handoff.navigation?.message ?? "Không có kết quả điều hướng.")),
          id,
          handoff.navigation?.status === "ready"
            ? (handoff.navigation.checkout_url ?? undefined)
            : undefined,
        );
        dispatch({
          type: "stop",
          runId: id,
          stage: handoff.navigation?.status === "not_implemented" ? "blocked" : "done",
        });
      }
    } catch (error) {
      if (error instanceof CartCleanupError && (signal.aborted || id !== runId.current)) {
        message("error", errorText(error));

        return;
      }

      if (signal.aborted || id !== runId.current) return;
      message("error", errorText(error), id);
      dispatch({ type: "stop", runId: id, stage: "blocked" });
    }
  }

  function decline() {
    const { id } = nextRun();
    shopping.current = { intent: null, result: null };
    userTexts.current = [];
    message("user", "Không tiếp tục thanh toán.", id);
    message(
      "assistant",
      "Đã dừng. Không mở checkout, không đặt hàng. Bạn có thể gửi yêu cầu mới bất kỳ lúc nào.",
      id,
    );
    dispatch({ type: "stop", runId: id, stage: "done" });
  }

  const activeResult = state.messages.some(
    (item) => item.kind === "result" && item.runId === state.runId,
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            reset();
          }}
          aria-label="Musk - bắt đầu lại"
        >
          <span className="brand-symbol">
            m<span>✦</span>
          </span>
          <span className="brand-word">
            musk<span>MUA ĐÚNG. CHỌN ĐÁNG.</span>
          </span>
        </a>
        <div className="header-middle">
          <span className="live-dot" />
          Trợ lý mua sắm của bạn
        </div>
        <nav className="header-actions" aria-label="Công cụ">
          <button className="button text-button" onClick={reset}>
            ＋ Cuộc trò chuyện mới
          </button>
          <button
            className="button secondary settings-button"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙ Cấu hình
          </button>
        </nav>
      </header>
      <div className="workspace">
        <main className="chat-pane">
          <div className="mode-banner">
            <span className="badge green">LOCAL MVP</span>
            <span>
              {settings.dataMode === "fixture" ? "Dữ liệu giả lập" : "Shopee API"} ·{" "}
              {settings.aiMode === "demo" ? "AI demo, không gọi mô hình" : "OpenAI"}
            </span>
            <button onClick={() => setSettingsOpen(true)}>Đổi chế độ ↗</button>
          </div>
          <details className="mobile-intent">
            <summary>Yêu cầu của bạn · {state.intent?.product_description ?? "Chưa có"}</summary>
            <IntentSummary intent={state.intent} />
          </details>
          <div className="feed" role="log" aria-label="Hội thoại mua sắm">
            <div className="feed-column">
              {state.messages.length === 0 && (
                <section className="welcome">
                  <div className="welcome-emblem">✦</div>
                  <div className="eyebrow">MUA SẮM CÓ CƠ SỞ</div>
                  <h1>
                    Món bạn cần.
                    <br />
                    <span>Lựa chọn xứng đáng.</span>
                  </h1>
                  <p>
                    Không chỉ tìm giá thấp. Musk so sánh người bán,
                    <br className="desktop-break" /> bằng chứng và điều kiện — theo đúng nhu cầu của
                    bạn.
                  </p>
                  <div className="welcome-prompt">
                    <span>01 — BẮT ĐẦU VỚI NHU CẦU CỦA BẠN</span>
                    <button className="example-card" onClick={() => submit(example)}>
                      <span className="example-icon">▯</span>
                      <span>
                        <b>Tìm iPhone 16 128GB</b>
                        <small>
                          1 máy · tổng dưới 19 triệu · giao TP.HCM
                          <br />
                          Bảo hành ≥ 12 tháng · ưu tiên giá rẻ
                        </small>
                      </span>
                      <span>↗</span>
                    </button>
                  </div>
                  <div className="welcome-values">
                    <span>✓ Có bằng chứng</span>
                    <span>✓ Rõ đánh đổi</span>
                    <span>✓ Bạn quyết định</span>
                  </div>
                  <p className="demo-hint">
                    Demo hỗ trợ kịch bản iPhone 16 128GB và câu trả lời có cấu trúc.
                    <br />
                    Chọn OpenAI trong Cấu hình để dùng AI diễn giải tự nhiên.
                  </p>
                </section>
              )}
              {state.messages.map((item) =>
                item.kind === "result" ? (
                  <OfferResults
                    key={item.id}
                    result={item.result}
                    active={item.runId === state.runId && !state.busy && state.stage !== "done"}
                    onApprove={(profile) => void approve(profile, item.result, item.runId)}
                    onDecline={decline}
                    onRevise={() => {
                      setInput("");
                      inputRef.current?.focus();
                    }}
                  />
                ) : (
                  <div key={item.id} className={`message ${item.kind}`}>
                    {item.kind !== "user" && <span className="message-avatar">✦</span>}
                    <div className="message-content">
                      {item.kind !== "user" && (
                        <span className="message-author">
                          {item.kind === "error" ? "Không thể tiếp tục" : "Musk"}
                        </span>
                      )}
                      <p>{item.text}</p>
                      {item.checkoutUrl && (
                        <a
                          className="button primary"
                          href={item.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Mở giỏ hàng Shopee ↗
                        </a>
                      )}
                    </div>
                  </div>
                ),
              )}
              {state.pendingSelection && (
                <VariantSelection
                  key={state.runId}
                  prepared={state.pendingSelection}
                  onContinue={(choices) => void selectVariants(choices)}
                />
              )}
              {state.busy && (
                <div className="progress-card" role="status">
                  <span className="spinner" />
                  <div>
                    <b>{stages[state.stage]}</b>
                    <span>
                      Musk đang làm rõ từng lựa chọn. Bạn có thể dừng hoặc gửi yêu cầu mới.
                    </span>
                  </div>
                  <button
                    className="button text-button"
                    onClick={() => {
                      const { id } = nextRun();
                      dispatch({ type: "stop", runId: id, stage: "idle" });
                      message(
                        "assistant",
                        "Đã hủy lượt xử lý. Kết quả cũ không thể dùng để duyệt.",
                        id,
                      );
                    }}
                  >
                    Dừng
                  </button>
                </div>
              )}
              {state.stage === "blocked" && (
                <button
                  className="button secondary retry-button"
                  onClick={() => void search([...userTexts.current])}
                >
                  Thử lại yêu cầu
                </button>
              )}
              <div ref={feedEnd} />
            </div>
          </div>
          <div className="composer-area">
            {activeResult && !state.busy && (
              <div className="quick-replies">
                <button onClick={() => submit("Ưu tiên giao nhanh.")}>Ưu tiên giao nhanh</button>
                <button onClick={() => submit("Chỉ mua Mall.")}>Chỉ mua Mall</button>
                <button onClick={() => submit("Tổng tối đa 18 triệu VND.")}>
                  Tổng tối đa 18 triệu
                </button>
              </div>
            )}
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <textarea
                ref={inputRef}
                aria-label="Nhắn cho Musk"
                placeholder="Bạn đang tìm món gì? Ngân sách và ưu tiên của bạn..."
                value={input}
                rows={2}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  ✦{" "}
                  {settings.aiMode === "demo"
                    ? "Bắt đầu bằng ví dụ để khám phá"
                    : "Được hỗ trợ bởi OpenAI"}
                </span>
                <button
                  type="submit"
                  className="send-button"
                  disabled={!input.trim()}
                  aria-label="Gửi tin nhắn"
                >
                  ↑
                </button>
              </div>
            </form>
            <p className="composer-note">
              Musk không đặt hàng thay bạn. Giá và bằng chứng demo không phải dữ liệu Shopee thực.
            </p>
          </div>
        </main>
        <aside className="sidebar">
          <IntentSummary intent={state.intent} />
        </aside>
      </div>
      {settingsOpen && (
        <div ref={dialogRef}>
          <Settings
            value={settings}
            onClose={() => setSettingsOpen(false)}
            onSave={(value) => {
              const { id } = nextRun();
              setSettings(value);
              setSettingsOpen(false);
              freshData.current = false;
              shopping.current = { ...shopping.current, result: null };
              dispatch({ type: "invalidate", runId: id });
              message(
                "assistant",
                "Đã đổi cấu hình. Các đề xuất cũ không còn dùng để duyệt; gửi yêu cầu hoặc thử lại để đánh giá mới.",
                id,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
