import { AppMentionEvent } from "@slack/web-api";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { CoreMessage } from "ai";

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const updateMessage = await updateStatusUtil("is thinking...", event);

  try {
    // Clean the message text by removing the bot mention
    const cleanText = event.text.replace(`<@${botUserId}>`, '').trim();
    console.log('Cleaned message text:', cleanText);

    const messages: CoreMessage[] = thread_ts 
      ? await getThread(channel, thread_ts, botUserId)
      : [{ role: "user", content: cleanText }];

    const result = await generateResponse(messages, updateMessage);
    
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
    await updateMessage("");
  }
}
