import { verifySignature } from '@upstash/qstash/nextjs'
import { client } from '../lib/slack-utils'

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
  const { message, channel, thread_ts } = body

  await client.chat.postMessage({
    channel,
    text: message,
    thread_ts,
  })

  return new Response('OK', { status: 200 })
}

export { handler as POST } 
