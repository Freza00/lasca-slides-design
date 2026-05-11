export function withSessionHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);

  if (typeof window === 'undefined') {
    return nextHeaders;
  }

  const token = window.localStorage.getItem('lasca-session');
  if (token && !nextHeaders.has('Authorization')) {
    nextHeaders.set('Authorization', `Bearer ${token}`);
  }

  return nextHeaders;
}
