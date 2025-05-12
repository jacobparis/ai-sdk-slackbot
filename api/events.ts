import type { SlackEvent } from "@slack/web-api"
import { verifyRequest, getBotId } from "../lib/slack-utils"
import { scheduleJob } from "../lib/qstash-utils"
import { isMessageProcessed, markMessageProcessed } from "../lib/kv-utils"
export interface GroupArchiveEvent {
	type: "group_archive"
	channel: string
	user: string
	is_moved: number
	event_ts: string
}
export interface GroupCloseEvent {
	type: "group_close"
	user: string
	channel: string
}
export interface GroupDeletedEvent {
	type: "group_deleted"
	channel: string
	date_deleted: number
	actor_id: string
	event_ts: string
}
export interface GroupHistoryChangedEvent {
	type: "group_history_changed"
	latest: string
	ts: string
	event_ts: string
}
export interface GroupLeftEvent {
	type: "group_left"
	channel: string
	actor_id: string
	event_ts: string
}
export interface GroupOpenEvent {
	type: "group_open"
	user: string
	channel: string
}
export interface GroupRenameEvent {
	type: "group_rename"
	channel: {
		id: string
		name: string
		name_normalized: string
		created: number
		is_channel: boolean
		is_mpim: boolean
	}
	event_ts: string
}
export interface GroupUnarchiveEvent {
	type: "group_unarchive"
	channel: string
	actor_id: string
	event_ts: string
}
//# sourceMappingURL=group.d.ts.map

export async function POST(request: Request) {
	const rawBody = await request.text()
	const payload = JSON.parse(rawBody)
	const requestType = payload.type as "url_verification" | "event_callback"

	// See https://api.slack.com/events/url_verification
	if (requestType === "url_verification") {
		return new Response(payload.challenge, { status: 200 })
	}

	await verifyRequest({ requestType, request, rawBody })

	try {
		const botUserId = await getBotId()
		const event = payload.event as SlackEvent & {
			subtype?: string;
			channel_type?: string;
			channel?: string;
			user?: string;
			ts?: string;
			message?: { ts: string };
		}
    
    const type = `${event.type}${event.subtype ? `/${event.subtype}` : ''}`
    
    // Generate message ID early for logging
    const messageId = event.type === "message" && event.subtype === "message_changed"
      ? `${event.channel}:${event.message?.ts}`
      : `${event.channel}:${event.ts}`
      
		if (event.type !== "message") {
      console.log(`[SKIP ${type}] ${messageId}`)
			return new Response("ACK", { status: 200 })
		}

    
    if ("bot_id" in event) {
      return new Response("ACK", { status: 200 })
    }

    if (!("text" in event) || !event.text) {
      console.log(`[SKIP ${type}] ${messageId}`)
      return new Response("ACK", { status: 200 })
    }

		// Queue the event for processing
		const url = `${process.env.HOST_URL}/api/process-event`
		await scheduleJob({
			url,
			body: { event, botUserId },
		})

		console.log(`[QUEUED ${type}] ${messageId} ${"text" in event ? event.text : ""}`)
		return new Response("Success!", { status: 200 })
	} catch (error) {
		console.error("Error queueing event", error)
		return new Response("Error queueing event", { status: 500 })
	}
}
