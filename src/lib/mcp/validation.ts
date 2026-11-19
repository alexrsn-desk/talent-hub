export function searchLiteral(value: string) { return value.replace(/[,%().\\_*]/g, ' ').trim(); }
export function assertSalaryRange(min?: number | null, max?: number | null) { if (min != null && max != null && min > max) throw new Error('Minimum salary must not exceed maximum salary'); }
export function assertContactable(row: { do_not_contact?: boolean; gdpr_deleted?: boolean; status?: string }) { if (row.do_not_contact || row.gdpr_deleted || row.status === 'Do Not Contact') throw new Error('This person cannot be contacted'); }
export function requireConfirmation(confirmed: boolean) { if (!confirmed) throw new Error('Show the recipient and exact message, then ask the user to confirm before sending'); }
