import { describe,it,expect } from 'vitest';
import { assertContactable,requireConfirmation,assertSalaryRange,searchLiteral } from './validation';
import { oauthReturnPath } from '../oauth-return-path';
describe('Claude safeguards',()=>{
 it('hard blocks Do Not Contact outreach',()=>expect(()=>assertContactable({do_not_contact:true})).toThrow());
 it('hard blocks GDPR deleted outreach',()=>expect(()=>assertContactable({gdpr_deleted:true})).toThrow());
 it('requires confirmation to send',()=>{expect(()=>requireConfirmation(false)).toThrow();expect(()=>requireConfirmation(true)).not.toThrow();});
 it('rejects an inverted salary range',()=>expect(()=>assertSalaryRange(80000,60000)).toThrow());
 it('cannot add filter syntax via search',()=>expect(searchLiteral('Alex,status.eq.Active')).toBe('Alex status eq Active'));
 it('preserves the consent request and fragment',()=>expect(oauthReturnPath('/.lovable/oauth/consent?authorization_id=abc#request')).toBe('/.lovable/oauth/consent?authorization_id=abc#request'));
 it.each(['//outside.invalid','/\\outside.invalid','/\nunsafe','https://outside.invalid'])('rejects unsafe return %s',value=>expect(oauthReturnPath(value)).toBe('/'));
});
