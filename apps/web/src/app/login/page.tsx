import { isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  if(await isAdmin())redirect('/');
  const {error}=await searchParams;
  return <main className="login-view"><div className="login-card"><div className="brand small"><span className="brand-mark">E</span><span>EST <strong>ASSET CLOUD</strong></span></div><div className="login-symbol">◈</div><h1>Private workspace</h1><p>Secure publishing dashboard for Roblox creator and group assets.</p><form action="/api/auth/login" method="post"><label htmlFor="password">Dashboard password</label><input id="password" type="password" name="password" autoComplete="current-password" required minLength={8} placeholder="Enter your password"/><button className="primary" type="submit">Unlock dashboard →</button>{error && <p className="error">{error==='rate'?'Too many attempts; try again later.':'Incorrect password.'}</p>}</form><div className="security-note">API keys remain in Railway server-side environment variables.</div></div></main>
}
