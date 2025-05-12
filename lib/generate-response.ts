import { anthropic } from "@ai-sdk/anthropic";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { getSystemPrompt, setSystemPrompt } from "./kv-utils";
import { scheduleJob } from "./qstash-utils";
import { getChannelId } from "./slack-utils"

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  const systemPrompt = await getSystemPrompt();

  // Extract channel and thread context from the first system message if it exists
  const contextMessage = messages.find(m => m.role === 'system' && m.content.includes('You are in channel'));
  const context = contextMessage?.content || '';

  const { text } = await generateText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    system: `${systemPrompt}\n\n${context}`,
    messages: messages.filter(m => m.role !== 'system'),
    maxSteps: 10,
    toolChoice: "auto",
    tools: {
      scheduleMessage: tool({
        description: "Schedule a message to be sent later",
        parameters: z.object({
          channel: z.string().describe("The channel to send the message to"),
          message: z.string().describe("The message to send"),
          delay: z.number().optional().describe("Delay in seconds before sending"),
          cron: z.string().optional().describe("Cron expression for recurring messages"),
          thread_ts: z.string().optional().describe("Thread timestamp to reply in"),
        }),
        execute: async ({ channel, message, delay, cron, thread_ts }) => {
          const channelId = await getChannelId(channel);

          const url = `${process.env.HOST_URL}/api/scheduled`;
          updateStatus?.("*scheduling…*");
          const result = await scheduleJob({
            url: url,
            body: { channel: channelId, message, thread_ts },
            delay,
            cron,
          });
          return { success: true, messageId: result.messageId };
        },
      }),
      updateSystemPrompt: tool({
        description: "Update the system prompt that guides the AI's behavior",
        parameters: z.object({
          prompt: z.string().describe("The new system prompt to use"),
        }),
        execute: async ({ prompt }) => {
          updateStatus?.("*updating system prompt…*");
          await setSystemPrompt(prompt);
          return { success: true, message: "System prompt updated successfully" };
        },
      }),
      searchWeb: tool({
        description: "Use this to search the web for information",
        parameters: z.object({
          query: z.string(),
          specificDomain: z
            .string()
            .optional()
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
            ),
        }),
        execute: async ({ query, specificDomain }) => {
          updateStatus?.(`is searching the web for ${query}...`);
          const { results } = await exa.searchAndContents(query, {
            livecrawl: "always",
            numResults: 3,
            includeDomains: specificDomain ? [specificDomain] : undefined,
          });

          return {
            results: results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text.slice(0, 1000),
              source: new URL(result.url).hostname,
            })),
          };
        },
      }),
      
    },
  });

  return text;
};
