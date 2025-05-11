import { groq } from "@ai-sdk/groq";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { getSystemPrompt, setSystemPrompt } from "./kv-utils";
import { scheduleJob } from "./qstash-utils";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  console.log('Starting generateResponse with messages:', JSON.stringify(messages, null, 2));
  
  const systemPrompt = await getSystemPrompt();
  console.log('Retrieved system prompt:', systemPrompt);

  console.log('Generating text with AI...');
  const { text } = await generateText({
    model: groq("llama-3.3-70b-versatile"),
    system: systemPrompt,
    messages,
    maxSteps: 10,
    tools: {
      scheduleMessage: tool({
        description: "Schedule a message to be sent to a Slack channel at a later time",
        parameters: z.object({
          channel: z.string().describe("The Slack channel ID to send the message to"),
          message: z.string().describe("The message to send"),
          delay: z.number().optional().describe("Delay in seconds before sending the message"),
          cron: z.string().optional().describe("Cron expression for recurring messages (e.g. '0 9 * * *' for daily at 9am)"),
        }),
        execute: async ({ channel, message, delay, cron }) => {
          console.log('Executing scheduleMessage tool with args:', { channel, message, delay, cron });
          updateStatus?.("is scheduling message...");
          const result = await scheduleJob({
            url: `${process.env.VERCEL_URL}/api/scheduled`,
            body: { channel, message },
            delay,
            cron,
          });
          console.log('Schedule job result:', result);
          return { success: true, messageId: result.messageId };
        },
      }),
      updateSystemPrompt: tool({
        description: "Update the system prompt that guides the AI's behavior",
        parameters: z.object({
          prompt: z.string().describe("The new system prompt to use"),
        }),
        execute: async ({ prompt }) => {
          updateStatus?.("is updating system prompt...");
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
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
            ),
        }),
        execute: async ({ query, specificDomain }) => {
          console.log('Executing searchWeb tool with args:', { query, specificDomain });
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

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
