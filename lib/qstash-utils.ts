import { Client } from '@upstash/qstash'

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
})

export async function scheduleJob({
  url,
  body,
  delay,
  cron,
}: {
  url: string
  body: any
  delay?: number
  cron?: string
}) {
  if (delay) {
    return await qstash.publishJSON({
      url,
      body,
      delay,
    })
  }

  if (cron) {
    return await qstash.publishJSON({
      url,
      body,
      cron,
    })
  }

  return await qstash.publishJSON({
    url,
    body,
  })
} 
