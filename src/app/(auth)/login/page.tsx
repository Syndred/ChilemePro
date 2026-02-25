'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  const handleSuccess = useCallback(
    (userId: string, isNewUser: boolean) => {
      if (isNewUser) {
        router.push('/onboarding');
      } else {
        router.push('/');
      }
    },
    [router]
  );

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <LoginForm onSuccess={handleSuccess} />
    </div>
  );
}
