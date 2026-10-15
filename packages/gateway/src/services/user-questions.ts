import { uuidv7 } from "../db/uuidv7.js";

export interface UserQuestionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface UserQuestion {
  id: string;
  header: string;
  question: string;
  multiSelect?: boolean;
  options?: UserQuestionOption[];
  allowFreeformInput?: boolean;
}

export interface UserQuestionAnswer {
  selected: string[];
  freeText: string | null;
  skipped: boolean;
}

export interface UserQuestionRequest {
  id: string;
  sessionId: string;
  userId: string | null;
  requestedBy: string | null;
  title: string;
  attention: "normal" | "urgent";
  questions: UserQuestion[];
  createdAt: string;
  expiresAt: null;
  status: "pending" | "submitted" | "cancelled";
}

export interface UserQuestionResult {
  answers: Record<string, UserQuestionAnswer>;
}

interface PendingUserQuestion {
  request: UserQuestionRequest;
  resolve: (value: UserQuestionResult | null) => void;
}

export interface UserQuestionServiceOptions {
  onRequest?: (request: UserQuestionRequest) => void;
  onResolved?: (request: UserQuestionRequest) => void;
}

export class UserQuestionService {
  private readonly pending = new Map<string, PendingUserQuestion>();
  private readonly onRequest?: (request: UserQuestionRequest) => void;
  private readonly onResolved?: (request: UserQuestionRequest) => void;

  constructor(options: UserQuestionServiceOptions = {}) {
    this.onRequest = options.onRequest;
    this.onResolved = options.onResolved;
  }

  ask(input: {
    sessionId: string;
    userId?: string | null;
    requestedBy?: string | null;
    title?: string;
    attention?: "normal" | "urgent";
    questions: UserQuestion[];
  }): Promise<UserQuestionResult | null> {
    const now = new Date();
    const request: UserQuestionRequest = {
      id: uuidv7(),
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      requestedBy: input.requestedBy ?? null,
      title: input.title?.trim() || "Input requested",
      attention: input.attention === "urgent" ? "urgent" : "normal",
      questions: input.questions,
      createdAt: now.toISOString(),
      expiresAt: null,
      status: "pending",
    };

    return new Promise((resolve) => {
      this.pending.set(request.id, { request, resolve });
      this.onRequest?.(request);
    });
  }

  listPending(sessionId?: string, userId?: string | null): UserQuestionRequest[] {
    return [...this.pending.values()]
      .map((entry) => entry.request)
      .filter((request) => {
        if (sessionId && request.sessionId !== sessionId) return false;
        if (userId && request.userId && request.userId !== userId) return false;
        return true;
      });
  }

  submit(requestId: string, result: UserQuestionResult, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && entry.request.userId !== (userId ?? null)) return false;
    this.resolveRequest(requestId, result, "submitted");
    return true;
  }

  cancel(requestId: string, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && entry.request.userId !== (userId ?? null)) return false;
    this.resolveRequest(requestId, null, "cancelled");
    return true;
  }

  private resolveRequest(
    requestId: string,
    result: UserQuestionResult | null,
    status: UserQuestionRequest["status"],
  ): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    const request = { ...entry.request, status };
    entry.resolve(result);
    this.onResolved?.(request);
  }
}
