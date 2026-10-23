import { Icon } from "./art";

/** 아래에서 올라오는 시트. 화면(main, relative) 안에 둔다. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex animate-fade items-end bg-[rgba(20,28,60,.32)] backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88%] w-full animate-rise overflow-y-auto rounded-t-[32px] bg-white px-5 pt-3 pb-8 shadow-[0_-10px_40px_rgba(20,28,60,.15)]"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D9DDE7]" />
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#111318]">{title}</h2>
          <button onClick={onClose} aria-label="닫기" className="grid size-11 place-items-center rounded-full bg-[#F2F4F8] text-[#3D4559]">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
