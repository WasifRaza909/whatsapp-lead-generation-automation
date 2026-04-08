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
    content?: { parts?: Array<{ text?: string }> }
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

  const service = leadData.service?.trim() || 'digital marketing services'

  const prompt =
    `Write a friendly 2-line WhatsApp intro message for ${leadData.name}` +
    (city ? `, located in ${city}` : '') +
    `. Mention that we can help them with ${service}. Keep it under 35 words, casual and professional.`

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 120,
          candidateCount: 1
        }
      }),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    })

    const data = (await response.json()) as GeminiResponse

    if (!response.ok || data.error) {
      throw new Error(
        data.error?.message ?? `Gemini API error [HTTP ${response.status}]`
      )
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) throw new Error('Gemini returned an empty response')

    return text
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Network error: ${err.message}. Check internet connection and API key validity.`
      )
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Gemini API request timed out after 15s. Try again.')
    }
    throw err
  }
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
