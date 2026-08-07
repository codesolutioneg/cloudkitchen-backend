import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../prisma/client';
import { config } from '../../config';

const UPLOAD_ROOT = config.UPLOAD_PATH ?? './uploads';

const BRAND = '#1d4ed8';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

function money(value: unknown, currency: string) {
  const n = Number(value ?? 0);
  return `${n.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export async function generateOrderReceipt(orderId: string): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, is_deleted: false },
    include: {
      items: true,
      company: { select: { legal_name: true, trade_name: true } },
      payment: true,
    },
  });
  if (!order) return null;

  await mkdir(UPLOAD_ROOT, { recursive: true });

  const fileId = randomUUID();
  const fileName = `receipt-${order.order_number}.pdf`;
  const storageKey = path.join('receipts', `${fileId}.pdf`);
  const absolutePath = path.join(UPLOAD_ROOT, storageKey);

  await mkdir(path.dirname(absolutePath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = createWriteStream(absolutePath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const companyName = order.company.trade_name ?? order.company.legal_name;
    const deliveryDate = order.requested_delivery_at.toLocaleString('en-EG', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const issuedAt = new Date().toLocaleString('en-EG', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Header band
    doc.save();
    doc.rect(left, 48, pageWidth, 72).fill(BRAND);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Cloud Kitchen', left + 20, 62);
    doc.font('Helvetica').fontSize(11).text('Official payment receipt', left + 20, 92);
    doc.fontSize(10).text(`Receipt #${order.order_number}`, left + pageWidth - 180, 92, { width: 160, align: 'right' });
    doc.restore();
    doc.y = 140;

    // Meta cards
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Bill to', left, doc.y);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(companyName, left, doc.y + 14);

    const metaX = left + pageWidth / 2;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Order details', metaX, 140);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    doc.text(`Order: ${order.order_number}`, metaX, 154);
    doc.text(`Delivery: ${deliveryDate}`, metaX, 168);
    doc.text(`Fulfillment: ${order.fulfillment_type}`, metaX, 182);
    doc.text(`Issued: ${issuedAt}`, metaX, 196);
    if (order.payment?.reviewed_at && order.payment.status === 'approved') {
      doc.text(
        `Payment approved: ${order.payment.reviewed_at.toLocaleString('en-EG', { timeZone: 'Africa/Cairo' })}`,
        metaX,
        210,
      );
    }

    doc.y = 240;
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor(BORDER).stroke();
    doc.y += 16;

    // Items table header
    const colQty = 48;
    const colPrice = 90;
    const colTotal = 90;
    const colItem = pageWidth - colQty - colPrice - colTotal;
    const rowY = doc.y;

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
    doc.text('Item', left, rowY, { width: colItem });
    doc.text('Qty', left + colItem, rowY, { width: colQty, align: 'center' });
    doc.text('Unit', left + colItem + colQty, rowY, { width: colPrice, align: 'right' });
    doc.text('Total', left + colItem + colQty + colPrice, rowY, { width: colTotal, align: 'right' });
    doc.y = rowY + 18;
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor(BORDER).stroke();
    doc.y += 8;

    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    for (const item of order.items) {
      const y = doc.y;
      const unit = Number(item.line_total) / Math.max(1, item.quantity);
      doc.text(item.product_name_snapshot, left, y, { width: colItem });
      doc.text(String(item.quantity), left + colItem, y, { width: colQty, align: 'center' });
      doc.text(money(unit, order.currency), left + colItem + colQty, y, { width: colPrice, align: 'right' });
      doc.text(money(item.line_total, order.currency), left + colItem + colQty + colPrice, y, {
        width: colTotal,
        align: 'right',
      });
      doc.y = y + Math.max(16, doc.heightOfString(item.product_name_snapshot, { width: colItem }) + 4);
    }

    doc.y += 8;
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor(BORDER).stroke();
    doc.y += 14;

    const totalsX = left + pageWidth - 220;
    const totalsVal = left + pageWidth - 90;
    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(bold ? '#0f172a' : MUTED);
      doc.text(label, totalsX, doc.y, { width: 120 });
      doc.text(value, totalsVal, doc.y, { width: 90, align: 'right' });
      doc.y += bold ? 20 : 16;
    };

    line('Subtotal', money(order.subtotal_amount, order.currency));
    line('Tax', money(order.tax_amount, order.currency));
    line('Total paid', money(order.total_amount, order.currency), true);

    doc.y += 12;
    doc.roundedRect(left, doc.y, pageWidth, 52, 8).fillAndStroke('#f0fdf4', '#bbf7d0');
    doc.fillColor('#166534').font('Helvetica-Bold').fontSize(11).text('Payment confirmed', left + 16, doc.y + 12);
    doc.font('Helvetica').fontSize(9).text('Thank you for your order. This document serves as proof of payment.', left + 16, doc.y + 28, {
      width: pageWidth - 32,
    });

    doc.y += 72;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Cloud Kitchen B2B · cloud-kitchen.code-solution.org', left, doc.y, {
      width: pageWidth,
      align: 'center',
    });

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const stat = await import('node:fs/promises').then((fs) => fs.stat(absolutePath));

  const file = await prisma.file.create({
    data: {
      id: fileId,
      file_name: fileName,
      mime_type: 'application/pdf',
      size_bytes: BigInt(stat.size),
      storage_provider: 'local',
      storage_key: storageKey,
      uploaded_by_type: 'system',
      uploaded_by_id: null,
    },
  });

  await prisma.fileAttachment.create({
    data: {
      file_id: file.id,
      entity_type: 'order',
      entity_id: orderId,
      attachment_type: 'receipt_pdf',
      caption: `Receipt ${order.order_number}`,
    },
  });

  return file.id;
}
