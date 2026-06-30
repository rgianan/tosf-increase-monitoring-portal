export const API_URL = import.meta.env.VITE_GAS_WEB_APP_URL || ''
export const SUBMIT_TOKEN = import.meta.env.VITE_SUBMIT_SHARED_TOKEN || ''

export async function postJson(payload) {
  if (!API_URL) throw new Error('Missing VITE_GAS_WEB_APP_URL. Add the Apps Script web app URL in .env before submitting.')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })

  const raw = await res.text()
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('Backend did not return valid JSON.')
  }

  if (!res.ok || !data.ok) throw new Error(data.message || 'Request failed.')
  return data
}
