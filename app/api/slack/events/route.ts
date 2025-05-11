import { NextResponse } from 'next/server'
import { verifySlackRequest } from '@/lib/slack-utils'
import * as eventHandlers from '@/lib/handle-events'

export async function POST(request: Request) {
  try {
    // Verify the request is from Slack
    const isValid = await verifySlackRequest(request)
    if (!isValid) {
      return new NextResponse('Invalid request', { status: 401 })
    }

    const body = await request.json()

    // Handle URL verification
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge })
    }

    // Handle events
    if (body.event) {
      const event = body.event
      console.log('Received Slack event:', event.type)

      // Map event types to handlers
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
      } else {
        console.log('No handler for event type:', event.type)
      }
    }

    // Always return 200 to acknowledge receipt
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('Error handling Slack event:', error)
    return new NextResponse('Error processing request', { status: 500 })
  }
} 
