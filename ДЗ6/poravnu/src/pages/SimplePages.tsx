import { Link } from 'react-router-dom';
import { StatusMessage } from '../components/ui/StatusMessage';

const BACK_LINK = (
  <Link to="/" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
    К моим группам
  </Link>
);

/** Неизвестный адрес. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <StatusMessage tone="empty" icon="🧭" title="Страница не найдена" description="Возможно, ссылка устарела." action={BACK_LINK} />
    </div>
  );
}
