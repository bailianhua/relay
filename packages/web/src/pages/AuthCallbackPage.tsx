import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      navigate("/");
      return;
    }

    fetch(`/api/auth/callback?code=${code}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if ((data as { ok: boolean }).ok) {
          navigate("/dashboard");
        } else {
          navigate("/");
        }
      })
      .catch(() => navigate("/"));
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-gray-400">
      Authenticating…
    </div>
  );
}
