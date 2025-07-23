import { useEffect } from "react";

export default function Login() {
  useEffect(() => {
    fetch("/.auth/me")
      .then(res => res.json())
      .then(data => {
        if (data?.clientPrincipal) {
          window.location.href = "/ExistingDrafts"; // Redirect after login
        }
      });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-center">
      <h1 className="text-2xl mb-6 font-bold text-gray-800">Welcome to BMSS Billing Portal</h1>
      <a
        href="/.auth/login/aad"
        className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        Sign in with Azure AD
      </a>
    </div>
  );
}