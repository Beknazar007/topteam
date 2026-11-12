import { Navigate, useParams } from 'react-router-dom';
import { pendingInvite } from '../../lib/auth';

/** /join/:code — QR на стене зала. Код запоминаем и применяем после входа на онбординге. */
export function JoinPage() {
  const { code } = useParams();
  if (code) pendingInvite.set(code); // идемпотентно
  return <Navigate to="/onboarding" replace />;
}
