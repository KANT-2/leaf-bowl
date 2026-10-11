'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Leaf, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { submitAdminAuth } from '@/lib/admin/auth-client';
import './auth.css';

export default function AdminAuthScreen({ mode }: { mode: 'login' | 'logout' }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const login = mode === 'login';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await submitAdminAuth(mode, login ? { loginId: loginId.trim(), password } : undefined);
      setPassword('');
      if (login) {
        // Full navigation discards any previously cached administrator page and credentials.
        window.location.replace('/admin');
      } else {
        setComplete(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해주세요.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <main className="admin-auth-shell">
    <section className="admin-auth-story" aria-label="leaf & bowl 관리자 공간">
      <Link href="/" className="brand admin-auth-brand">leaf &amp; bowl</Link>
      <div className="admin-auth-story-copy"><span className="eyebrow">A LITTLE CARE, EVERY DAY</span>
        <h2>신선한 한 끼를 위한<br />작은 관리 공간.</h2>
        <p>메뉴부터 고객의 이야기까지,<br />매장의 하루를 차근차근 관리하세요.</p>
        <div className="admin-auth-leaf" aria-hidden="true"><Leaf strokeWidth={1} /></div>
      </div>
      <p className="admin-auth-story-footer">매일의 신선함을 함께 만듭니다.</p>
    </section>
    <section className="admin-auth-main" aria-labelledby="admin-auth-title">
      <div className="admin-auth-card">
        <span className="admin-auth-icon" aria-hidden="true">{login ? <LockKeyhole /> : complete ? <ShieldCheck /> : <LogOut />}</span>
        <div className="eyebrow">LEAF &amp; BOWL ADMIN</div>
        <h1 id="admin-auth-title">{login ? '관리자 로그인' : complete ? '로그아웃되었습니다' : '로그아웃할까요?'}</h1>
        <p className="muted">{login ? '관리자 계정으로 로그인해주세요.' : complete ? '매장을 위한 오늘의 관리도 수고하셨습니다.' : '관리자 작업을 마치고 현재 접속을 종료합니다. 저장하지 않은 내용은 먼저 확인해주세요.'}</p>
        {complete ? <div className="admin-auth-actions"><Button asChild size="lg"><Link href="/admin/login" prefetch={false}>다시 로그인</Link></Button><Link href="/" className="admin-auth-back">고객 페이지로 이동</Link></div> : <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="admin-auth-fields">
            {login && <>
              <label className="field" htmlFor="admin-login-id">아이디<Input id="admin-login-id" name="loginId" type="text" autoComplete="username" required maxLength={50} placeholder="관리자 아이디" value={loginId} onChange={e => setLoginId(e.target.value)} /></label>
              <label className="field" htmlFor="admin-password">비밀번호<div className="admin-auth-password"><Input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={200} placeholder="비밀번호를 입력해주세요" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            </>}
            {error && <p className="admin-auth-error" role="alert">{error}</p>}
            <Button type="submit" size="lg" className="admin-auth-submit">{busy ? (login ? '로그인 중…' : '로그아웃 중…') : (login ? '로그인' : '로그아웃')}</Button>
          </fieldset>
          <p className="admin-auth-status" role="status" aria-live="polite">{busy ? '요청을 처리하고 있습니다.' : ''}</p>
          {login ? <p className="admin-auth-help">계정이 없거나 접속이 어려우면<br />매장 관리자에게 문의해주세요.</p> : <Link href="/admin" className="admin-auth-back" aria-disabled={busy} onClick={e => { if (busy) e.preventDefault(); }}><ArrowLeft size={16} />관리자로 돌아가기</Link>}
        </form>}
        {login && <Link href="/" className="admin-auth-back"><ArrowLeft size={16} />고객 페이지로 돌아가기</Link>}
      </div>
    </section>
  </main>;
}
