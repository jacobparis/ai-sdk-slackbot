import { client } from './slack-utils';
import { storeThreadId, isThreadTracked } from './kv-utils'
import type { MessageEvent } from '@slack/web-api'
import { getBotId, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { CoreMessage } from "ai";

export const eventHandlerMap = {
  'message': handleMessageEvent,
  'app_home_opened': handleAppHomeOpened,
  'channel_archive': handleChannelArchive,
  'channel_created': handleChannelCreated,
  'channel_deleted': handleChannelDeleted,
  'channel_rename': handleChannelRename,
  'file_shared': handleFileShared,
  'link_shared': handleLinkShared,
  'member_joined_channel': handleMemberJoinedChannel,
  'reaction_added': handleReactionAdded,
  'user_change': handleUserChange,
  'message_metadata_posted': handleMessageMetadataPosted,
  'pin_added': handlePinAdded,
  'emoji_changed': handleEmojiChanged,
  'channel_history_changed': handleChannelHistoryChanged,
  'team_access_granted': handleTeamAccessGranted,
  'team_access_revoked': handleTeamAccessRevoked,
}

// Channel Events
export async function handleChannelArchive(event: any) {
  console.log('Channel archived:', event.channel);
  // Store channel state in KV for future reference
}

export async function handleChannelCreated(event: any) {
  console.log('New channel created:', event.channel);
  // Welcome message for new channels
  await client.chat.postMessage({
    channel: event.channel.id,
    text: `Welcome to the new channel! I can help you with:\n• Scheduling messages\n• Web searches\n• Weather information\nJust mention me with @ to get started!`,
  });
}

export async function handleChannelDeleted(event: any) {
  // Clean up any scheduled messages for this channel
}

export async function handleChannelRename(event: any) {
  console.log('Channel renamed:', { old: event.old_name, new: event.new_name });
  // Update any stored channel references
}

// File Events
export async function handleFileShared(event: any) {
  // If it's a text file, offer to summarize it
  if (event.file.filetype === 'text') {
    await client.chat.postMessage({
      channel: event.channel_id,
      thread_ts: event.message_ts,
      text: "I can help summarize this text file. Would you like me to do that?",
    });
  }
}

// Link Events
export async function handleLinkShared(event: any) {
  // Offer to fetch and summarize the linked content
  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.message_ts,
    text: "I can help fetch and summarize this content. Would you like me to do that?",
  });
}

// Member Events
export async function handleMemberJoinedChannel(event: any) {
  console.log('Member joined channel:', { user: event.user, channel: event.channel });
  // Welcome new members
  await client.chat.postMessage({
    channel: event.channel,
    text: `Welcome <@${event.user}>! I'm here to help with:\n• Scheduling messages\n• Web searches\n• Weather information\nJust mention me with @ to get started!`,
  });
}

// Reaction Events
export async function handleReactionAdded(event: any) {
  // If someone reacts with a specific emoji, trigger an action
  if (event.reaction === 'calendar') {
    await client.chat.postMessage({
      channel: event.item.channel,
      thread_ts: event.item.ts,
      text: "Would you like me to schedule this message for later?",
    });
  }
}

// User Events
export async function handleUserChange(event: any) {
  console.log('User data changed:', event.user);
  // Update any stored user information
}

// Message Metadata Events
export async function handleMessageMetadataPosted(event: any) {
  // Handle any custom metadata attached to messages
}

// App Home Events
export async function handleAppHomeOpened(event: any) {
  console.log('App home opened by:', event.user);
  // Update the app home view with personalized content
  await client.views.publish({
    user_id: event.user,
    view: {
      type: 'home',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Welcome to your AI Assistant!*\n\nI can help you with:\n• Scheduling messages\n• Web searches\n• Weather information\n\nJust send me a message to get started!`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Quick Actions*',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Schedule a Message',
              },
              action_id: 'schedule_message',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Search Web',
              },
              action_id: 'search_web',
            },
          ],
        },
      ],
    },
  });
}

// Pin Events
export async function handlePinAdded(event: any) {
  // If someone pins a message, offer to create a summary
  await client.chat.postMessage({
    channel: event.channel_id,
    thread_ts: event.message_ts,
    text: "This message was pinned. Would you like me to create a summary of the thread?",
  });
}

// Emoji Events
export async function handleEmojiChanged(event: any) {
  console.log('Emoji changed:', event);
}

// Message History Events
export async function handleChannelHistoryChanged(event: any) {
  // Handle bulk updates to channel history
}

// Team Access Events
export async function handleTeamAccessGranted(event: any) {
  console.log('Team access granted:', event);
}

export async function handleTeamAccessRevoked(event: any) {
  console.log('Team access revoked:', event);
}

// Message Events
export async function handleMessageEvent(event: MessageEvent, botUserId: string) {
  console.log(event)
 
  if (event.subtype) {
    return
  }
  
  if (event.bot_id ||!event.text) {
    return
  }
 
  if (event.channel_type !== "im" && !event.text.includes(`<@${await getBotId()}>`)) {
    if (!await isThreadTracked(event.thread_ts)) {
      // If it's not a DM and not a tracked thread
      return
    }
  }
  
  await storeThreadId(event.thread_ts ?? event.ts);

  const { thread_ts, channel, text } = event;

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
      content: `You are in channel ${channel}${thread_ts ? ` and thread ${thread_ts}` : ''}. When scheduling messages, you must always include the channel parameter with the value "${channel}" unless instructed otherwise.`
    });
      
    let result = await generateResponse(messages, updateMessage);
    
    // Don't send empty messages
    if (!result || result.trim() === '') {
      await updateMessage("I'm not sure how to respond to that. Could you try rephrasing your question?");
    } else {
      await updateMessage(result);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await updateMessage("Sorry, I encountered an error while processing your message. Please try again.");
  }
}
