import { fireEvent, render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), social: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { sub: {}, subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks } }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: mocks.social } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import Auth from './Auth';

describe('Consent sign-in return handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/?next=' + encodeURIComponent('/.lovable/oauth/consent?authorization_id=request-123#grant'));
    mocks.signUp.mockResolvedValue({ error: null });
    mocks.social.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);
  it('sign-up sends verification back to the same consent request', async () => {
    const view = render(<Auth />);
    fireEvent.click(view.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(view.getByLabelText('Email'), { target: { value: 'recruiter@example.test' } });
    fireEvent.change(view.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.click(view.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledWith({ email: 'recruiter@example.test', password: 'test-password', options: { emailRedirectTo: window.location.origin + '/.lovable/oauth/consent?authorization_id=request-123#grant' } }));
  });
  it('Google returns through the public callback with the original consent URL', async () => {
    const view = render(<Auth />);
    fireEvent.click(view.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalled());
    const callback = new URL(mocks.social.mock.calls[0][1].redirect_uri);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('next')).toBe('/.lovable/oauth/consent?authorization_id=request-123#grant');
  });
  it('does not forward an external return target into Google sign-in', async () => {
    window.history.replaceState({}, '', '/?next=' + encodeURIComponent('/\\outside.invalid'));
    const view = render(<Auth />);
    fireEvent.click(view.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalled());
    expect(new URL(mocks.social.mock.calls[0][1].redirect_uri).searchParams.get('next')).toBe('/');
  });
});