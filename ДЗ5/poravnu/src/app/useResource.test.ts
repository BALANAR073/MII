import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResource } from './useResource';

describe('useResource', () => {
  it('проходит loading → success', async () => {
    const { result } = renderHook(() => useResource('k', () => Promise.resolve(42)));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 42 }));
  });

  it('при первой загрузке с ошибкой переходит в error, а reload загружает снова', async () => {
    const loader = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('сеть')).mockResolvedValueOnce(7);
    const { result } = renderHook(() => useResource('k', loader));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 7 }));
  });

  it('ошибка фонового обновления сохраняет данные и поднимает refreshFailed (находка 2 AI-ревью)', async () => {
    const loader = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('сеть'));
    const { result } = renderHook(() => useResource('k', loader));
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.refreshFailed).toBe(true));
    expect(result.current.state).toEqual({ status: 'success', data: 1 });
  });

  it('отбрасывает ответ устаревшего запроса при смене ключа', async () => {
    let resolveOld: (value: string) => void = () => undefined;
    const old = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    const { result, rerender } = renderHook(({ id }) => useResource(id, () => (id === 'old' ? old : Promise.resolve('new'))), {
      initialProps: { id: 'old' },
    });
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', data: 'new' }));
    await act(async () => {
      resolveOld('old');
      await old;
    });
    expect(result.current.state).toEqual({ status: 'success', data: 'new' });
  });
});
