/**
 * فاصل «أو» بين زر الإرسال وزر Google.
 */
export function AuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-[#EAE3D6]" />
      </div>
      <div className="relative flex justify-center text-[12px]">
        <span className="bg-white px-3 text-[#A39E94]">أو</span>
      </div>
    </div>
  );
}
