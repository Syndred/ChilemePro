'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  PlusCircle,
  BarChart3,
  Users,
  User,
  Loader2,
  LogIn,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/stats', label: '统计', icon: BarChart3 },
  { href: '/add-meal', label: '添加', icon: PlusCircle, isCenter: true },
  { href: '/social', label: '社交', icon: Users },
  { href: '/profile', label: '我的', icon: User },
];

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const loginHref = useMemo(
    () => `/login?next=${encodeURIComponent(pathname || '/')}`,
    [pathname],
  );

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) {
        return;
      }
      setAuthStatus(user ? 'authenticated' : 'unauthenticated');
    };

    void checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }
      setAuthStatus(session?.user ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (authStatus === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在检查登录状态...
        </p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-orange-50/50 via-amber-50/30 to-background px-4 py-10">
        <Card className="w-full max-w-sm border-orange-200/70 bg-white/95 shadow-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-lg">请先登录</CardTitle>
            <p className="text-sm text-muted-foreground">
              登录后可查看饮食记录、统计、挑战和社交动态。
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={loginHref}>
                <LogIn className="mr-2 h-4 w-4" />
                去登录
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 pb-20">{children}</main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm"
        role="navigation"
        aria-label="主导航"
      >
        <ul className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="relative flex flex-col items-center gap-0.5 px-3 py-2"
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.isCenter ? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  ) : (
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`text-[10px] leading-tight transition-colors ${
                      item.isCenter
                        ? 'font-medium text-primary'
                        : isActive
                          ? 'font-medium text-primary'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive && !item.isCenter && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute -top-1 h-0.5 w-5 rounded-full bg-primary"
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
