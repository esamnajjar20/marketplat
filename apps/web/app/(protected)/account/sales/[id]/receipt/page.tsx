import ReceiptPage from '@/components/sales/ReceiptPageClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceiptRoute({ params }: Props) {
  const { id } = await params;
  return <ReceiptPage id={id} />;
}
