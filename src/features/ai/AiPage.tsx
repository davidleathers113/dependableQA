import * as React from "react";

interface Props {
  organizationId: string;
}

interface AssistantMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  references?: string[];
}

const starterPrompts = [
  "Summarize compliance risk for this month.",
  "Which publisher should I inspect first?",
  "Show me import health.",
  "How is the wallet balance looking?",
];

export default function AiPage({ organizationId }: Props) {
  const [question, setQuestion] = React.useState("");
  const [messages, setMessages] = React.useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask about compliance risk, import health, wallet balance, review throughput, or publisher performance. Answers are scoped to your current organization data.",
      references: [`Organization ${organizationId}`],
    },
  ]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  async function submitQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmedQuestion,
      },
    ]);

    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        references?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to answer this question.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer ?? "No answer returned.",
          references: payload.references ?? [],
        },
      ]);
      setQuestion("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to answer this question.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex h-[calc(100vh-160px)] flex-col space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Ask AI</h1>
        <p className="text-sm text-slate-400">
          Narrow operational assistant backed by live organization metrics, imports, reviews, and flag data.
        </p>
      </header>

      <div className="flex flex-1 flex-col space-y-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl border px-4 py-3 ${
                  message.role === "assistant"
                    ? "border-slate-700 bg-slate-800 text-slate-200"
                    : "border-violet-500/20 bg-violet-600/10 text-violet-100"
                }`}
              >
                <p className="text-sm leading-6">{message.content}</p>
                {message.references && message.references.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.references.map((reference) => (
                      <span
                        key={reference}
                        className="rounded-full border border-slate-600 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400"
                      >
                        {reference}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300">
              Thinking through the latest organization data...
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => submitQuestion(prompt)}
                disabled={isLoading}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-white disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion(question);
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-700 bg-slate-950 pl-4 pr-24 text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500"
              placeholder="Ask about flags, imports, publishers, reviews, or billing..."
            />
            <button
              type="submit"
              disabled={isLoading || question.trim().length === 0}
              className="absolute right-3 top-2.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
