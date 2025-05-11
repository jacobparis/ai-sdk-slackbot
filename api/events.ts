import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";
import * as eventHandlers from "../lib/handle-events";
import { storeThreadId, isThreadTracked } from "../lib/kv-utils";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const botUserId = await getBotId();
    const event = payload.event as SlackEvent;

    // Handle core message events
    if (event.type === "app_mention") {
      // Store thread ID if this is a threaded mention
      if (event.thread_ts) {
        waitUntil(storeThreadId(event.thread_ts));
      } else {
        // If it's not a thread, use the message timestamp as the thread ID
        waitUntil(storeThreadId(event.ts));
      }
      waitUntil(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      waitUntil(assistantThreadMessage(event));
    }

    // Handle all messages
    if (
      event.type === "message" &&
      !event.subtype &&
      !event.bot_id &&
      !event.bot_profile &&
      event.bot_id !== botUserId
    ) {
      // If it's a direct message, handle it
      if (event.channel_type === "im") {
        if (event.thread_ts) {
          waitUntil(storeThreadId(event.thread_ts));
        } else {
          waitUntil(storeThreadId(event.ts));
        }
        waitUntil(handleNewAssistantMessage(event, botUserId));
      }
      // If it's in a thread, check if we're tracking it
      else if (event.thread_ts) {
        const isTracked = await isThreadTracked(event.thread_ts);
        console.log('Thread tracking check:', { thread_ts: event.thread_ts, isTracked });
        if (isTracked) {
          waitUntil(handleNewAssistantMessage(event, botUserId));
        }
      }
    }

    // Handle additional events
    const handlerMap: { [key: string]: Function } = {
      'app_home_opened': eventHandlers.handleAppHomeOpened,
      'channel_archive': eventHandlers.handleChannelArchive,
      'channel_created': eventHandlers.handleChannelCreated,
      'channel_deleted': eventHandlers.handleChannelDeleted,
      'channel_rename': eventHandlers.handleChannelRename,
      'file_shared': eventHandlers.handleFileShared,
      'link_shared': eventHandlers.handleLinkShared,
      'member_joined_channel': eventHandlers.handleMemberJoinedChannel,
      'reaction_added': eventHandlers.handleReactionAdded,
      'user_change': eventHandlers.handleUserChange,
      'message_metadata_posted': eventHandlers.handleMessageMetadataPosted,
      'pin_added': eventHandlers.handlePinAdded,
      'emoji_changed': eventHandlers.handleEmojiChanged,
      'channel_history_changed': eventHandlers.handleChannelHistoryChanged,
      'team_access_granted': eventHandlers.handleTeamAccessGranted,
      'team_access_revoked': eventHandlers.handleTeamAccessRevoked,
    };

    const handler = handlerMap[event.type];
    if (handler) {
      waitUntil(handler(event));
    }

    console.log("Event received", event);
    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
