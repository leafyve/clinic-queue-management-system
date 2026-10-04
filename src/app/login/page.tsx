import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { PreviewBanner } from "@/components/preview-banner";

export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() { return <><PreviewBanner /><section className="page-shell grid min-h-[calc(100vh-76px)] place-items-center py-14"><div className="w-full max-w-md"><h1 className="text-4xl font-semibold">Welcome back</h1><p className="mt-3 text-lg text-muted-foreground">Patients use a mobile one-time code. Clinic staff use their work email.</p><Suspense fallback={<div className="surface mt-8 h-72 animate-pulse bg-muted" />}><LoginForm /></Suspense></div></section></>; }
