/**
 * Middleware de auth: mantém a sessão Supabase fresca a cada request
 * (refresh do token), redireciona pra /login quando não há sessão e
 * faz gating por role:
 *   - cliente externo: só pode acessar /portal/** (e públicas)
 *   - staff (admin/interno): qualquer rota interna
 *   - rota raiz "/" redireciona por role (cliente→/portal, staff→/foco)
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ['/login', '/auth/callback'];
const CLIENTE_ALLOWED = ['/portal'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get('next') || '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Role gating — só rola se há user e a rota não é pública.
  // Consultamos pessoas.role pelo user_id (RLS staff_all + cliente_self
  // cobre ambos os casos). Se a pessoa ainda não estiver vinculada,
  // deixamos passar — o DataProvider faz o RPC link no boot e o
  // próximo request já terá a role correta.
  if (user && !isPublic) {
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = pessoa?.role as 'admin' | 'interno' | 'cliente' | undefined;

    // "/" → redireciona por role
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'cliente' ? '/portal' : '/foco';
      return NextResponse.redirect(url);
    }

    // Cliente externo: bloqueia rotas internas
    if (role === 'cliente') {
      const allowed = CLIENTE_ALLOWED.some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
      );
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = '/portal';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  // Roda em tudo menos assets estáticos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
