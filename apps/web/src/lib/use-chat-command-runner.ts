/**
 * React hook that executes parsed slash commands against the backend and
 * injects results into the chat thread as synthetic messages.
 *
 * Read commands hit /api/tools/run (which only accepts directInvokable tools)
 * and produce a `tool-${name}` message with the returned render spec — the
 * existing ChatThread renderer paints it the same way it paints AI tool
 * results, so the UI is consistent.
 *
 * Mutations are surfaced to the caller as a "needs-confirmation" result; the
 * UI shows a confirmation card and calls `runMutation` once the user agrees.
 */

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAIChat } from "#/components/chat/chat-context";
import { useTRPC } from "#/integrations/trpc/react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "#/types/chat";
import type {
	MutationConfirmation,
	MutationKind,
	ParsedCommand,
} from "#/lib/chat-commands";

type RunResult =
	| { kind: "done" }
	| { kind: "needs-confirmation"; confirmation: MutationConfirmation }
	| { kind: "error"; message: string };

function makeSpec(type: string, props: Record<string, unknown>) {
	return {
		root: "main",
		elements: {
			main: { type, props, children: [] },
		},
	};
}

function makeUserMessage(text: string): UIMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		parts: [{ type: "text", text }],
	} as UIMessage;
}

function makeToolMessage(opts: {
	toolName: string;
	args: Record<string, unknown>;
	state: "input-streaming" | "output-available" | "output-error";
	output?: unknown;
	errorText?: string;
}): UIMessage {
	const toolCallId = crypto.randomUUID();
	return {
		id: crypto.randomUUID(),
		role: "assistant",
		parts: [
			{
				type: `tool-${opts.toolName}`,
				toolCallId,
				state: opts.state,
				input: opts.args,
				...(opts.output !== undefined ? { output: opts.output } : {}),
				...(opts.errorText ? { errorText: opts.errorText } : {}),
			} as never,
		],
	} as UIMessage;
}

/** Build an ActionResult spec for mutation outcomes — matches AI-tool style. */
function actionResultMessage(opts: {
	action: string;
	success: boolean;
	message: string;
	username?: string;
}): UIMessage {
	return makeToolMessage({
		toolName: opts.action,
		args: opts.username ? { username: opts.username } : {},
		state: "output-available",
		output: makeSpec("ActionResult", {
			success: opts.success,
			message: opts.message,
			action: opts.action,
		}),
	});
}

interface CommandRunnerAdapter {
	chatId?: string;
	appendOptimisticMessage?: (message: UIMessage) => void;
	replaceOptimisticMessage?: (id: string, message: UIMessage) => void;
	clearChat: () => void;
	newChat?: () => void;
	repoId?: string;
}

