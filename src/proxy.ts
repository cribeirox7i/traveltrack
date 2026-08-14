import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  if (pathname.startsWith("/admin") && (!isLoggedIn || role !== "admin")) {
    return NextResponse.redirect(new URL(isLoggedIn ? "/trips" : "/login", req.url));
  }

  if (pathname.startsWith("/trips") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/trips/:path*"],
};
