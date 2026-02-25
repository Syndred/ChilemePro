"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, BarChart3, Users, User } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/stats", label: "统计", icon: BarChart3 },
  { href: "/add-meal", label: "添加", icon: PlusCircle, isCenter: true },
  { href: "/social", label: "社交", icon: Users },
  { href: "/profile", label: "我的", icon: User },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="relative flex flex-col items-center gap-0.5 px-3 py-2"
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.isCenter ? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  ) : (
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`text-[10px] leading-tight transition-colors ${
                      item.isCenter
                        ? "font-medium text-primary"
                        : isActive
                          ? "font-medium text-primary"
                          : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive && !item.isCenter && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute -top-1 h-0.5 w-5 rounded-full bg-primary"
                      transition={{
                        type: "spring",
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
