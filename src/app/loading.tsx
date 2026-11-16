export default function AppLoading() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-navy-900">
      <div className="grid justify-items-center gap-3">
        <span aria-hidden="true" className="size-7 rounded-full border-[3px] border-green-100 border-t-green-700 motion-safe:animate-spin" />
        <p role="status" className="font-semibold">Đang mở OOPS…</p>
      </div>
    </main>
  );
}
