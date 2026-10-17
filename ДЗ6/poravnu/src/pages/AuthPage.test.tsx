import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockAuth } from '../mocks/mockAuth';
import { renderApp, resetApi } from '../test/renderApp';

describe('вход, регистрация и защищённые маршруты (US-01, FR-1.1, FR-1.2)', () => {
  beforeEach(() => {
    resetApi();
    resetMockAuth(null);
  });

  it('без входа защищённый адрес ведёт на /login, после входа — обратно (AC-T1.3)', async () => {
    const { user } = renderApp('/groups/kazan');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'borya@poravnu.demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo-pass');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('heading', { name: /Поездка в Казань/ })).toBeInTheDocument();
  });

  it('неверный пароль — общий текст, без подсказки, что именно неверно (AC-01.3)', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'borya@poravnu.demo');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
  });

  it('регистрация проверяет имя, email и пароль до запроса (AC-T1.1)', async () => {
    const { user } = renderApp('/register');
    await user.type(await screen.findByLabelText('Email'), 'не-email');
    await user.type(screen.getByLabelText('Пароль'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(screen.getByText('Имя — от 1 до 40 символов')).toBeInTheDocument();
    expect(screen.getByText('Введите email, например anya@mail.ru')).toBeInTheDocument();
    expect(screen.getByText('Пароль — не короче 8 символов')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveFocus();
  });

  it('занятый email — понятная ошибка (AC-01.2), новый — вход сразу (AC-01.1)', async () => {
    const { user } = renderApp('/register');
    await user.type(await screen.findByLabelText('Имя'), 'Лёша');
    await user.type(screen.getByLabelText('Email'), 'anya@poravnu.demo');
    await user.type(screen.getByLabelText('Пароль'), 'long-password');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Этот email уже зарегистрирован');

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'lesha@poravnu.demo');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    expect(await screen.findByRole('heading', { name: 'Привет, Лёша!' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Попробовать на примере' })).toBeInTheDocument();
  });

  it('параметр next не уводит на чужой сайт (защита от open redirect)', async () => {
    const { user } = renderApp('/login?next=//evil.example/steal');
    await user.type(await screen.findByLabelText('Email'), 'borya@poravnu.demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo-pass');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('heading', { name: 'Привет, Боря!' })).toBeInTheDocument();
  });

  it('демо-аккаунт — вход одной кнопкой (ДЗ6)', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Войти как Аня' }));
    expect(await screen.findByRole('heading', { name: 'Привет, Аня!' })).toBeInTheDocument();
  });

  it('на регистрации демо-кнопок нет', async () => {
    renderApp('/register');
    await screen.findByLabelText('Имя');
    expect(screen.queryByRole('button', { name: 'Войти как Аня' })).not.toBeInTheDocument();
  });
});

describe('вступление по приглашению (US-03, FR-2.3)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('гость видит превью и кнопку входа (AC-03.3)', async () => {
    resetMockAuth(null);
    renderApp('/join/kzn-2026');
    expect(await screen.findByRole('heading', { name: 'Вас зовут в группу «Поездка в Казань»' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти и вступить' })).toHaveAttribute('href', '/login?next=%2Fjoin%2Fkzn-2026');
  });

  it('вошедший вступает и попадает в группу (AC-03.2)', async () => {
    resetMockAuth('anya');
    const { user } = renderApp('/join/flat-lenina');
    await user.click(await screen.findByRole('button', { name: 'Вступить' }));
    // Вступление + загрузка группы — два ответа mock-API подряд; под нагрузкой CI это дольше 1 с по умолчанию.
    expect(await screen.findByRole('heading', { name: /Квартира на Ленина/ }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('недействительная ссылка — сообщение и путь к своим группам (AC-03.4)', async () => {
    renderApp('/join/old-token');
    expect(await screen.findByText('Приглашение недействительно')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К моим группам' })).toBeInTheDocument();
  });
});
