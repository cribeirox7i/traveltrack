import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { excedeuLimite, limparLimite } from "@/lib/rateLimit";
import { findUserByEmail, verifyPassword } from "@/lib/sheets/users";
import type { Role } from "@/lib/sheets/types";

/** 10 tentativas por email+IP a cada 10 minutos - folgado pra quem erra a senha, apertado pra
 * quem varre uma lista de senhas. Estourar devolve a mesma falha genérica de senha errada, pra
 * não revelar nem que o bloqueio existe nem se o email existe. */
const LOGIN_LIMITE = 10;
const LOGIN_JANELA_MS = 10 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const senha = credentials?.senha as string | undefined;
        if (!email || !senha) return null;

        const ip =
          request.headers?.get("x-forwarded-for")?.split(",")[0].trim() ?? "sem-ip";
        const chave = `login:${email.toLowerCase()}:${ip}`;
        if (excedeuLimite(chave, { limite: LOGIN_LIMITE, janelaMs: LOGIN_JANELA_MS })) {
          return null;
        }

        const user = await findUserByEmail(email);
        if (!user || user.ativo !== "true") return null;

        const valid = await verifyPassword(user, senha);
        if (!valid) return null;

        limparLimite(chave);
        return {
          id: user.id,
          name: user.nome,
          email: user.email,
          role: user.role,
          ambiente_id: user.ambiente_id ?? "",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.ambiente_id = (user as { ambiente_id?: string }).ambiente_id ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.ambiente_id = (token.ambiente_id as string | undefined) ?? "";
      }
      return session;
    },
  },
});
