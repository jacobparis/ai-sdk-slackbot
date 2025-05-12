import { verifySignature } from '@upstash/qstash/nextjs'
import { eventHandlerMap } from '../lib/handle-events'
import { isMessageProcessed, markMessageProcessed } from '../lib/kv-utils'

export const config = {
  api: {
    bodyParser: false,
  },
}

export async function POST(req: Request) {
  try {
    await verifySignature(req)
  } catch (err) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const { event, botUserId } = body

  const type = `${event.type}${event.subtype ? `/${event.subtype}` : ''}`
  
  try {
    // Generate message ID
    const messageId = event.type === "message" && event.subtype === "message_changed"
      ? `${event.channel}:${event.message?.ts}`
      : `${event.channel}:${event.ts}`

    // Check idempotency first
    if (await isMessageProcessed(messageId)) {
      console.log(`[SKIP ${type}] ${messageId} - already processed`)
      return new Response("Already processed", { status: 200 })
    }

    await markMessageProcessed(messageId)

    console.log(`[PROCESS ${type}] ${messageId} ${event.text || ''}`)
    const handler = eventHandlerMap[event.type as keyof typeof eventHandlerMap]
    if (handler) {
      await handler(event, botUserId)
    }

    return new Response('Success!', { status: 200 })
  } catch (error: any) {
    console.error(`[ERROR ${type}] ${error.message}`, error)
    return new Response("Error processing event", { status: 500 })
  }
}
