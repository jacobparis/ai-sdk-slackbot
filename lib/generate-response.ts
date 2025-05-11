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
  const { text, toolCalls } = await generateText({
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
      getWeather: tool({
        description: "Get the current weather at a location",
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }) => {
          updateStatus?.(`is getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
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
            })),
          };
        },
      }),
    },
  });

  console.log('AI response:', { text, toolCalls: JSON.stringify(toolCalls, null, 2) });

  // Handle tool calls and their responses
  if (toolCalls && toolCalls.length > 0) {
    console.log(`Processing ${toolCalls.length} tool calls`);
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        console.log('Processing tool call:', JSON.stringify(toolCall, null, 2));
        if (toolCall.type === 'tool-call' && toolCall.toolName === 'scheduleMessage') {
          const args = toolCall.args as { channel: string; message: string; delay?: number; cron?: string };
          console.log('Scheduling message with args:', args);
          try {
            const result = await scheduleJob({
              url: `${process.env.VERCEL_URL}/api/scheduled`,
              body: { channel: args.channel, message: args.message },
              delay: args.delay,
              cron: args.cron,
            });
            console.log('Schedule job successful:', result);
            return `Scheduled message with ID: ${result.messageId}`;
          } catch (error: any) {
            console.error('Error scheduling message:', error);
            return `Failed to schedule message: ${error?.message || 'Unknown error'}`;
          }
        }
        console.log('Skipping non-scheduleMessage tool call');
        return '';
      })
    );
    const response = toolResults.filter(Boolean).join("\n");
    console.log('Final tool call response:', response);
    return response;
  }

  // Convert markdown to Slack mrkdwn format
  const formattedText = text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
  console.log('Returning formatted text response:', formattedText);
  return formattedText;
};
