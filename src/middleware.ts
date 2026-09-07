import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { isDashboardRoutePath, routeScopeFromSlug } from "@/lib/routing/routes";
import type { Database } from "@/lib/supabase/database.types";

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  const route = scopedRoute(request);
  if (route?.kind === "redirect") return route.response;

  const requestHeaders = route?.headers ?? request.headers;

  if (!isSupabaseConfigured()) {
    return responseForRoute(request, route, requestHeaders);
  }

  const env = getPublicEnv();
  let response = responseForRoute(request, route, requestHeaders);

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          const refreshedHeaders = new Headers(requestHeaders);
          refreshedHeaders.set("cookie", request.cookies.toString());
          response = responseForRoute(request, route, refreshedHeaders);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

type ScopedRoute =
  | { kind: "redirect"; response: NextResponse }
  | { kind: "rewrite"; rewriteUrl: URL; headers: Headers };

function scopedRoute(request: NextRequest): ScopedRoute | null {
  const { pathname, search } = request.nextUrl;

  if (isDashboardRoutePath(pathname)) {
    return { kind: "redirect", response: NextResponse.redirect(new URL("/", request.url)) };
  }

  const segments = pathname.split("/").filter(Boolean);
  const [scopeSlug, ...rest] = segments;
  if (!scopeSlug || rest.length === 0) return null;

  const innerPath = `/${rest.join("/")}`;
  if (!isDashboardRoutePath(innerPath)) return null;

  const scope = routeScopeFromSlug(scopeSlug);
  const headers = new Headers(request.headers);
  headers.set("x-route-scope", scope.slug);
  headers.set("x-route-scope-kind", scope.kind);

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = innerPath;
  rewriteUrl.search = search;

  return { kind: "rewrite", rewriteUrl, headers };
}

function responseForRoute(request: NextRequest, route: ScopedRoute | null, headers: Headers): NextResponse {
  if (route?.kind === "rewrite") {
    return NextResponse.rewrite(route.rewriteUrl, { request: { headers } });
  }

  return NextResponse.next({ request: { headers } });
}
