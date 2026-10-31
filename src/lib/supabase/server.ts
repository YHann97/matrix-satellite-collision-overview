import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient(cookieStore?: ReturnType<typeof cookies>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore?.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore?.set({ name, value, ...options });
        } catch (error) {
          // Handled in server components
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStore?.set({ name, value: '', ...options });
        } catch (error) {
          // Handled in server components
        }
      },
    },
  });
}
