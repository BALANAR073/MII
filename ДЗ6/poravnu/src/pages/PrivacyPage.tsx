import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PrivacySectionProps {
  title: string;
  children: ReactNode;
}

/** Дата последней редакции политики — меняется вместе с текстом. */
const REVISION_DATE = '17 октября 2026';
const REPOSITORY_URL = 'https://github.com/BALANAR073/MII';

/**
 * Политика конфиденциальности (ДЗ6). Страница открыта без входа: на неё ссылаются экран согласия Google OAuth
 * и форма входа. Текст описывает фактическое поведение кода: какие данные хранит Supabase, что получаем от Google,
 * что уходит в Яндекс.Метрику и в журналы ошибок (152-ФЗ, ст. 18.1 — опубликованная политика обработки данных).
 */
export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 text-slate-800">
      <h1 className="text-2xl font-semibold text-slate-900">Политика конфиденциальности</h1>
      <p className="mt-2 text-sm text-slate-600">
        Сервис «ПоРовну» — учебный проект (КАИ, дисциплина «Методы искусственного интеллекта»). Редакция от {REVISION_DATE} г.
      </p>

      <PrivacySection title="Какие данные мы храним">
        <ul className="list-disc space-y-1 pl-5">
          <li>email и имя, которое вы указали при регистрации или получили от Google;</li>
          <li>группы, расходы и переводы, которые вы и участники ваших групп записали в сервис.</li>
        </ul>
        <p>Пароль хранится только в виде хеша в Supabase Auth — мы его не видим.</p>
      </PrivacySection>

      <PrivacySection title="Вход через Google">
        <p>
          При входе через Google сервис получает только ваш email, имя и аватар (стандартные разрешения <code>email</code> и{' '}
          <code>profile</code>). Доступа к почте, диску, контактам и другим данным Google у сервиса нет.
        </p>
      </PrivacySection>

      <PrivacySection title="Кто видит ваши данные">
        <p>
          Данные группы видят только её участники — это проверяет база данных (политики доступа Row Level Security), а не только
          интерфейс. Email других участников не показывается. Мы не продаём и не передаём данные третьим лицам, кроме
          перечисленных ниже сервисов, без которых сайт не работает.
        </p>
      </PrivacySection>

      <PrivacySection title="Сервисы, которые обрабатывают данные">
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase (дата-центр во Франкфурте, ЕС) — база данных и вход;</li>
          <li>Vercel — размещение сайта и журналы ошибок;</li>
          <li>Google — только если вы выбрали вход через Google;</li>
          <li>
            Яндекс.Метрика — обезличенная статистика посещений и действий (например, «добавлен расход»). Суммы, имена, названия
            групп и ссылки-приглашения в Метрику не передаются, запись экрана (Вебвизор) выключена.
          </li>
        </ul>
      </PrivacySection>

      <PrivacySection title="Журналы ошибок">
        <p>
          Если в браузере происходит ошибка, на сервер уходит её код и текст. Перед записью из текста удаляются email, токены и
          параметры адреса.
        </p>
      </PrivacySection>

      <PrivacySection title="Cookies и хранилище браузера">
        <p>
          Сайт хранит в браузере данные сессии входа. Яндекс.Метрика использует собственные cookies для подсчёта посещений —
          их можно запретить в настройках браузера, сайт продолжит работать.
        </p>
      </PrivacySection>

      <PrivacySection title="Удаление данных и вопросы">
        <p>
          Чтобы удалить аккаунт и все свои данные или задать вопрос об их обработке, создайте обращение в{' '}
          <a href={`${REPOSITORY_URL}/issues`} className="font-semibold text-emerald-800 underline" rel="noreferrer" target="_blank">
            репозитории проекта
          </a>
          . Запрос выполняется в течение 30 дней.
        </p>
      </PrivacySection>

      <p className="mt-8">
        <Link to="/login" className="font-semibold text-emerald-800 underline">
          Вернуться ко входу
        </Link>
      </p>
    </article>
  );
}

function PrivacySection({ title, children }: PrivacySectionProps) {
  return (
    <section className="mt-6 space-y-2 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
