"use client";

import React, { useState } from "react";
import Image from "next/image";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || "Invalid access code");
      }
    } catch (error) {
      setError("Something went wrong. Please try again.");
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
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
          <div className="relative text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              Access Aleph Creative Audio
            </h1>
            <p className="text-gray-400">Enter the access code to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="relative space-y-6">
            <div>
              <label htmlFor="password" className="sr-only">
                Access Code
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Access code"
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
              disabled={isLoading || !password.trim()}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white rounded-xl font-medium transition-all duration-200 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Verifying..." : "Enter"}
            </button>
          </form>
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
