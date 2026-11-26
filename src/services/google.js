let googleUserStub = null;
let googleAuthUrlStub = null;

export function setGoogleStubs(userStub, urlStub) {
  googleUserStub = userStub;
  googleAuthUrlStub = urlStub;
}

export function getRedirectUri() {
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error('PUBLIC_BASE_URL is not set');
  }
  return `${baseUrl.replace(/\/$/, '')}/auth/google/callback`;
}

export function getGoogleAuthUrl(state) {
  if (googleAuthUrlStub) {
    return googleAuthUrlStub(state);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email profile',
    state: state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function getGoogleUser(code) {
  if (googleUserStub) {
    return await googleUserStub(code);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to exchange authorization code for token');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!userRes.ok) {
    throw new Error('Failed to fetch user info from Google');
  }

  const userData = await userRes.json();
  return {
    googleId: userData.sub,
    email: userData.email,
    verified: Boolean(userData.email_verified)
  };
}
