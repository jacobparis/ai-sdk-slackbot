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
          "• Weather information\n" +
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
      {
        title: "Get weather",
        message: "What's the weather like in New York right now?",
      },
    ],
  });
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  console.log('Handling new message:', JSON.stringify(event, null, 2));
  
  // Skip bot messages and messages without text
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.text
  ) {
    console.log('Skipping message:', { 
      bot_id: event.bot_id, 
      bot_profile: event.bot_profile,
      has_text: !!event.text 
    });
    return;
  }

  const { thread_ts, channel, text } = event;
  console.log('Processing message:', { channel, thread_ts, text });

  // For channel messages (not in threads), only respond if we're mentioned
  if (event.channel_type === 'channel' && !thread_ts && !text.includes(`<@${botUserId}>`)) {
    console.log('Skipping channel message without mention');
    return;
  }

  const updateStatus = updateStatusUtil(channel, thread_ts || event.ts);
  await updateStatus("is thinking...");

  try {
    // Clean the message text by removing the bot mention
    const cleanText = text.replace(`<@${botUserId}>`, '').trim();
    console.log('Cleaned message text:', cleanText);

    // Add context about the message type
    const context = {
      isDirectMessage: event.channel_type === 'im',
      isThread: !!thread_ts,
      channelType: event.channel_type,
    };
    console.log('Message context:', context);

    const messages: CoreMessage[] = thread_ts 
      ? await getThread(channel, thread_ts, botUserId)
      : [{ role: "user", content: cleanText }];
      
    console.log('Sending messages to AI:', JSON.stringify(messages, null, 2));
    const result = await generateResponse(messages, updateStatus);
    console.log('AI response:', result);
    
    // Don't send empty messages
    if (!result || result.trim() === '') {
      console.log('Empty response received, sending fallback message');
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts || event.ts,
        text: "I'm not sure how to respond to that. Could you try rephrasing your question?",
        unfurl_links: false,
      });
    } else {
      // Add a typing indicator before sending the response
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts || event.ts,
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
    await updateStatus("");
  }
}
