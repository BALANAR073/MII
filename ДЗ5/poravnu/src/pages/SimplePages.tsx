import { Link } from 'react-router-dom';
import { StatusMessage } from '../components/ui/StatusMessage';

const BACK_LINK = (
  <Link to="/" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
    К моим группам
  </Link>
);

/** Заглушка `/join/:token`: вступление по ссылке требует входа, он появится с Supabase в ДЗ5 (FR-2.3). */
export function JoinPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <StatusMessage
        tone="empty"
        icon="🔗"
        title="Приглашение в группу"
        description="Вступление по ссылке заработает после подключения входа и бэкенда (ДЗ5). Сейчас приложение работает на демо-данных."
        action={BACK_LINK}
      />
    </div>
  );
}

/** Неизвестный адрес. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <StatusMessage tone="empty" icon="🧭" title="Страница не найдена" description="Возможно, ссылка устарела." action={BACK_LINK} />
    </div>
  );
}
