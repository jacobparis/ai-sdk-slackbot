import { kv } from '@vercel/kv'

const SYSTEM_PROMPT_KEY = 'system-prompt'

export async function getSystemPrompt(): Promise<string> {
  const prompt = await kv.get(SYSTEM_PROMPT_KEY)
  return prompt as string || 'Hello, how can I assist you today?'
}

export async function setSystemPrompt(prompt: string) {
  await kv.set(SYSTEM_PROMPT_KEY, prompt)
}

export async function storeThreadId(threadId: string) {
  const key = `thread:${threadId}`
  await kv.set(key, true)
  // Set expiration to 30 days
  await kv.expire(key, 60 * 60 * 24 * 30)
}

export async function isThreadTracked(threadId: string): Promise<boolean> {
  const key = `thread:${threadId}`
  const result = await kv.get(key)
  return result === true
}

export async function isMessageProcessed(messageId: string): Promise<boolean> {
  const result = await kv.get(`processed:${messageId}`);
  return result !== null;
}

export async function markMessageProcessed(messageId: string): Promise<void> {
  await kv.set(`processed:${messageId}`, 'true', { ex: 60 * 60 * 24 }); // 24 hour TTL
}
