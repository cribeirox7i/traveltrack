export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-4xl">🔌</p>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sem conexão</h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Esta página ainda não tinha sido aberta com internet neste aparelho, então não dá pra
        carregar agora sem sinal. Da próxima vez que estiver conectado, toque no ícone de
        download da barra do topo: ele prepara as telas do app e as viagens marcadas
        &quot;Dados offline&quot; para funcionarem sem internet.
      </p>
    </div>
  );
}
