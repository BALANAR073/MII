import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { Button } from '../components/ui/Button';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { cx } from '../lib/cx';
import { trackGoal } from '../lib/metrika';
import { safeNext } from '../lib/safeNext';
import type { OAuthProvider } from '../types/api';

interface AuthPageProps {
  mode: 'login' | 'register';
}

type Field = 'name' | 'email' | 'password';
type Errors = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDER_LABELS: Record<OAuthProvider, string> = { google: 'Google' };

/**
 * Вход и регистрация (US-01, FR-1.1). После успеха — возврат на адрес из `next` (AC-T1.3).
 * Ошибка входа не раскрывает, что именно неверно (FR-1.3).
 */
export function AuthPage({ mode }: AuthPageProps) {
  const { state, signIn, signUp, oauthProviders, signInWithOAuth } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = useId();
  const isRegister = mode === 'register';
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [redirecting, setRedirecting] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    let active = true;
    void oauthProviders().then((list) => {
      if (active) {
        setProviders(list);
      }
    });
    return () => {
      active = false;
    };
  }, [oauthProviders]);

  if (state.status === 'ready' && state.user !== null && !pending) {
    return <Navigate to={next} replace />;
  }

  const validate = (): Errors => {
    const result: Errors = {};
    if (isRegister) {
      const name = values.name.trim();
      if (name.length < 1 || name.length > 40) {
        result.name = 'Имя — от 1 до 40 символов';
      }
    }
    if (!EMAIL_PATTERN.test(values.email.trim())) {
      result.email = 'Введите email, например anya@mail.ru';
    }
    if (values.password.length < 8) {
      result.password = 'Пароль — не короче 8 символов';
    }
    return result;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    const first = (['name', 'email', 'password'] as const).find((field) => found[field] !== undefined);
    if (first !== undefined) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setPending(true);
    try {
      if (isRegister) {
        await signUp(values.email, values.password, values.name);
        trackGoal('sign_up');
      } else {
        await signIn(values.email, values.password);
        trackGoal('login');
      }
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(apiErrorMessage(error, 'save'));
    } finally {
      setPending(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setFormError(null);
    setRedirecting(provider);
    trackGoal('oauth_start');
    try {
      await signInWithOAuth(provider, next);
    } catch (error) {
      setFormError(apiErrorMessage(error, 'save'));
      setRedirecting(null);
    }
  };

  const field = (name: Field, label: string, type: string, autoComplete: string) => (
    <div>
      <label htmlFor={`${id}-${name}`} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={`${id}-${name}`}
        type={type}
        autoComplete={autoComplete}
        value={values[name]}
        aria-invalid={errors[name] !== undefined}
        aria-describedby={errors[name] === undefined ? undefined : `${id}-${name}-error`}
        className={cx(
          'block min-h-11 w-full rounded-xl border bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700',
          errors[name] === undefined ? 'border-slate-300' : 'border-rose-500',
        )}
        onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
      />
      {errors[name] !== undefined && (
        <p id={`${id}-${name}-error`} className="mt-1 text-sm text-rose-700">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">{isRegister ? 'Регистрация' : 'Вход'}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {isRegister ? 'Создайте аккаунт, чтобы делить расходы с друзьями.' : 'Войдите, чтобы увидеть свои группы.'}
      </p>
      {params.get('reason') === 'expired' && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Сессия истекла, войдите снова
        </p>
      )}
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        {isRegister && field('name', 'Имя', 'text', 'name')}
        {field('email', 'Email', 'email', 'email')}
        {field('password', 'Пароль', 'password', isRegister ? 'new-password' : 'current-password')}
        {formError !== null && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {formError}
          </p>
        )}
        <Button type="submit" pending={pending} className="w-full">
          {isRegister ? 'Создать аккаунт' : 'Войти'}
        </Button>
      </form>
      {providers.length > 0 && (
        <div className="mt-6">
          <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
            или
          </p>
          <div className="mt-4 space-y-3">
            {providers.map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="secondary"
                pending={redirecting === provider}
                className="w-full"
                onClick={() => void handleOAuth(provider)}
              >
                Войти через {PROVIDER_LABELS[provider]}
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-slate-600">
        {isRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
        <Link
          to={`${isRegister ? '/login' : '/register'}${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}
          className="font-semibold text-emerald-800 underline"
        >
          {isRegister ? 'Войти' : 'Зарегистрироваться'}
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-slate-500">
        Продолжая, вы соглашаетесь с{' '}
        <Link to="/privacy" className="underline">
          политикой конфиденциальности
        </Link>
      </p>
    </div>
  );
}
