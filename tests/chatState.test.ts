import { normalizeChatState } from "../src/main";

test("drops a trailing unanswered user turn (interrupted mid-request)", () => {
  const state = normalizeChatState({
    conversations: [{
      id: "c1",
      title: "t",
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2 unanswered" }
      ],
      createdAt: 1,
      updatedAt: 2
    }],
    activeId: "c1"
  });
  expect(state.conversations[0].messages.map((m) => m.content)).toEqual(["q1", "a1"]);
});

test("filters malformed messages (bad role or missing content)", () => {
  const state = normalizeChatState({
    conversations: [{
      id: "c1",
      title: "t",
      messages: [
        { role: "user", content: "ok" },
        { role: "system", content: "not a chat role" },
        { role: "assistant" },
        { role: "assistant", content: "good" }
      ],
      createdAt: 1,
      updatedAt: 2
    }],
    activeId: "c1"
  });
  expect(state.conversations[0].messages).toEqual([
    { role: "user", content: "ok" },
    { role: "assistant", content: "good" }
  ]);
});

test("drops invalid conversations and pins activeId to one that exists", () => {
  const state = normalizeChatState({
    conversations: [
      { id: "c1", title: "t", messages: [{ role: "assistant", content: "a" }], createdAt: 1, updatedAt: 1 },
      { title: "missing id", messages: [] },
      "garbage"
    ],
    activeId: "does-not-exist"
  });
  expect(state.conversations).toHaveLength(1);
  expect(state.activeId).toBe("c1");
});

test("defaults to empty state for missing or garbage data", () => {
  expect(normalizeChatState(undefined)).toEqual({ conversations: [], activeId: null });
  expect(normalizeChatState({ conversations: "nope" })).toEqual({ conversations: [], activeId: null });
});
