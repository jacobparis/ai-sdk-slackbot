import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { CoreMessage } from "ai";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

  await client.chat.postMessage({
    channel: channel_id,
    thread_ts: thread_ts,
    text: "Hello! I'm your AI assistant. I can help you with:\n" +
          "• Scheduling messages\n" +
          "• Web searches\n" +
          "• And more!\n\n" +
          "Just ask me what you need help with!",
  });

  await client.assistant.threads.setSuggestedPrompts({
    channel_id: channel_id,
    thread_ts: thread_ts,
    prompts: [
      {
        title: "Schedule a message",
        message: "Schedule a message for tomorrow at 9am saying 'Good morning team!'",
      },
      {
        title: "Search the web",
        message: "What's the latest news about AI technology?",
      },
    ],
  });
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  // Skip bot messages and messages without text
  if (
    event.bot_id ||
    event.bot_profile ||
    !event.text ||
    (event.subtype === 'message_changed' && 'message' in event && (event.message as GenericMessageEvent)?.bot_id)
  ) {
    return;
  }

  const { thread_ts, channel, text } = event;

  // For channel messages (not in threads), only respond if we're mentioned
  if (event.channel_type === 'channel' && !thread_ts && !text.includes(`<@${botUserId}>`)) {
    return;
  }

  const initialMessage = await client.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts || event.ts,
    text: "is thinking...",
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };

  try {
    // Clean the message text by removing the bot mention
    const cleanText = text.replace(`<@${botUserId}>`, '').trim();

    const messages: CoreMessage[] = thread_ts 
      ? await getThread(channel, thread_ts, botUserId)
      : [{ role: "user", content: cleanText }];
      
    // Add context about the current channel and thread
    messages.unshift({
      role: "system",
      content: `You are in channel ${channel}${thread_ts ? ` and thread ${thread_ts}` : ''}. When scheduling messages, you must always include the channel parameter with the value "${channel}".`
    });
      
    let result = await generateResponse(messages, updateMessage);
    
    // If the response contains a function call, retry the generation
    if (result.includes('<function=')) {
      result = await generateResponse(messages, updateMessage);
    }
    
    // Don't send empty messages
    if (!result || result.trim() === '') {
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts || event.ts,
        text: "I'm not sure how to respond to that. Could you try rephrasing your question?",
        unfurl_links: false,
      });
    } else {
      // Extract thread_ts from the current message context
      const currentThreadTs = thread_ts || event.ts;
      
      // If the result contains a scheduled message, ensure it includes the thread_ts
      if (result.includes('scheduleMessage')) {
        result = result.replace(
          /scheduleMessage\(({[^}]+})\)/g,
          (match, args) => {
            const parsedArgs = JSON.parse(args);
            // If no channel specified, use current channel
            if (!parsedArgs.channel) {
              parsedArgs.channel = channel;
            }
            // If in a thread and no thread_ts specified, use current thread
            if (thread_ts && !parsedArgs.thread_ts) {
              parsedArgs.thread_ts = thread_ts;
            }
            return `scheduleMessage(${JSON.stringify(parsedArgs)})`;
          }
        );
      }

      await client.chat.postMessage({
        channel: channel,
        thread_ts: currentThreadTs,
        text: result,
        unfurl_links: false,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: result,
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await client.chat.postMessage({
      channel: channel,
      thread_ts: thread_ts || event.ts,
      text: "Sorry, I encountered an error while processing your message. Please try again.",
      unfurl_links: false,
    });
  } finally {
    await updateMessage("");
  }
}
