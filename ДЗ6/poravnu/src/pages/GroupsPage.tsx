import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useToast } from '../components/ui/Toast';
import { CreateGroupDialog } from '../features/groups/CreateGroupDialog';
import { GroupList } from '../features/groups/GroupList';
import { useGroups } from '../features/groups/useGroups';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { IS_SUPABASE } from '../api';
import { resetMockDb } from '../mocks/mockApi';

/** Экран «Мои группы» (US-02): список, создание группы, состояния загрузки (NFR-9). */
export function GroupsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const { state, reload } = useGroups(refreshKey);
  const navigate = useNavigate();
  const { showToast } = useToast();

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-6 sm:px-0">
        <h1 className="text-2xl font-semibold text-slate-900">Мои группы</h1>
        <Button onClick={() => setCreating(true)}>Создать группу</Button>
      </div>

      {state.status === 'loading' && <SkeletonList rows={3} label="Загружаем группы…" />}
      {state.status === 'error' && (
        <StatusMessage
          tone="error"
          title="Не удалось загрузить группы"
          description={apiErrorMessage(state.error, 'load')}
          action={<Button onClick={reload}>Повторить</Button>}
        />
      )}
      {state.status === 'success' &&
        (state.data.length === 0 ? (
          <StatusMessage
            tone="empty"
            icon="👋"
            title="У вас пока нет групп"
            description="Создайте первую группу или попросите ссылку-приглашение у друзей."
            action={<Button onClick={() => setCreating(true)}>Создать группу</Button>}
          />
        ) : (
          <GroupList groups={state.data} />
        ))}

      {!IS_SUPABASE && (
        <p className="mt-8 px-4 text-center text-xs text-slate-500 sm:px-0">
          Демо на mock-данных: всё хранится в этом браузере.{' '}
          <button
            type="button"
            className="font-medium text-slate-700 underline"
            onClick={() => {
              resetMockDb();
              setRefreshKey((key) => key + 1);
              showToast({ message: 'Демо-данные восстановлены' });
            }}
          >
            Сбросить демо-данные
          </button>
        </p>
      )}

      {creating && (
        <CreateGroupDialog
          onClose={() => setCreating(false)}
          onCreated={(group) => {
            setCreating(false);
            navigate(`/groups/${group.id}`);
          }}
        />
      )}
    </div>
  );
}
