import type { ConversationMessage } from '@/types';

export function DeliveryStatus({ message }: { message: ConversationMessage }) {
  if (message.direction !== 'outbound') return null;
  const label = {
    sent: 'Enviado',
    delivered: 'Entregado',
    read: 'Leído',
    failed: 'No entregado · revisar',
  };
  return <span className={message.deliveryStatus === 'failed' ? 'font-medium text-red-700' : message.deliveryStatus === 'read' ? 'text-blue-700' : 'text-gray-600'}>{message.deliveryStatus ? label[message.deliveryStatus] : 'Sin confirmación de entrega'}</span>;
}
