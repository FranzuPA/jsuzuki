import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "fc_session";

/**
 * Primera barrera de las rutas privadas: si no hay cookie de sesion, al login.
 * La validacion real del token la hace cada layout y cada route handler contra
 * la base de datos; esto solo evita cargar paginas privadas sin credencial.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isAuthRoute = pathname === "/login" || pathname === "/register";

  if (!hasCookie && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasCookie && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Todo menos los recursos estaticos, la API de autenticacion y los archivos de la PWA.
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|offline.html).*)",
  ],
};
