import { CreateRequestForm } from '@/components/requests/CreateRequestForm';

export default function NewRequestPage() {
  return (
    <div className="space-y-4 p-4" dir="rtl">
      <h1 className="text-center text-xl font-semibold">نشر طلب / احتياج</h1>
      <CreateRequestForm />
    </div>
  );
}
