const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Live payments aren't set up yet. Complete go-live in the Payments tab to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-center text-sm text-foreground">
        Payments in the preview are in test mode — use card 4242 4242 4242 4242.{" "}
        <a href="https://docs.lovable.dev/features/payments#test-and-live-environments" target="_blank" rel="noopener noreferrer" className="underline font-medium">Read more</a>
      </div>
    );
  }
  return null;
}
