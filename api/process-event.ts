import { verifySignature } from '@upstash/qstash/nextjs'
import { handleNewAppMention } from '../lib/handle-app-mention'
import { handleNewAssistantMessage } from '../lib/handle-messages'
import { assistantThreadMessage } from '../lib/handle-messages'
import * as eventHandlers from '../lib/handle-events'
import { storeThreadId, isThreadTracked } from '../lib/kv-utils'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function handler(req: Request) {
  try {
    await verifySignature(req)
  } catch (err) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const { event, botUserId } = body

  try {
    // Handle core message events
    if (event.type === "app_mention") {
      // Store thread ID if this is a threaded mention
      if (event.thread_ts) {
        await storeThreadId(event.thread_ts)
      } else {
        // If it's not a thread, use the message timestamp as the thread ID
        await storeThreadId(event.ts)
      }
      await handleNewAppMention(event, botUserId)
    }

    if (event.type === "assistant_thread_started") {
      await assistantThreadMessage(event)
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
          await storeThreadId(event.thread_ts)
        } else {
          await storeThreadId(event.ts)
        }
        await handleNewAssistantMessage(event, botUserId)
      }
      // If it's in a thread, check if we're tracking it
      else if (event.thread_ts) {
        const isTracked = await isThreadTracked(event.thread_ts)
        console.log('Thread tracking check:', { thread_ts: event.thread_ts, isTracked })
        if (isTracked) {
          await handleNewAssistantMessage(event, botUserId)
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
    }

    const handler = handlerMap[event.type]
    if (handler) {
      await handler(event)
    }

    return new Response('Success!', { status: 200 })
  } catch (error) {
    console.error("Error processing event", error)
    return new Response("Error processing event", { status: 500 })
  }
}

export { handler as POST } 
