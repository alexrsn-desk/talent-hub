import { describe, expect, it, vi } from 'vitest';
import { decideAuthorization, loadAuthorization, type OAuthAPI } from './oauth-consent';
import { oauthCallbackUrl, oauthReturnPath } from './oauth-return-path';

function api(): OAuthAPI {
  return {
    getAuthorizationDetails: vi.fn().mockResolvedValue({ data: { client: { name: 'Claude' }, scope: 'openid email profile' }, error: null }),
    approveAuthorization: vi.fn().mockResolvedValue({ data: { redirect_url: 'https://claude.ai/callback?code=approved' }, error: null }),
    denyAuthorization: vi.fn().mockResolvedValue({ data: { redirect_to: 'https://claude.ai/callback?error=access_denied' }, error: null }),
  };
}
describe('Recruiter OAuth consent', () => {
  it('loads the client for the original authorization ID', async () => {
    const provider = api();
    const result = await loadAuthorization('request-123', provider);
    expect(provider.getAuthorizationDetails).toHaveBeenCalledWith('request-123');
    expect(result.details?.client?.name).toBe('Claude');
    expect(result.redirect).toBeNull();
  });
  it('approves only the requested authorization and returns the provider redirect', async () => {
    const provider = api();
    expect(await decideAuthorization('request-123', true, provider)).toBe('https://claude.ai/callback?code=approved');
    expect(provider.approveAuthorization).toHaveBeenCalledWith('request-123');
    expect(provider.denyAuthorization).not.toHaveBeenCalled();
  });
  it('denies without approving and preserves the cancellation redirect', async () => {
    const provider = api();
    expect(await decideAuthorization('request-123', false, provider)).toBe('https://claude.ai/callback?error=access_denied');
    expect(provider.denyAuthorization).toHaveBeenCalledWith('request-123');
    expect(provider.approveAuthorization).not.toHaveBeenCalled();
  });
  it('returns an immediate redirect for an already-authorized client', async () => {
    const provider = api();
    vi.mocked(provider.getAuthorizationDetails).mockResolvedValue({ data: { redirect_to: 'https://claude.ai/callback?code=existing' }, error: null });
    expect(await loadAuthorization('existing', provider)).toEqual({ redirect: 'https://claude.ai/callback?code=existing', details: null });
  });
  it('rejects a missing authorization without contacting the provider', async () => {
    const provider = api();
    await expect(loadAuthorization('', provider)).rejects.toThrow('missing');
    expect(provider.getAuthorizationDetails).not.toHaveBeenCalled();
  });
  it('reports expired authorization requests', async () => {
    const provider = api();
    vi.mocked(provider.getAuthorizationDetails).mockResolvedValue({ data: null, error: { message: 'Authorization expired' } });
    await expect(loadAuthorization('expired', provider)).rejects.toThrow('Authorization expired');
  });
  it.each([true, false])('keeps failed decision %s recoverable', async approve => {
    const provider = api();
    vi.mocked(approve ? provider.approveAuthorization : provider.denyAuthorization).mockResolvedValue({ data: null, error: { message: 'Provider unavailable' } });
    await expect(decideAuthorization('request-123', approve, provider)).rejects.toThrow('Provider unavailable');
  });
  it('rejects a successful decision without a return address', async () => {
    const provider = api();
    vi.mocked(provider.approveAuthorization).mockResolvedValue({ data: {}, error: null });
    await expect(decideAuthorization('request-123', true, provider)).rejects.toThrow('No return address');
  });
  it('carries the consent ID and fragment through a public social callback', () => {
    const next = oauthReturnPath('/.lovable/oauth/consent?authorization_id=request-123#grant');
    const callback = new URL(oauthCallbackUrl('https://desky.example', next));
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('next')).toBe('/.lovable/oauth/consent?authorization_id=request-123#grant');
  });
});