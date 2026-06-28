import { describe, it, expect } from "vitest"
import type { ToolSet } from "ai"
import type { ChatHistoryMessage } from "./server"
import { mergeClientMessagesWithStored, sanitizeMessages } from "./server"

const assistant = (msgs: ReturnType<typeof sanitizeMessages>) =>
  msgs.find((m) => m.role === "assistant")

const partTypes = (msg: { parts: { type: string }[] } | undefined) =>
  (msg?.parts ?? []).map((p) => p.type)

describe("sanitizeMessages", () => {
  it("normalizes a completed legacy tool-call/result pair into an AI SDK tool part", () => {
    const messages: ChatHistoryMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            name: "lookup",
            toolCallId: "c1",
            input: { x: 1 },
          },
          { type: "tool-result", toolCallId: "c1", output: { ok: true } },
        ],
      },
    ]
    expect(partTypes(assistant(sanitizeMessages(messages)))).toContain(
      "tool-lookup"
    )
  })

  it("drops a legacy tool-call with no matching result", () => {
    const out = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "tool-call", name: "lookup", toolCallId: "c1" },
          { type: "text", text: "thinking out loud" },
        ],
      },
    ])
    expect(partTypes(assistant(out))).toEqual(["text"])
  })

  it("keeps non-empty text parts and drops empty ones", () => {
    const out = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "hello" },
          { type: "text", text: "" },
        ],
      },
    ])
    expect(partTypes(assistant(out))).toEqual(["text"])
  })

  it("normalizes thinking/reasoning to a reasoning part", () => {
    const out = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "thinking", text: "hmm" }],
      },
    ])
    expect(partTypes(assistant(out))).toEqual(["reasoning"])
  })

  it("converts a content string to a text part", () => {
    const out = sanitizeMessages([
      { id: "u1", role: "user", content: "hello there" },
    ])
    expect(out[0]?.parts[0]).toMatchObject({
      type: "text",
      text: "hello there",
    })
  })

  it("drops messages with non-standard roles", () => {
    const out = sanitizeMessages([
      { id: "x", role: "tool", parts: [{ type: "text", text: "x" }] },
      { id: "u", role: "user", parts: [{ type: "text", text: "hi" }] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe("u")
  })

  it("keeps a completed AI SDK tool part but strips a pending one before a user turn", () => {
    const out = sanitizeMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-lookup",
            toolCallId: "c1",
            state: "output-available",
            input: {},
            output: {},
          },
          {
            type: "tool-lookup",
            toolCallId: "c2",
            state: "input-streaming",
            input: {},
          },
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
    ])
    const tools = (assistant(out)?.parts ?? []).filter(
      (p) => p.type === "tool-lookup"
    )
    expect(tools).toHaveLength(1)
    expect(tools[0] as Record<string, unknown>).toMatchObject({
      state: "output-available",
    })
  })

  it("drops tool parts for tools not in the allow-list", () => {
    const out = sanitizeMessages(
      [
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "tool-call", name: "ghost", toolCallId: "c1", input: {} },
            { type: "tool-result", toolCallId: "c1", output: {} },
          ],
        },
      ],
      { lookup: {} } as unknown as ToolSet
    )
    expect(assistant(out)).toBeUndefined()
  })
})

describe("mergeClientMessagesWithStored", () => {
  it("returns only cloned user messages when nothing is stored", () => {
    const client: ChatHistoryMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "yo" }] },
    ]
    const out = mergeClientMessagesWithStored(client, [])
    expect(out).toHaveLength(1)
    expect(out[0]).not.toBe(client[0])
    expect((out[0] as Record<string, unknown>).role).toBe("user")
  })

  it("applies a client approval-response onto the matching stored assistant part", () => {
    const stored: ChatHistoryMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-lookup",
            toolCallId: "c1",
            state: "approval-requested",
            approval: { id: "ap1" },
          },
        ],
      },
    ]
    const client: ChatHistoryMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-lookup",
            toolCallId: "c1",
            state: "approval-responded",
            approval: { id: "ap1", approved: true },
          },
        ],
      },
    ]
    const out = mergeClientMessagesWithStored(client, stored)
    const part = (out[0] as { parts: Record<string, unknown>[] }).parts[0]
    expect(part.state).toBe("approval-responded")
    expect(part.approval).toMatchObject({ approved: true })
  })
})
