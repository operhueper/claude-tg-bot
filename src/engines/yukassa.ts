import { randomUUID } from 'node:crypto';
import type { YuKassaPayment } from '../types.js';

const BASE = 'https://api.yookassa.ru/v3';

function auth(): string {
  return 'Basic ' + Buffer.from(
    `${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`
  ).toString('base64');
}

function idempotencyKey(): string {
  return randomUUID();
}

export async function createBindingPayment(params: {
  userId: number;
  returnUrl: string;
}): Promise<{ id: string; confirmationUrl: string }> {
  const res = await fetch(`${BASE}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': auth(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotencyKey(),
    },
    body: JSON.stringify({
      amount: { value: '1.00', currency: 'RUB' },
      capture: true,
      save_payment_method: true,
      confirmation: { type: 'redirect', return_url: params.returnUrl },
      description: 'Привязка карты для Proboi Профи (1 ₽)',
      metadata: { userId: String(params.userId), purpose: 'card_binding' },
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as any;
    const errCode = errBody?.code ?? errBody?.type ?? 'unknown';
    console.error(`[yukassa] createBindingPayment failed: ${res.status} ${errCode}`);
    throw new Error(`Ошибка оплаты: ${res.status}`);
  }
  const data = await res.json() as any;
  return { id: data.id, confirmationUrl: data.confirmation.confirmation_url };
}

export async function chargeRecurring(params: {
  userId: number;
  paymentMethodId: string;
  amount: string;
  description: string;
}): Promise<YuKassaPayment> {
  const res = await fetch(`${BASE}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': auth(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotencyKey(),
    },
    body: JSON.stringify({
      amount: { value: params.amount, currency: 'RUB' },
      capture: true,
      payment_method_id: params.paymentMethodId,
      description: params.description,
      metadata: { userId: String(params.userId), purpose: 'recurring_subscription' },
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as any;
    const errCode = errBody?.code ?? errBody?.type ?? 'unknown';
    console.error(`[yukassa] chargeRecurring failed: ${res.status} ${errCode}`);
    throw new Error(`Ошибка оплаты: ${res.status}`);
  }
  return res.json() as Promise<YuKassaPayment>;
}

export async function getPayment(paymentId: string): Promise<YuKassaPayment> {
  const res = await fetch(`${BASE}/payments/${paymentId}`, {
    headers: { 'Authorization': auth() },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as any;
    const errCode = errBody?.code ?? errBody?.type ?? 'unknown';
    console.error(`[yukassa] getPayment failed: ${res.status} ${errCode}`);
    throw new Error(`Ошибка оплаты: ${res.status}`);
  }
  return res.json() as Promise<YuKassaPayment>;
}
