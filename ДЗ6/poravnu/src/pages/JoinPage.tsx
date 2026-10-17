import { trackGoal } from '../lib/metrika';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getInvitePreview, joinGroup } from '../api';
import { useAuth } from '../app/AuthProvider';
import { useResource } from '../app/useResource';
import { Button } from '../components/ui/Button';
import { SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { PRIMARY_LINK } from '../components/ui/styles';
import { useToast } from '../components/ui/Toast';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { plural } from '../lib/russian';
import { ApiError } from '../types/api';

/**
 * Вступление по ссылке-приглашению (US-03, FR-2.3). Превью видно и гостю;
 * гость сначала входит, затем возвращается сюда и вступает (AC-03.3).
 */
export function JoinPage() {
  const { token = '' } = useParams();
  const { state: authState } = useAuth();
  const { state, reload } = useResource(`invite:${token}`, () => getInvitePreview(token));
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  if (state.status === 'loading' || authState.status === 'loading') {
    return <SkeletonList rows={1} label="Проверяем приглашение…" />;
  }
  if (state.status === 'error') {
    const invalid = state.error instanceof ApiError && state.error.kind === 'invalid-invite';
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <StatusMessage
          tone="error"
          title={invalid ? 'Приглашение недействительно' : 'Не удалось проверить приглашение'}
          description={invalid ? 'Попросите у друзей новую ссылку.' : apiErrorMessage(state.error, 'load')}
          action={
            invalid ? (
              <Link to="/" className={PRIMARY_LINK}>
                К моим группам
              </Link>
            ) : (
              <Button onClick={reload}>Повторить</Button>
            )
          }
        />
      </div>
    );
  }

  const { groupName, emoji, membersCount } = state.data;
  const next = encodeURIComponent(`/join/${token}`);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const groupId = await joinGroup(token);
      trackGoal('group_joined');
      showToast({ message: `Вы в группе «${groupName}»`, tone: 'success' });
      navigate(`/groups/${groupId}`, { replace: true });
    } catch (error) {
      showToast({ message: apiErrorMessage(error, 'save'), tone: 'error' });
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <p aria-hidden="true" className="text-5xl">
        {emoji}
      </p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Вас зовут в группу «{groupName}»</h1>
      <p className="mt-2 text-sm text-slate-600">
        Уже {membersCount} {plural(membersCount, ['участник', 'участника', 'участников'])}. В группе общие расходы и балансы — кто кому
        сколько должен.
      </p>
      <div className="mt-6">
        {authState.user === null ? (
          <div className="flex flex-col gap-2">
            <Link to={`/login?next=${next}`} className={PRIMARY_LINK}>
              Войти и вступить
            </Link>
            <Link to={`/register?next=${next}`} className="min-h-11 py-3 text-sm font-semibold text-emerald-800 underline">
              Зарегистрироваться
            </Link>
          </div>
        ) : (
          <Button pending={joining} onClick={() => void handleJoin()} className="w-full">
            Вступить
          </Button>
        )}
      </div>
    </div>
  );
}
