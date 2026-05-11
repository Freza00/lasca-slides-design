import { NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Lemon Squeezy webhook handler.
 * Verifies signature, processes order_created events.
 * Returns license key info for the frontend to store in localStorage.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Verify signature
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature');
  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 401 });
  }

  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (hmac !== signature) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventName = payload.meta?.event_name;

  if (eventName === 'order_created') {
    const order = payload.data?.attributes;
    const licenseKey = payload.meta?.custom_data?.license_key;

    // In production, you'd store this in a database or KV store.
    // For Lasca's local-first model, the license key is passed back
    // to the frontend via Lemon Squeezy's redirect URL.
    console.log('Order created:', {
      orderId: order?.order_number,
      email: order?.user_email,
      total: order?.total_formatted,
      licenseKey,
    });

    return Response.json({ received: true });
  }

  if (eventName === 'license_key_created') {
    const key = payload.data?.attributes?.key;
    console.log('License key created:', key);
    return Response.json({ received: true });
  }

  return Response.json({ received: true, event: eventName });
}
