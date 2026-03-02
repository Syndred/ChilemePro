'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  const handleSuccess = useCallback(
    (_userId: string, isNewUser: boolean) => {
      if (isNewUser) {
        router.push('/onboarding');
      } else {
        router.push('/');
      }
    },
    [router],
  );

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(165deg,#fff8ed_0%,#fff3dc_35%,#ffffff_100%)] px-4 py-8">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-[-40px] h-64 w-64 rounded-full bg-amber-200/35 blur-3xl" />
      <div className="pointer-events-none absolute left-[-50px] top-[30%] h-52 w-52 rounded-full bg-yellow-200/25 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <LoginForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
