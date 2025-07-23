import { useEffect } from "react";

export default function Login() {
  useEffect(() => {
    // Force redirect to Azure AD login
    window.location.href = "/.auth/login/aad";
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-center">
      <h1 className="text-2xl mb-6 font-bold text-gray-800">Redirecting to Azure login...</h1>
      <p className="text-gray-500">
        If you are not redirected,{" "}
        <a href="/.auth/login/aad" className="underline text-blue-600">
          click here to sign in
        </a>.
      </p>
    </div>
  );
}
