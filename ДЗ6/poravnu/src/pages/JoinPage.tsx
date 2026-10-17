import { trackGoal } from '../lib/metrika';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { claimMember, getInvitePreview, joinGroup } from '../api';
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
  /** Какое место занять: id участника без аккаунта или NEW_MEMBER — вступить новым участником (ДЗ6). */
  const [place, setPlace] = useState<string | null>(null);
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
              <Link to="/groups" className={PRIMARY_LINK}>
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

  const { groupName, emoji, membersCount, places } = state.data;
  const choice = place ?? (places.length > 0 ? null : NEW_MEMBER);
  const next = encodeURIComponent(`/join/${token}`);

  const handleJoin = async () => {
    if (choice === null) {
      showToast({ message: 'Выберите себя в списке или «Меня нет в списке»', tone: 'error' });
      return;
    }
    setJoining(true);
    try {
      const groupId = choice === NEW_MEMBER ? await joinGroup(token) : await claimMember(token, choice);
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
          <>
            {places.length > 0 && (
              <fieldset className="mb-4 text-left">
                <legend className="mb-2 text-sm font-medium text-slate-800">Кто вы в этой группе?</legend>
                <p className="mb-3 text-sm text-slate-600">
                  Участники ниже добавлены по имени. Выберите себя — все ваши расходы и долги перейдут в ваш аккаунт.
                </p>
                <div className="space-y-2">
                  {[
                    ...places.map((item) => ({ id: item.memberId, label: `Это я — ${item.name}` })),
                    { id: NEW_MEMBER, label: 'Меня нет в списке' },
                  ].map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50"
                    >
                      <input
                        type="radio"
                        name="join-place"
                        className="h-4 w-4 accent-emerald-700"
                        checked={choice === option.id}
                        onChange={() => setPlace(option.id)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Button pending={joining} onClick={() => void handleJoin()} className="w-full">
              Вступить
            </Button>
          </>
        )}
      </div>
      {authState.user === null && places.length > 0 && (
        <p className="mt-4 text-sm text-slate-600">Вас уже добавили по имени? После входа выберите себя — и увидите все свои расходы.</p>
      )}
    </div>
  );
}

/** Значение «вступить новым участником» в выборе места. */
const NEW_MEMBER = 'new';
