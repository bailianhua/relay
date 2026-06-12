import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function AuthCallbackPage() {
  const [params] = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      window.location.href = "/";
      return;
    }
    // Full browser redirect to API — avoids React StrictMode double-invoking the effect
    // and consuming the one-time OAuth code twice.
    window.location.href = `/api/auth/callback?code=${encodeURIComponent(code)}`;
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Authenticating…
    </div>
  );
}
