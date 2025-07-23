import { useEffect } from "react";

export default function Login() {
  useEffect(() => {
    fetch("/.auth/me")
      .then(res => res.json())
      .then(data => {
        const user = data?.clientPrincipal;

        if (user) {
          // ✅ Already logged in → redirect to home page
          window.location.href = "/ExistingDrafts";
        } else {
          // ❌ Not logged in → auto-start Azure AD login
          window.location.href = "/.auth/login/aad";
        }
      });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-center">
      <h1 className="text-2xl mb-6 font-bold text-gray-800">Redirecting to sign-in…</h1>
      <p className="text-gray-500">If nothing happens, <a className="underline text-blue-600" href="/.auth/login/aad">click here to sign in</a>.</p>
    </div>
  );
}
