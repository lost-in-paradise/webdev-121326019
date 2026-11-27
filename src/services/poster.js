import { findUserById } from '../data/users.js';

let posterFetchStub = null;
let modelCalled = false;
let posterTimeoutMs = 10000;

export function setPosterStub(stub) {
  posterFetchStub = stub;
  modelCalled = false;
}

export function wasPosterModelCalled() {
  return modelCalled;
}

export function resetPosterStub() {
  posterFetchStub = null;
  modelCalled = false;
}

export function setPosterTimeout(ms) {
  posterTimeoutMs = ms;
}

export function resetPosterTimeout() {
  posterTimeoutMs = 10000;
}

export const fallback = {
  title: '',
  starts_at: '',
  location: '',
  note: 'Could not read the poster. Please type the details'
};

export async function readPosterService(userId, { image, mimeType } = {}) {
  // 1. Permission check: only organizer or admin
  const user = await findUserById(userId);
  if (!user || user.role === 'member') {
    throw new Error('You do not have permission');
  }

  // 2. Validation check: image/png or image/jpeg, max 4 MB
  const allowedMimes = ['image/png', 'image/jpeg'];
  if (!image || typeof image !== 'string' || !mimeType || !allowedMimes.includes(mimeType)) {
    throw new Error('Upload a PNG or JPEG image under 4 MB');
  }

  const byteLength = Buffer.byteLength(image, 'base64');
  if (byteLength > 4 * 1024 * 1024) {
    throw new Error('Upload a PNG or JPEG image under 4 MB');
  }

  // 3. Fallback if GEMINI_API_KEY is missing (model is not called)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  // 4. Call Gemini generateContent endpoint
  try {
    modelCalled = true;
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: image
              }
            },
            {
              text: 'Extract the event details from this poster. Respond ONLY with a JSON object containing keys "title", "starts_at" (in ISO 8601 format), and "location".'
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    const fetchFn = posterFetchStub || fetch;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(posterTimeoutMs)
    });

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText || typeof rawText !== 'string') {
      return fallback;
    }

    const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleanedText);

    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    const title = typeof parsed.title === 'string' ? parsed.title : '';
    let starts_at = '';
    if (typeof parsed.starts_at === 'string' && !isNaN(Date.parse(parsed.starts_at))) {
      starts_at = parsed.starts_at;
    }
    const location = typeof parsed.location === 'string' ? parsed.location : '';

    return {
      title,
      starts_at,
      location,
      note: ''
    };
  } catch (err) {
    return fallback;
  }
}
