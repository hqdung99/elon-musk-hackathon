import type { PipelineResult, ShoppingIntent, Stage } from "./domain/schemas";
import type { PreparedSearch } from "./pipeline/types";
import type { Activity } from "./providers/activity";

export type Message =
  | {
      id: string;
      kind: "user" | "assistant" | "error";
      text: string;
      checkoutUrl?: string;
      // Suggested answers to a clarification question, shown as chips while it is the latest message.
      suggestedReplies?: string[];
    }
  | { id: string; kind: "result"; runId: number; result: PipelineResult };

export interface State {
  runId: number;
  messages: Message[];
  intent: ShoppingIntent | null;
  stage: Stage | "idle" | "done" | "blocked";
  busy: boolean;
  pendingSelection: PreparedSearch | null;
  // AI and marketplace calls of the current run, so long waits show what Musk is doing.
  activities: Activity[];
}

export const initialState: State = {
  runId: 0,
  messages: [],
  intent: null,
  stage: "idle",
  busy: false,
  pendingSelection: null,
  activities: [],
};

export type Action =
  | { type: "start"; runId: number }
  | { type: "clearIntent"; runId: number }
  | { type: "message"; message: Message; runId?: number }
  | { type: "progress"; runId: number; stage: Stage }
  | { type: "activity"; runId: number; activity: Activity }
  | { type: "clarification"; runId: number; intent: ShoppingIntent }
  | { type: "selection"; runId: number; prepared: PreparedSearch }
  | { type: "result"; runId: number; result: PipelineResult }
  | { type: "stop"; runId: number; stage: "idle" | "done" | "blocked" }
  | { type: "invalidate"; runId: number }
  | { type: "reset"; runId: number };

export function reducer(state: State, action: Action): State {
  if ("runId" in action && action.runId !== undefined && action.runId < state.runId) return state;
  switch (action.type) {
    case "clearIntent":
      return { ...state, intent: null, pendingSelection: null };
    case "start":
      return {
        ...state,
        runId: action.runId,
        busy: true,
        stage: "clarifying",
        pendingSelection: null,
        activities: [],
      };
    case "message":
      return { ...state, messages: [...state.messages, action.message] };
    case "progress":
      return { ...state, stage: action.stage };
    case "activity": {
      if (action.runId !== state.runId) return state;
      const index = state.activities.findIndex((entry) => entry.id === action.activity.id);

      return {
        ...state,
        activities:
          index < 0
            ? [...state.activities, action.activity]
            : state.activities.map((entry, position) =>
                position === index ? action.activity : entry,
              ),
      };
    }

    case "clarification":
      return { ...state, intent: action.intent, busy: false, stage: "idle" };
    case "selection":
      return {
        ...state,
        intent: action.prepared.intent,
        pendingSelection: action.prepared,
        busy: false,
        stage: "idle",
      };
    case "result":
      return {
        ...state,
        intent: action.result.intent,
        stage: "idle",
        busy: false,
        pendingSelection: null,
        messages: [
          ...state.messages,
          {
            id: `result-${action.runId}`,
            kind: "result",
            runId: action.runId,
            result: action.result,
          },
        ],
      };
    case "stop":
      return {
        ...state,
        runId: action.runId,
        busy: false,
        stage: action.stage,
        pendingSelection: null,
      };
    case "invalidate":
      return {
        ...state,
        runId: action.runId,
        intent: null,
        busy: false,
        stage: "idle",
        pendingSelection: null,
      };
    case "reset":
      return { ...initialState, runId: action.runId };
  }
}
