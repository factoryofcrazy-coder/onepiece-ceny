import { NextRequest, NextResponse } from "next/server";

// Stará adresa presmeruje ľudí na hlavnú doménu. /api a /engine ostávajú bez presmerovania:
// používa ich online hra (Edge Function), Vercel Cron a GitHub Actions.
const OLD_HOST = "grand-line-tracker-gilt.vercel.app";
const SITE = "https://www.grand-line.eu";

export function middleware(req: NextRequest) {
  if (req.headers.get("host") !== OLD_HOST) return NextResponse.next();
  return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, SITE), 308);
}

export const config = { matcher: "/((?!api|engine|_next|.*\\..*).*)" };