export function useSlashCommandRunner(adapter?: CommandRunnerAdapter) {
	const chat = useAIChat();
	const appendOptimisticMessage = adapter?.appendOptimisticMessage ?? chat.appendOptimisticMessage;
	const replaceOptimisticMessage = adapter?.replaceOptimisticMessage ?? chat.replaceOptimisticMessage;
	const clearChat = adapter?.clearChat ?? chat.clearChat;
	const newChat = adapter?.newChat ?? chat.newChat;
	const repoId = adapter?.repoId ?? chat.repoId;
	const chatId = adapter?.chatId ?? chat.conversationId;
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [pending, setPending] = useState<MutationConfirmation | null>(null);

	const blacklistAdd = useMutation(trpc.blacklist.add.mutationOptions());
	const blacklistRemove = useMutation(trpc.blacklist.remove.mutationOptions());
	const whitelistAdd = useMutation(trpc.whitelist.add.mutationOptions());
	const whitelistRemove = useMutation(trpc.whitelist.remove.mutationOptions());
	const runSlashCommandOnServer = useMutation(trpc.chats.runSlashCommand.mutationOptions());
	const appendSlashMessages = useMutation(trpc.chats.appendSlashMessages.mutationOptions());

	const appendPersistedSlashMessage = useCallback(
		async (message: UIMessage) => {
			await appendSlashMessages.mutateAsync({
				chatId,
				repoId,
				messages: [message],
			});
			appendOptimisticMessage(message);
		},
		[appendOptimisticMessage, appendSlashMessages, chatId, repoId],
	);

	const appendPersistedSlashMessages = useCallback(
		async (messages: UIMessage[], opts: { appendToUi?: boolean } = {}) => {
			await appendSlashMessages.mutateAsync({
				chatId,
				repoId,
				messages,
			});
			if (opts.appendToUi) {
				for (const message of messages) appendOptimisticMessage(message);
			}
		},
		[appendOptimisticMessage, appendSlashMessages, chatId, repoId],
	);

	const invalidateLists = useCallback(() => {
		if (!repoId) return;
		queryClient.invalidateQueries({ queryKey: trpc.blacklist.list.queryKey({ repoId }) });
		queryClient.invalidateQueries({ queryKey: trpc.whitelist.list.queryKey({ repoId }) });
		queryClient.invalidateQueries({ queryKey: trpc.events.list.queryKey() });
	}, [repoId, queryClient, trpc.blacklist.list, trpc.whitelist.list, trpc.events.list]);

	const runCommand = useCallback(
		async (parsed: ParsedCommand): Promise<RunResult> => {
			const { command, args, raw } = parsed;

			// Validate args before we add the user-echo bubble.
			if (command.requiresArg && !args) {
				return {
					kind: "error",
					message: command.example
						? `Usage: ${command.example}`
						: `${command.command} requires an argument.`,
				};
			}

			if (command.kind === "mutation") {
				const userMessage = makeUserMessage(raw);
				appendOptimisticMessage(userMessage);
				void appendPersistedSlashMessages([userMessage]);
				if (!command.buildConfirm) {
					return { kind: "error", message: "Command misconfigured" };
				}
				const confirmation = command.buildConfirm(args);
				setPending(confirmation);
				return { kind: "needs-confirmation", confirmation };
			}

			if (command.command === "/clear") {
				try {
					await runSlashCommandOnServer.mutateAsync({
						chatId,
						repoId,
						raw,
					});
					clearChat();
					queryClient.invalidateQueries({ queryKey: trpc.chats.get.queryKey({ chatId }) });
					queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() });
					return { kind: "done" };
				} catch (error) {
					return {
						kind: "error",
						message: error instanceof Error ? error.message : "Command failed.",
					};
				}
			}

			if (command.command === "/new") {
				newChat();
				return { kind: "done" };
			}

			let loading: UIMessage | null = null;
			try {
				const optimisticUser = makeUserMessage(raw);
				appendOptimisticMessage(optimisticUser);

				loading = command.kind === "read" && command.tool && command.buildArgs
					? makeToolMessage({
						toolName: command.tool,
						args: command.buildArgs(args),
						state: "input-streaming",
					})
					: null;
				if (loading) appendOptimisticMessage(loading);
				await nextFrame(); // give the browser one paint frame before starting the slow slash-command request

				const result = await runSlashCommandOnServer.mutateAsync({
					chatId,
					repoId,
					raw,
				});

				if (result.newChat) {
					newChat();
					return { kind: "done" };
				}

				if (result.replace) {
					clearChat();
					return { kind: "done" };
				}

				const assistantMessages = (result.messages as UIMessage[]).filter(
					(message) => message.role !== "user",
				);
				if (loading && assistantMessages[0]) {
					replaceOptimisticMessage(loading.id, assistantMessages[0]);
					for (const message of assistantMessages.slice(1)) {
						appendOptimisticMessage(message);
					}
				} else {
					for (const message of assistantMessages) {
						appendOptimisticMessage(message);
					}
				}
				return { kind: "done" };
			} catch (error) {
				if (loading && command.kind === "read" && command.tool && command.buildArgs) {
					replaceOptimisticMessage(
						loading.id,
						makeToolMessage({
							toolName: command.tool,
							args: command.buildArgs(args),
							state: "output-error",
							errorText: error instanceof Error ? error.message : "Command failed.",
						}),
					);
				}
				return {
					kind: "error",
					message: error instanceof Error ? error.message : "Command failed.",
				};
			}
		},
		[appendOptimisticMessage, appendPersistedSlashMessages, chatId, clearChat, newChat, queryClient, replaceOptimisticMessage, repoId, runSlashCommandOnServer, trpc.chats.get, trpc.chats.list],
	);

	const runMutation = useCallback(
		async (confirmation: MutationConfirmation) => {
			if (!repoId) {
				await appendPersistedSlashMessage(actionResultMessage({
					action: confirmation.mutation,
					success: false,
					message: "No active repository — connect one first.",
					username: confirmation.username,
				}));
				return;
			}

			const input = {
				repoId,
				githubUsername: confirmation.username,
			};
			const mutationFor: Record<MutationKind, () => Promise<unknown>> = {
				"blacklist.add": () => blacklistAdd.mutateAsync(input),
				"blacklist.remove": () => blacklistRemove.mutateAsync(input),
				"whitelist.add": () => whitelistAdd.mutateAsync(input),
				"whitelist.remove": () => whitelistRemove.mutateAsync(input),
			};

			try {
				await mutationFor[confirmation.mutation]();
				invalidateLists();
				await appendPersistedSlashMessage(actionResultMessage({
					action: confirmation.mutation,
					success: true,
					message: successMessageFor(confirmation),
					username: confirmation.username,
				}));
			} catch (err) {
				const errMsg =
					err instanceof Error ? err.message : "Unknown error";
				await appendPersistedSlashMessage(actionResultMessage({
					action: confirmation.mutation,
					success: false,
					message: errMsg,
					username: confirmation.username,
				}));
			} finally {
				setPending(null);
			}
		},
		[
			repoId,
			appendPersistedSlashMessage,
			appendPersistedSlashMessages,
			blacklistAdd,
			blacklistRemove,
			whitelistAdd,
			whitelistRemove,
			invalidateLists,
		],
	);

	const cancelMutation = useCallback(() => {
		if (pending) {
			void appendPersistedSlashMessage(
				actionResultMessage({
					action: pending.mutation,
					success: false,
					message: "Cancelled.",
					username: pending.username,
				}),
			);
		}
		setPending(null);
	}, [pending, appendPersistedSlashMessage]);

	return {
		runCommand,
		runMutation,
		cancelMutation,
		pendingConfirmation: pending,
	};
}

function successMessageFor(c: MutationConfirmation): string {
	switch (c.mutation) {
		case "blacklist.add":
			return `@${c.username} has been added to the blacklist.`;
		case "blacklist.remove":
			return `@${c.username} has been removed from the blacklist.`;
		case "whitelist.add":
			return `@${c.username} has been added to the whitelist.`;
		case "whitelist.remove":
			return `@${c.username} has been removed from the whitelist.`;
	}
}

function nextFrame(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
