"use client";

import Link from "next/link";
import { BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { LanguagePicker } from "./language-picker";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import { QuickAdd } from "./quick-add";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";

export function Topbar({
  name,
  email,
  categories,
  accounts,
  today,
}: {
  name: string;
  email: string;
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
      <Link href="/" className="lg:hidden" aria-label="JSuzuki Control">
        <BrandMark compact />
      </Link>
      <div className="flex-1" />
      <GlobalSearch />
      <QuickAdd categories={categories} accounts={accounts} today={today} />
      <div className="hidden sm:block">
        <LanguagePicker />
      </div>
      <div className="hidden sm:block">
        <ThemeToggle />
      </div>
      <NotificationBell />
      <UserMenu name={name} email={email} />
    </header>
  );
}
