import { DefaultSession } from "next-auth";
import type { Role } from "@/lib/sheets/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Ambiente (tenant) a que o usuário pertence. Vazio só pro admin global, que não é preso
       * a um ambiente - ver `ambienteAtivo` em `lib/api-helpers.ts` pro ambiente que ele
       * escolheu no seletor. */
      ambiente_id: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    ambiente_id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    ambiente_id: string;
  }
}
