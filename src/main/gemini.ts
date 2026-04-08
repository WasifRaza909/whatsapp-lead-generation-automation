/**
 * Gemini AI service — uses the Gemini REST API (no SDK dependency required).
 * Model: gemini-2.5-flash  (free tier)
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export interface LeadData {
  name: string
  address?: string
  website?: string
  service?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
  error?: { message: string; code: number }
}

export async function generatePersonalizedMessage(
  apiKey: string,
  leadData: LeadData
): Promise<string> {
  // Extract city from address (take the last meaningful part after a comma)
  const city = leadData.address
    ? (leadData.address.split(',').slice(-2, -1)[0]?.trim() || leadData.address.split(',')[0]?.trim())
    : ''

  const service = leadData.service?.trim() || 'growing their business'

  const prompt =
    `Write a short WhatsApp cold-outreach message for a business.\n\n` +
    `Details:\n` +
    `- Business name: ${leadData.name}\n` +
    (city ? `- City: ${city}\n` : '') +
    `- What we offer: ${service}\n\n` +
    `Rules:\n` +
    `1. Start with "Hi ${leadData.name}" (use exact business name, NOT a placeholder).\n` +
    `2. Mention you came across their business online.\n` +
    `3. In 1-2 more sentences pitch how we help businesses like theirs grow through ${service}.\n` +
    `4. End with a soft call-to-action like asking if they'd be open to a quick chat.\n` +
    `5. Keep the entire message under 60 words. Friendly and conversational.\n` +
    `6. Output ONLY the final message. No quotes, no subject line, no labels.\n\n` +
    `Example (DO NOT copy verbatim — write a unique message):\n` +
    `Hi Sunrise Café, I came across your business and loved what you're doing! We help cafés like yours attract more customers through social media marketing. Would you be open to a quick chat about how we could help? 😊`

  const MAX_RETRIES = 3
  const RETRYABLE = [429, 500, 503]

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1024,
            candidateCount: 1,
            // Disable thinking — it eats into maxOutputTokens on gemini-2.5-flash
            thinkingConfig: { thinkingBudget: 0 }
          }
        }),
        signal: AbortSignal.timeout(20000)
      })

      const data = (await response.json()) as GeminiResponse

      // Retryable HTTP error (rate limit / high demand / server error)
      if (RETRYABLE.includes(response.status) || (data.error && RETRYABLE.includes(data.error.code))) {
        if (attempt < MAX_RETRIES) {
          const delay = 4000 * Math.pow(2, attempt) // 4s → 8s → 16s
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw new Error(
          data.error?.message ?? `Gemini API error [HTTP ${response.status}] after ${MAX_RETRIES} retries.`
        )
      }

      if (!response.ok || data.error) {
        throw new Error(
          data.error?.message ?? `Gemini API error [HTTP ${response.status}]`
        )
      }

      // gemini-2.5-flash includes thinking parts (thought: true) — filter them out
      const parts = data.candidates?.[0]?.content?.parts ?? []
      const text = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
        .trim()
      if (!text) throw new Error('Gemini returned an empty response')

      return text
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(
          `Network error: ${(err as TypeError).message}. Check your internet connection.`
        )
      }
      if (err instanceof Error && err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 4000 * Math.pow(2, attempt)))
          continue
        }
        throw new Error('Gemini API timed out after multiple retries. Try again later.')
      }
      throw err
    }
  }

  // Unreachable — TypeScript needs this
  throw new Error('Gemini request failed unexpectedly.')
}

/** Validate an API key by sending a minimal probe request. */
export async function validateApiKey(apiKey: string): Promise<void> {
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Invalid API key format: key is too short.')
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout for validation
    })

    const data = (await response.json()) as GeminiResponse
    if (!response.ok || data.error) {
      const errorMsg = data.error?.message ?? `HTTP ${response.status}`
      if (response.status === 400) {
        throw new Error('Invalid API key. Check that you copied it correctly.')
      }
      if (response.status === 403) {
        throw new Error('API key is invalid or not authorized for Gemini API.')
      }
      throw new Error(`Gemini API error: ${errorMsg}`)
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        'Network error: Could not reach Gemini API. Check your internet connection.'
      )
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Validation request timed out. Try again.')
    }
    throw err
  }
}
