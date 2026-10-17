import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { cx } from '../../lib/cx';
import type { ExpenseInput } from '../../types/api';
import type { Member } from '../../types/group';
import {
  validateExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormField,
  type ExpenseFormValues,
  type SplitMode,
} from './expenseFormModel';
import { FOCUS_RING } from '../../components/ui/styles';
import { handleRovingKeyDown } from '../../components/ui/roving';
import { EXPENSE_CATEGORIES, guessCategory } from '../../lib/categories';

interface ExpenseFormProps {
  initialValues: ExpenseFormValues;
  activeMembers: readonly Member[];
  submitLabel: string;
  pending?: boolean;
  onSubmit: (input: ExpenseInput) => void;
  onCancel: () => void;
}

const FIELD_ORDER: readonly ExpenseFormField[] = ['title', 'amount', 'members', 'weights', 'date'];
const SPLIT_MODES: readonly SplitMode[] = ['equal', 'shares'];

/**
 * Форма расхода (FR-3.2–3.4). Проверка — при потере фокуса и при отправке;
 * кнопка всегда активна, при ошибке фокус уходит на первое ошибочное поле (раздел 6 ТЗ).
 */
export function ExpenseForm({ initialValues, activeMembers, submitLabel, pending = false, onSubmit, onCancel }: ExpenseFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<ExpenseFormField, boolean>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const fieldId = (field: string) => `${id}-${field}`;

  const update = (patch: Partial<ExpenseFormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    // Уже показанную ошибку убираем сразу, как только значение стало верным.
    const result = validateExpenseForm(next, activeMembers);
    setErrors((current) => pickVisible(result.ok ? {} : result.errors, current));
  };

  const handleBlur = (field: ExpenseFormField) => {
    setTouched((current) => ({ ...current, [field]: true }));
    const result = validateExpenseForm(values, activeMembers);
    setErrors((current) => ({ ...current, [field]: result.ok ? undefined : result.errors[field] }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateExpenseForm(values, activeMembers);
    if (!result.ok) {
      setErrors(result.errors);
      setTouched({ title: true, amount: true, members: true, weights: true, date: true });
      const firstInvalid = FIELD_ORDER.find((field) => result.errors[field] !== undefined);
      if (firstInvalid !== undefined) {
        formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus();
      }
      return;
    }
    onSubmit(result.input);
  };

  const errorFor = (field: ExpenseFormField) => (touched[field] === true ? errors[field] : undefined);
  const describedBy = (field: ExpenseFormField) => (errorFor(field) === undefined ? undefined : fieldId(`${field}-error`));

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-5">
      <Field label="Название" htmlFor={fieldId('title')} error={errorFor('title')} errorId={fieldId('title-error')}>
        <input
          id={fieldId('title')}
          data-field="title"
          className={inputClass(errorFor('title'))}
          value={values.title}
          maxLength={80}
          placeholder="Например, Хостел"
          autoComplete="off"
          aria-invalid={errorFor('title') !== undefined}
          aria-describedby={describedBy('title')}
          onChange={(event) => update({ title: event.target.value })}
          onBlur={() => handleBlur('title')}
        />
      </Field>

      <CategoryPicker
        value={values.category}
        guessed={values.category === '' ? guessCategory(values.title) : null}
        onChange={(category) => update({ category })}
      />

      <Field label="Сумма, ₽" htmlFor={fieldId('amount')} error={errorFor('amount')} errorId={fieldId('amount-error')}>
        <input
          id={fieldId('amount')}
          data-field="amount"
          className={inputClass(errorFor('amount'), 'block w-full tabular-nums')}
          value={values.amount}
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          aria-invalid={errorFor('amount') !== undefined}
          aria-describedby={describedBy('amount')}
          onChange={(event) => update({ amount: event.target.value })}
          onBlur={() => handleBlur('amount')}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Кто платил" htmlFor={fieldId('payer')}>
          <select
            id={fieldId('payer')}
            className={inputClass(undefined)}
            value={values.payerId}
            onChange={(event) => update({ payerId: event.target.value })}
          >
            {activeMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Дата" htmlFor={fieldId('date')} error={errorFor('date')} errorId={fieldId('date-error')}>
          <input
            id={fieldId('date')}
            data-field="date"
            type="date"
            className={inputClass(errorFor('date'))}
            value={values.date}
            aria-invalid={errorFor('date') !== undefined}
            aria-describedby={describedBy('date')}
            onChange={(event) => update({ date: event.target.value })}
            onBlur={() => handleBlur('date')}
          />
        </Field>
      </div>

      <fieldset aria-describedby={[describedBy('members'), describedBy('weights')].filter(Boolean).join(' ') || undefined}>
        <legend className="mb-2 text-sm font-medium text-slate-800">Как делим</legend>
        <div role="radiogroup" aria-label="Способ деления" className="mb-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          {SPLIT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={values.mode === mode}
              tabIndex={values.mode === mode ? 0 : -1}
              className={cx(
                'min-h-11 rounded-lg text-sm font-medium transition',
                FOCUS_RING,
                values.mode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              )}
              onClick={() => update({ mode })}
              onKeyDown={(event) => handleRovingKeyDown(event, SPLIT_MODES, values.mode, (next) => update({ mode: next }))}
            >
              {mode === 'equal' ? 'Поровну' : 'По долям'}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {activeMembers.map((member, index) => {
            const checked = values.selected[member.id] === true;
            return (
              <li key={member.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  id={fieldId(`member-${member.id}`)}
                  type="checkbox"
                  data-field={index === 0 ? 'members' : undefined}
                  className="h-5 w-5 rounded border-slate-300 accent-emerald-700"
                  checked={checked}
                  onChange={(event) => update({ selected: { ...values.selected, [member.id]: event.target.checked } })}
                  onBlur={() => handleBlur('members')}
                />
                <label htmlFor={fieldId(`member-${member.id}`)} className="flex-1 py-2 text-sm text-slate-800">
                  {member.name}
                </label>
                {values.mode === 'shares' && (
                  <input
                    aria-label={`Доля: ${member.name}`}
                    aria-invalid={checked && errorFor('weights') !== undefined}
                    aria-describedby={checked ? describedBy('weights') : undefined}
                    data-field={index === 0 ? 'weights' : undefined}
                    className={inputClass(checked ? errorFor('weights') : undefined, 'w-20 text-center tabular-nums')}
                    inputMode="numeric"
                    disabled={!checked}
                    value={values.weights[member.id] ?? ''}
                    onChange={(event) => update({ weights: { ...values.weights, [member.id]: event.target.value } })}
                    onBlur={() => handleBlur('weights')}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {errorFor('members') !== undefined && (
          <p id={fieldId('members-error')} className="mt-2 text-sm text-rose-700">
            {errorFor('members')}
          </p>
        )}
        {errorFor('weights') !== undefined && (
          <p id={fieldId('weights-error')} className="mt-2 text-sm text-rose-700">
            {errorFor('weights')}
          </p>
        )}
      </fieldset>

      {/* Кнопки прилипают к низу: на телефоне «Сохранить» не должна уходить за край экрана (баг 4). */}
      <div className="sticky -bottom-4 -mx-4 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:px-0 sm:pb-0">
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface CategoryPickerProps {
  value: string;
  /** Категория, подобранная по названию, пока пользователь не выбрал свою. */
  guessed: string | null;
  onChange: (category: string) => void;
}

/** Категория расхода (ДЗ6): кнопки-чипы; повторное нажатие снимает выбор — тогда категория подбирается по названию. */
function CategoryPicker({ value, guessed, onChange }: CategoryPickerProps) {
  const active = value !== '' ? value : guessed;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-800">
        Категория {value === '' && guessed !== null && <span className="font-normal text-slate-500">· подобрана по названию</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {EXPENSE_CATEGORIES.map((category) => {
          const selected = active === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={selected}
              className={cx(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition',
                FOCUS_RING,
                selected
                  ? 'border-emerald-700 bg-emerald-50 font-medium text-emerald-900'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50',
              )}
              onClick={() => onChange(value === category.id ? '' : category.id)}
            >
              <span aria-hidden="true">{category.emoji}</span>
              {category.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, error, errorId, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Классы поля ввода. Ширину передаём отдельно: если к `w-full` дописать `w-20`,
 * в CSS побеждает `w-full`, и поле доли растягивалось на всю строку (баг 9).
 */
function inputClass(error: string | undefined, sizeClass = 'block w-full'): string {
  return cx(
    'min-h-11 rounded-xl border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400',
    sizeClass,
    'focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:bg-slate-100 disabled:text-slate-400',
    error === undefined ? 'border-slate-300' : 'border-rose-500',
  );
}

function pickVisible(next: ExpenseFormErrors, current: ExpenseFormErrors): ExpenseFormErrors {
  // Новые ошибки не показываем до потери фокуса — только обновляем или снимаем уже видимые.
  const visible: ExpenseFormErrors = {};
  for (const field of FIELD_ORDER) {
    if (current[field] !== undefined && next[field] !== undefined) {
      visible[field] = next[field];
    }
  }
  return visible;
}
