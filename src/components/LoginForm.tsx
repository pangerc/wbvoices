"use client";

import React, { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";

interface LoginFormProps {
  error?: string | null;
  hasGoogleProvider?: boolean;
  callbackUrl?: string;
}

export function LoginForm({ error: serverError, hasGoogleProvider, callbackUrl = "/" }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(serverError || "");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("resend", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === "AccessDenied") {
          setError("This email domain is not allowed. Use your company email.");
        } else {
          setError("Failed to send sign-in link. Please try again.");
        }
      } else {
        setEmailSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-50">
      {/* Aleph Creative Audio Logo */}
      <div className="absolute top-8 left-8">
        <Image
          src="/aca.svg"
          alt="Aleph Creative Audio"
          width={180}
          height={37}
          className="h-8 w-auto"
        />
      </div>

      {/* Login Form */}
      <div className="w-full max-w-md">
        <div
          className="relative p-8 bg-black/40 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.2),0_0_32px_rgba(0,0,0,0.4),0_8px_32px_rgba(0,0,0,0.2)]"
          style={{
            backdropFilter: "blur(24px) saturate(1.8) brightness(1.1)",
          }}
        >
          {/* Premium inner highlight */}
          <div
            className="absolute inset-x-4 top-0 h-px rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 20%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.4) 80%, transparent 100%)",
              filter: "blur(0.5px)",
            }}
          />

          {/* Subtle ambient glow */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)",
              filter: "blur(12px)",
              transform: "scale(1.1)",
            }}
          />

          {emailSent ? (
            <div className="relative text-center">
              <div className="text-4xl mb-4">✉️</div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Check your email
              </h1>
              <p className="text-gray-400 mb-6">
                We sent a sign-in link to <span className="text-white">{email}</span>
              </p>
              <button
                onClick={() => { setEmailSent(false); setEmail(""); }}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="relative text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">
                  Aleph Creative Audio
                </h1>
                <p className="text-gray-400">
                  Sign in with your company email
                </p>
              </div>

              <div className="relative space-y-4">
                {/* Magic Link Form */}
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="sr-only">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@alephholding.com"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent backdrop-blur-sm"
                      required
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>

                  {error && (
                    <div className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded-xl font-medium transition-all duration-200 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Sending link..." : "Send sign-in link"}
                  </button>
                </form>

                {/* Google OAuth (conditional) */}
                {hasGoogleProvider && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-gray-500 text-sm">or</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>

                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-3"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      Sign in with Google
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-gray-500 text-sm">
          Aleph Creative Audio • Voice Ad Generation for Spotify Sales Teams
        </p>
      </div>
    </div>
  );
}
