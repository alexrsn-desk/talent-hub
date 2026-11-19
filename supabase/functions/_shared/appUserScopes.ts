export const GOOGLE_MAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
];
export const MICROSOFT_OUTLOOK_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"];
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

export const CONNECTORS = {
  microsoft_outlook: { scopes: MICROSOFT_OUTLOOK_SCOPES, clientEnv: "MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY",
    extra: { domain_hint: "none", prompt: "select_account" } },
  google_mail: { scopes: GOOGLE_MAIL_SCOPES, clientEnv: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY", extra: {} },
  linkedin: { scopes: LINKEDIN_SCOPES, clientEnv: "LINKEDIN_APP_USER_CONNECTOR_CLIENT_API_KEY", extra: {} },
} as const;
export type ConnectorKey = keyof typeof CONNECTORS;
