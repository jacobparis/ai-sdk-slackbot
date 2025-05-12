# AI SDK Slackbot

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjacobparis%2Fai-sdk-slackbot&env=SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET,OPENAI_API_KEY,EXA_API_KEY&envDescription=API%20keys%20needed%20for%20application&envLink=https%3A%2F%2Fgithub.com%2Fnicoalbanese%2Fai-sdk-slackbot%3Ftab%3Dreadme-ov-file%234-set-environment-variables&project-name=ai-sdk-slackbot)

An AI-powered chatbot for Slack powered by the [AI SDK by Vercel](https://sdk.vercel.ai/docs).

## Features

Activate the agent by DMing it, replying to a thread it has participated in, or tagging it

The agent can reply directly, post in other channels, and even schedule multiple messages to be posted in the future.

Tool Selection

- [x] Search the internet for info
- [x] Schedule messages
- [ ] Read/Write to Calendar
- [ ] Read/Write to Emails

> Look up the most popular coffee shops in Toronto, then post one to #general every morning at 8am

## Architecture

The agent is deployed to Vercel (enable Fluid Compute) and listens to Slack webhooks, then adds appropriate events to Upstash QStash for sequential idempotent processing.

It also uses QStash for scheduling messages to be posted later

It uses Upstash Redis to track whether it's subscribed to a particular thread, and ignores messages in threads it isn't subscribed to.

## Prerequisites

- Slack workspace with admin privileges
- [Anthropic API key](https://console.anthropic.com)
- [Exa API key](https://exa.ai) (for web search functionality)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and give your app a name
3. Select your workspace

### 3. Configure Slack App Settings

- Go to "Basic Information"
  - Under "App Credentials", note down your "Signing Secret". This will be an environment variable `SLACK_SIGNING_SECRET`
- Go to "App Home"
  - Under Show Tabs -> Messages Tab, Enable "Allow users to send Slash commands and messages from the messages tab"
- Go to "OAuth & Permissions"

  - Add the following [Bot Token Scopes](https://api.slack.com/scopes) at minimum
    - `app_mentions:read`
    - `assistant:write`
    - `chat:write`
    - `im:history`
    - `im:read`
    - `im:write`
    - I just added them all
  - Install the app to your workspace and note down the "Bot User OAuth Token" for the environment variable `SLACK_BOT_TOKEN`

- Go to "Event Subscriptions"
  - Enable Events
  - Set the Request URL to either
    - your deployment URL: (e.g. `https://your-app.vercel.app/api/events`)
    - or, for local development, use the tunnel URL from the [Local Development](./README.md#local-development) section below
  - Under "Subscribe to bot events", add:
    - `app_mention`
    - `assistant_thread_started`
    - `message:im`
    - I just added them all
  - Save Changes

> Remember to include `/api/events` in the Request URL.

You may need to refresh Slack with CMD+R or CTRL+R to pick up certain changes, such as enabling the chat tab

### 4. Set Environment Variables

Duplicate the `.env.example` file into a `.env` file and fill in the values

## Local Development

Use the [Vercel CLI](https://vercel.com/docs/cli) and [untun](https://github.com/unjs/untun) to test out this project locally:

```sh
npm i -g vercel
npm vercel dev --listen 3000 --yes
```

```sh
npx untun@latest tunnel http://localhost:3000
```

> Note: you may encounter issues locally with `waitUntil`. This is being investigated.

## License

MIT
