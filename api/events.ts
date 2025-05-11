import type { SlackEvent } from "@slack/web-api";
import { verifyRequest, getBotId } from "../lib/slack-utils";
import { scheduleJob } from "../lib/qstash-utils";

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

    // Queue the event for processing
    const url = `${process.env.HOST_URL}/api/process-event`;
    await scheduleJob({
      url,
      body: { event, botUserId },
      delay: 0, // Process immediately
    });

    console.log("Event queued", event);
    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error queueing event", error);
    return new Response("Error queueing event", { status: 500 });
  }
}
