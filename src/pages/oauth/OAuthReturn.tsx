import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed", reason?: string) => {
      window.opener?.postMessage({ type, connectorId: params.get("connector_id"), reason }, window.location.origin);
      window.close();
    };
    if (params.get("success") !== "true") { setMessage(params.get("error") ?? "Connection did not complete."); notify("appUserConnectorOAuthFailed"); return; }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        const reason = "This connection can't be used yet: a workspace admin must enable offline access on the connector client.";
        setMessage(reason);
        window.opener?.postMessage({ type: "appUserConnectorOAuthFailed", connectorId: params.get("connector_id"), reason }, window.location.origin);
        return;
      }
      setMessage("Connection completed without a code."); notify("appUserConnectorOAuthFailed"); return;
    }
    void supabase.functions.invoke("app-connections", { body: { action: "complete", code } })
      .then(({ error }) => { if (error) throw error; notify("appUserConnectorOAuthComplete"); })
      .catch(() => { setMessage("Could not finish the connection."); notify("appUserConnectorOAuthFailed"); });
  }, []);
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">{message}</div>;
}
