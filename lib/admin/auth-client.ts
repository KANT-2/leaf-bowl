/** Frontend adapter for the backend identity endpoints. No client-side session is created. */
export async function submitAdminAuth(action: 'login' | 'logout', credentials?: { loginId: string; password: string }) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/v1/auth/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(action === 'login' ? credentials : {}),
      signal: controller.signal,
    });
    if ([404, 405, 501].includes(response.status)) {
      throw new Error('관리자 인증 서비스가 아직 연결되지 않았습니다. 담당자에게 연결 상태를 확인해주세요.');
    }
    if (!response.ok) {
      if (response.status === 401 && action === 'login') throw new Error('아이디 또는 비밀번호를 확인해주세요.');
      if (response.status === 429) throw new Error('요청이 많습니다. 잠시 후 다시 시도해주세요.');
      if (response.status === 401 && action === 'logout') return; // The session is already absent or expired.
      throw new Error(action === 'login' ? '로그인하지 못했습니다. 잠시 후 다시 시도해주세요.' : '로그아웃하지 못했습니다. 다시 시도해주세요.');
    }
    // A missing endpoint can return an HTML page with status 200 through a fallback.
    if (response.status !== 204 && !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('관리자 인증 서비스 응답을 확인할 수 없습니다. 담당자에게 문의해주세요.');
    }
  } catch (error) {
    if (error instanceof TypeError) throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해주세요.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
