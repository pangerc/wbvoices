"use client";

import { LoginForm } from "@/components/LoginForm";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const hasGoogle = !!process.env.NEXT_PUBLIC_HAS_GOOGLE_PROVIDER;

  const errorMessage =
    error === "AccessDenied"
      ? "This email domain is not allowed. Use your company email."
      : error
        ? "Something went wrong. Please try again."
        : null;

  return <LoginForm error={errorMessage} hasGoogleProvider={hasGoogle} callbackUrl={callbackUrl} />;
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
