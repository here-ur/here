/** 프로토타입의 아래에서 올라오는 시트. Stage(relative) 안에 둔다. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex animate-fade items-end bg-ink/35" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88%] w-full animate-rise overflow-y-auto rounded-t-[30px] bg-white px-5 pt-[22px] pb-[30px]"
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="h-[34px] rounded-[11px] px-3 text-[13px] font-semibold ring-[1.5px] ring-ink/10 ring-inset">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
